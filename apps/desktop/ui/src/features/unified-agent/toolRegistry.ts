import type { ChatMessage, ProjectFileNode, ProjectPatchFileSummary, ProviderProfile } from '../../app/types';
import { activateAccessibility, inspectAccessibility } from './nativeClient';
import { sendProviderChatStream } from '../providers/providerClientReliable';
import { classifyPrivacy, isLocalProviderId } from '../privacy/contentClassifier';
import { compareResponses, formatStructuredComparison, type ComparisonResponse } from '../comparison/structuredDiff';
import { loadProjectRoot, loadProviderProfiles } from '../../app/store';
import { providerDefinition } from '../../app/providerRegistry';
import {
  applyProjectChangeSession,
  projectGitDiff,
  projectGitStatus,
  readProjectFile,
  reopenProjectFolder,
  runProjectPreset,
  scanProject,
} from '../projects/projectClient';
import {
  composeSelectedPatch,
  extractUnifiedDiff,
  parseUnifiedDiff,
} from '../projects/projectChangeSession';
import {
  captureScreen,
  clickPointer,
  openApplication,
  pressKey,
  typeText,
  withComputerRuntimeParent,
} from '../computer/computerClientReliable';
import type {
  ApprovalResolution,
  UnifiedApprovalRequest,
  UnifiedToolCall,
  UnifiedToolObservation,
} from './types';

const ALLOWED_CHECKS = new Set([
  'npm-typecheck',
  'npm-test',
  'npm-build',
  'cargo-check',
  'cargo-test',
]);
const ALLOWED_APPS = new Set(['TextEdit', 'Notes', 'Safari', 'Finder', 'Terminal', 'System Settings']);
const ALLOWED_KEYS = new Set(['enter', 'escape', 'tab', 'space', 'delete', 'cmd+n', 'cmd+s', 'cmd+l', 'cmd+w']);
const SEARCHABLE = /\.(?:[cm]?[jt]sx?|rs|py|go|java|kt|swift|vue|svelte|css|scss|less|html?|json|ya?ml|toml|md|txt|sh|sql)$/i;
const MAX_SEARCH_FILES = 80;
const MAX_SEARCH_BYTES = 900_000;
const MAX_OUTPUT = 24_000;

export interface UnifiedToolContext {
  runId: string;
  eventId: string;
  readPaths: Set<string>;
  ownedPaths: Set<string>;
  latestScreenshotDataUrl?: string;
  latestAccessibility?: { app?: string; maxIndex: number; elements: Array<{ index: number; role: string; title: string; enabled: boolean; actions: string[] }> };
  requestApproval: (request: Omit<UnifiedApprovalRequest, 'id' | 'createdAt' | 'status'>) => Promise<ApprovalResolution>;
  signal: AbortSignal;
  requestTimeoutMs: number;
  updateEvent: (patch: {
    patchFiles?: ProjectPatchFileSummary[];
    selectedPaths?: string[];
    sessionId?: string;
    screenshotDataUrl?: string;
    summary?: string;
  }) => void;
}

function valueText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function valueNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizePath(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) throw new Error('A project-relative path is required.');
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error('Unsafe project path.');
  return segments.join('/');
}

function flatten(nodes: ProjectFileNode[]): ProjectFileNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flatten(node.children) : [])]);
}

function clip(value: string, max = MAX_OUTPUT): string {
  const normalized = value.replace(/\u0000/g, '');
  return normalized.length > max ? `${normalized.slice(0, max)}\n…[truncated]` : normalized;
}


function stringArray(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => valueText(entry)).filter(Boolean).slice(0, limit);
}

function providerReady(profile: ProviderProfile): boolean {
  const definition = providerDefinition(profile.providerId);
  return profile.providerId !== 'local-demo' && profile.enabled && (!definition.requiresCredential || profile.credentialStored || isLocalProviderId(profile.providerId));
}

function providerSummary(profile: ProviderProfile): string {
  const definition = providerDefinition(profile.providerId);
  return [
    `id=${profile.id}`,
    `name=${profile.displayName}`,
    `model=${profile.model}`,
    `provider=${profile.providerId}`,
    `local=${definition.capabilities.local}`,
    `ready=${providerReady(profile)}`,
  ].join('\t');
}

async function runComparisonProvider(
  profile: ProviderProfile,
  prompt: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<ComparisonResponse> {
  let streamed = '';
  const messages: Pick<ChatMessage, 'role' | 'content'>[] = [{ role: 'user', content: prompt }];
  const reply = await sendProviderChatStream(
    profile,
    messages,
    timeoutMs,
    profile.model,
    [],
    false,
    {
      onDelta: (delta) => { streamed += delta; },
      onReasoning: () => undefined,
      onStatus: () => undefined,
    },
    signal,
    { task: 'multi-model-comparison', role: 'comparison-provider', signal },
  );
  if (!reply.ok) throw new Error(reply.errorMessage || reply.content || `${profile.displayName} did not return a usable response.`);
  return {
    id: profile.id,
    label: `${profile.displayName} · ${profile.model}`,
    content: streamed || reply.content || '',
  };
}

async function compareModels(call: UnifiedToolCall, context: UnifiedToolContext): Promise<UnifiedToolObservation> {
  const prompt = valueText(call.args.prompt);
  if (prompt.length < 2 || prompt.length > 12_000) throw new Error('models.compare requires a 2–12,000 character prompt.');
  const profileIds = [...new Set(stringArray(call.args.profileIds, 3))];
  if (profileIds.length < 2 || profileIds.length > 3) throw new Error('models.compare requires 2–3 distinct profileIds. Call models.list first.');
  const allProfiles = loadProviderProfiles();
  const profiles = profileIds.map((id) => allProfiles.find((entry) => entry.id === id));
  const missing = profileIds.filter((_, index) => !profiles[index]);
  if (missing.length) throw new Error(`Unknown provider profile(s): ${missing.join(', ')}. Call models.list again.`);
  const selected = profiles as ProviderProfile[];
  const notReady = selected.filter((profile) => !providerReady(profile));
  if (notReady.length) throw new Error(`Provider profile(s) are not configured: ${notReady.map((entry) => entry.displayName).join(', ')}.`);
  const privacy = classifyPrivacy({ text: prompt });
  const remoteNames = selected.filter((profile) => !isLocalProviderId(profile.providerId)).map((profile) => profile.displayName);
  const resolution = await context.requestApproval({
    runId: context.runId,
    toolEventId: context.eventId,
    toolName: call.name,
    title: `Compare ${selected.length} models`,
    detail: [
      `Send the same reviewed prompt to: ${selected.map((profile) => `${profile.displayName} (${profile.model})`).join(', ')}.`,
      `Privacy preflight: ${privacy.route}, score ${privacy.score}/100.`,
      privacy.reasons.length ? `Signals: ${privacy.reasons.join('; ')}.` : '',
      remoteNames.length ? `Remote providers: ${remoteNames.join(', ')}. This action may consume tokens.` : 'All selected providers are local.',
    ].filter(Boolean).join(' '),
  });
  if (!resolution.approved) return { callId: call.id, name: call.name, ok: false, summary: 'The user denied multi-model comparison.' };

  const responses: ComparisonResponse[] = [];
  const failures: string[] = [];
  for (const profile of selected) {
    if (context.signal.aborted) throw new DOMException(String(context.signal.reason || 'Stopped by user.'), 'AbortError');
    try {
      responses.push(await runComparisonProvider(profile, prompt, context.requestTimeoutMs, context.signal));
    } catch (error) {
      failures.push(`${profile.displayName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (responses.length < 2) {
    return {
      callId: call.id,
      name: call.name,
      ok: false,
      summary: 'Fewer than two providers returned usable responses.',
      output: clip(failures.join('\n')),
    };
  }
  const comparison = compareResponses(responses);
  const formatted = formatStructuredComparison(responses, comparison);
  const responseSections = responses.map((response) => `\n===== ${response.label} =====\n${response.content.slice(0, 6_000)}`).join('\n');
  const failureSection = failures.length ? `\n\nProvider failures:\n${failures.join('\n')}` : '';
  return {
    callId: call.id,
    name: call.name,
    ok: true,
    summary: `Compared ${responses.length} model responses with ${comparison.potentialDisagreements.length} potential disagreement(s).`,
    output: clip(`${formatted}${responseSections}${failureSection}`),
  };
}

async function ensureProject(): Promise<string> {
  const root = loadProjectRoot().trim();
  if (!root) throw new Error('No project is attached. Choose a project folder in the workspace first.');
  const reopened = await reopenProjectFolder(root);
  if (!reopened) throw new Error('The saved project folder is unavailable. Choose it again.');
  return root;
}

function requiresPriorRead(file: ProjectPatchFileSummary): string[] {
  if (file.action === 'add') return [];
  if (file.action === 'rename') return [file.oldPath || file.path].filter(Boolean) as string[];
  return [file.action === 'delete' ? (file.oldPath || file.path) : file.path];
}

function scopeDiffToOwnedPaths(diff: string, ownedPaths: Set<string>): string {
  if (!ownedPaths.size) return diff;
  const files = parseUnifiedDiff(diff);
  return composeSelectedPatch(files, ownedPaths);
}

async function projectSearch(call: UnifiedToolCall, context: UnifiedToolContext): Promise<UnifiedToolObservation> {
  await ensureProject();
  const query = valueText(call.args.query);
  if (query.length < 2 || query.length > 200) throw new Error('project.search requires a 2–200 character query.');
  const prefix = valueText(call.args.pathPrefix).replace(/^\.\//, '');
  const maxResults = Math.min(50, Math.max(1, valueNumber(call.args.maxResults) || 20));
  const tree = await scanProject();
  const candidates = flatten(tree)
    .filter((node) => node.kind === 'file' && node.size <= 300_000 && SEARCHABLE.test(node.path))
    .filter((node) => !prefix || node.path.startsWith(prefix))
    .sort((a, b) => {
      const qa = a.path.toLowerCase().includes(query.toLowerCase()) ? -1 : 0;
      const qb = b.path.toLowerCase().includes(query.toLowerCase()) ? -1 : 0;
      return qa - qb || a.size - b.size || a.path.localeCompare(b.path);
    })
    .slice(0, MAX_SEARCH_FILES);
  const needle = query.toLowerCase();
  const hits: string[] = [];
  let totalBytes = 0;
  for (const node of candidates) {
    if (hits.length >= maxResults || totalBytes >= MAX_SEARCH_BYTES) break;
    const result = await readProjectFile(node.path);
    if (!result.ok || result.binary) continue;
    totalBytes += result.size;
    const lines = result.content.split(/\r?\n/);
    for (let index = 0; index < lines.length && hits.length < maxResults; index += 1) {
      if (!lines[index].toLowerCase().includes(needle)) continue;
      hits.push(`${node.path}:${index + 1}: ${lines[index].trim().slice(0, 500)}`);
    }
  }
  const output = hits.length ? hits.join('\n') : `No matches for ${JSON.stringify(query)} in ${candidates.length} inspected files.`;
  return { callId: call.id, name: call.name, ok: true, summary: `${hits.length} search result(s).`, output };
}

async function proposePatch(call: UnifiedToolCall, context: UnifiedToolContext): Promise<UnifiedToolObservation> {
  await ensureProject();
  const patch = extractUnifiedDiff(valueText(call.args.patch));
  const files = parseUnifiedDiff(patch);
  if (!patch || !files.length) throw new Error('project.propose_patch requires a valid unified diff.');
  const unread = files.flatMap(requiresPriorRead)
    .map(normalizePath)
    .filter((path) => !context.readPaths.has(path));
  if (unread.length) {
    throw new Error(`Existing files must be read before editing: ${[...new Set(unread)].join(', ')}`);
  }
  const defaultPaths = files.map((file) => file.path);
  context.updateEvent({ patchFiles: files, selectedPaths: defaultPaths, summary: `${files.length} file(s) awaiting review.` });
  const resolution = await context.requestApproval({
    runId: context.runId,
    toolEventId: context.eventId,
    toolName: call.name,
    title: 'Review project patch',
    detail: call.reason || 'The Agent proposes reviewed project changes.',
    patchFiles: files,
    selectedPaths: defaultPaths,
  });
  if (!resolution.approved) {
    return { callId: call.id, name: call.name, ok: false, summary: 'The user denied the proposed patch.' };
  }
  const selectedPaths = (resolution.selectedPaths?.length ? resolution.selectedPaths : defaultPaths)
    .map(normalizePath)
    .filter((path) => defaultPaths.includes(path));
  const selectedPatch = composeSelectedPatch(files, selectedPaths);
  if (!selectedPatch) return { callId: call.id, name: call.name, ok: false, summary: 'No files were selected for application.' };
  context.updateEvent({ selectedPaths });
  const result = await applyProjectChangeSession(selectedPatch, true);
  if (!result.ok) {
    return {
      callId: call.id,
      name: call.name,
      ok: false,
      summary: result.errorMessage || 'The reviewed patch could not be applied.',
      output: clip(JSON.stringify(result, null, 2)),
    };
  }
  selectedPaths.forEach((path) => context.ownedPaths.add(path));
  context.updateEvent({ sessionId: result.sessionId, summary: `${selectedPaths.length} selected file(s) applied.` });
  return {
    callId: call.id,
    name: call.name,
    ok: true,
    summary: `Applied ${selectedPaths.length} selected file(s) in transaction ${result.sessionId || 'unknown'}.`,
    output: clip(JSON.stringify(result, null, 2)),
    sessionId: result.sessionId,
  };
}

async function approvedSimpleAction(
  call: UnifiedToolCall,
  context: UnifiedToolContext,
  title: string,
  detail: string,
  operation: () => Promise<unknown>,
): Promise<UnifiedToolObservation> {
  const resolution = await context.requestApproval({
    runId: context.runId,
    toolEventId: context.eventId,
    toolName: call.name,
    title,
    detail,
  });
  if (!resolution.approved) return { callId: call.id, name: call.name, ok: false, summary: 'The user denied this action.' };
  const result = await operation();
  const record = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  const ok = Boolean(record.ok);
  const summary = valueText(record.message) || valueText(record.errorMessage) || (ok ? 'Completed.' : 'Action failed.');
  return { callId: call.id, name: call.name, ok, summary, output: clip(JSON.stringify(result, null, 2)) };
}

export async function executeUnifiedTool(
  call: UnifiedToolCall,
  context: UnifiedToolContext,
): Promise<UnifiedToolObservation> {
  switch (call.name) {
    case 'project.scan': {
      const root = await ensureProject();
      const nodes = await scanProject();
      const files = flatten(nodes).filter((node) => node.kind === 'file');
      const output = files.slice(0, 600).map((node) => `${node.path}\t${node.size}`).join('\n');
      return { callId: call.id, name: call.name, ok: true, summary: `Scanned ${files.length} files under ${root}.`, output: clip(output) };
    }
    case 'project.search':
      return projectSearch(call, context);
    case 'project.read': {
      await ensureProject();
      const path = normalizePath(valueText(call.args.path));
      const result = await readProjectFile(path);
      if (result.ok && !result.binary) context.readPaths.add(path);
      return {
        callId: call.id,
        name: call.name,
        ok: result.ok && !result.binary,
        summary: result.ok ? (result.binary ? `${path} is binary and was not exposed.` : `Read ${path} (${result.size} bytes).`) : (result.errorMessage || `Could not read ${path}.`),
        output: result.ok && !result.binary ? clip(result.content) : undefined,
      };
    }
    case 'project.git_status': {
      await ensureProject();
      const result = await projectGitStatus();
      return { callId: call.id, name: call.name, ok: result.ok, summary: result.ok ? 'Read Git status.' : (result.errorMessage || 'Git status failed.'), output: clip([result.stdout, result.stderr].filter(Boolean).join('\n')) };
    }
    case 'project.git_diff': {
      await ensureProject();
      const result = await projectGitDiff();
      const raw = [result.stdout, result.stderr].filter(Boolean).join('\n');
      const scoped = result.ok ? scopeDiffToOwnedPaths(raw, context.ownedPaths) : raw;
      return { callId: call.id, name: call.name, ok: result.ok, summary: result.ok ? (context.ownedPaths.size ? 'Read diff scoped to this Agent run.' : 'Read current project diff.') : (result.errorMessage || 'Git diff failed.'), output: clip(scoped || 'No diff.') };
    }
    case 'project.propose_patch':
      return proposePatch(call, context);
    case 'project.run_check': {
      await ensureProject();
      const preset = valueText(call.args.preset);
      if (!ALLOWED_CHECKS.has(preset)) throw new Error(`Unsupported check preset: ${preset || '(empty)'}.`);
      return approvedSimpleAction(call, context, `Run ${preset}`, 'Run the selected allowlisted project check with a native timeout.', async () => runProjectPreset(preset, true));
    }
    case 'privacy.classify': {
      const text = valueText(call.args.text);
      const paths = stringArray(call.args.paths, 100);
      if (!text && !paths.length) throw new Error('privacy.classify requires text or paths.');
      const result = classifyPrivacy({ text, paths });
      return {
        callId: call.id,
        name: call.name,
        ok: true,
        summary: `Privacy route ${result.route}; risk ${result.risk}; score ${result.score}/100.`,
        output: clip(JSON.stringify(result, null, 2)),
      };
    }
    case 'models.list': {
      const profiles = loadProviderProfiles().filter((profile) => profile.enabled);
      return {
        callId: call.id,
        name: call.name,
        ok: true,
        summary: `Found ${profiles.length} enabled provider profile(s).`,
        output: clip(profiles.map(providerSummary).join('\n') || 'No enabled providers.'),
      };
    }
    case 'models.compare':
      return compareModels(call, context);
    case 'computer.inspect': {
      const app = valueText(call.args.app) || undefined;
      if (app && !ALLOWED_APPS.has(app)) throw new Error(`Unsupported application: ${app}.`);
      const result = await inspectAccessibility(app);
      if (!result.ok) {
        return {
          callId: call.id,
          name: call.name,
          ok: false,
          summary: result.errorMessage || result.message || 'Accessibility inspection failed.',
          output: clip(JSON.stringify(result, null, 2)),
        };
      }
      context.latestAccessibility = {
        app: result.app || app,
        maxIndex: Math.max(-1, ...result.elements.map((entry) => entry.index)),
        elements: result.elements.map((entry) => ({ index: entry.index, role: entry.role, title: entry.title || entry.description, enabled: entry.enabled, actions: entry.actions })),
      };
      const output = result.elements.map((entry) => [
        `#${entry.index}`,
        entry.role || '(role unknown)',
        entry.title || entry.description || '(untitled)',
        entry.enabled ? 'enabled' : 'disabled',
        entry.actions.length ? `actions=${entry.actions.join(',')}` : '',
      ].filter(Boolean).join('\t')).join('\n');
      return {
        callId: call.id,
        name: call.name,
        ok: true,
        summary: result.message || `Inspected ${result.elements.length} Accessibility element(s).`,
        output: clip([`Application: ${result.app || app || '(frontmost)'}`, `Window: ${result.window || '(untitled)'}`, output].join('\n')),
      };
    }
    case 'computer.activate': {
      const index = valueNumber(call.args.index);
      const app = valueText(call.args.app) || context.latestAccessibility?.app;
      if (!context.latestAccessibility) throw new Error('Inspect Accessibility elements immediately before activation.');
      if (index === undefined || !Number.isInteger(index) || index < 0 || index > context.latestAccessibility.maxIndex) {
        throw new Error('The Accessibility element index is invalid or stale. Inspect again.');
      }
      if (app && !ALLOWED_APPS.has(app)) throw new Error(`Unsupported application: ${app}.`);
      if (context.latestAccessibility.app && app && context.latestAccessibility.app !== app) {
        throw new Error('The requested application does not match the latest Accessibility inspection. Inspect again.');
      }
      const selected = context.latestAccessibility.elements.find((entry) => entry.index === index);
      if (!selected) throw new Error('The Accessibility element is no longer present in the approved inspection. Inspect again.');
      if (!selected.enabled) throw new Error('The selected Accessibility element was disabled in the latest inspection.');
      if (!selected.actions.includes('AXPress') && !selected.actions.some((action) => /click/i.test(action))) {
        throw new Error('The selected Accessibility element did not expose a press or click action in the latest inspection.');
      }
      const elementLabel = selected.title || selected.role || `#${index}`;
      const result = await approvedSimpleAction(
        call,
        context,
        `Activate ${elementLabel}`,
        `${call.reason || 'Activate the selected named macOS interface element.'} Expected role=${selected.role || '(unknown)'}, title=${selected.title || '(untitled)'}.`,
        async () => activateAccessibility(index, app, selected.role, selected.title, true),
      );
      context.latestAccessibility = undefined;
      context.latestScreenshotDataUrl = undefined;
      return result;
    }
    case 'computer.capture': {
      const resolution = await context.requestApproval({
        runId: context.runId,
        toolEventId: context.eventId,
        toolName: call.name,
        title: 'Capture current screen',
        detail: 'Share one current desktop screenshot with this Agent run.',
      });
      if (!resolution.approved) return { callId: call.id, name: call.name, ok: false, summary: 'The user denied screen capture.' };
      const result = await withComputerRuntimeParent(context.runId, () => captureScreen(true));
      if (result.ok && result.screenshotDataUrl) {
        context.latestScreenshotDataUrl = result.screenshotDataUrl;
        context.updateEvent({ screenshotDataUrl: result.screenshotDataUrl });
        return {
          callId: call.id,
          name: call.name,
          ok: true,
          summary: result.message || 'Current screen captured successfully.',
          output: 'Current screen captured successfully.',
          screenshotDataUrl: result.screenshotDataUrl,
        };
      }
      return {
        callId: call.id,
        name: call.name,
        ok: false,
        summary: result.message || 'Screen capture failed.',
        output: clip(JSON.stringify({ ...result, screenshotDataUrl: result.screenshotDataUrl ? '[omitted]' : undefined }, null, 2)),
      };
    }
    case 'computer.open': {
      const app = valueText(call.args.app);
      if (!ALLOWED_APPS.has(app)) throw new Error(`Unsupported application: ${app || '(empty)'}.`);
      const result = await approvedSimpleAction(call, context, `Open ${app}`, call.reason, async () => withComputerRuntimeParent(context.runId, () => openApplication(app, true)));
      context.latestAccessibility = undefined;
      context.latestScreenshotDataUrl = undefined;
      return result;
    }
    case 'computer.type': {
      const text = valueText(call.args.text);
      const app = valueText(call.args.app) || undefined;
      if (!text || text.length > 20_000) throw new Error('computer.type requires 1–20,000 reviewed characters.');
      const result = await approvedSimpleAction(call, context, `Type ${text.length} characters`, call.reason, async () => withComputerRuntimeParent(context.runId, () => typeText(text, true, app)));
      context.latestAccessibility = undefined;
      context.latestScreenshotDataUrl = undefined;
      return result;
    }
    case 'computer.key': {
      const key = valueText(call.args.key).toLowerCase();
      const app = valueText(call.args.app) || undefined;
      if (!ALLOWED_KEYS.has(key)) throw new Error(`Unsupported key sequence: ${key || '(empty)'}.`);
      const result = await approvedSimpleAction(call, context, `Press ${key}`, call.reason, async () => withComputerRuntimeParent(context.runId, () => pressKey(key, true, app)));
      context.latestAccessibility = undefined;
      context.latestScreenshotDataUrl = undefined;
      return result;
    }
    case 'computer.click': {
      const x = valueNumber(call.args.x);
      const y = valueNumber(call.args.y);
      if (!context.latestScreenshotDataUrl) throw new Error('A current approved screenshot is required before coordinate clicking.');
      if (x === undefined || y === undefined || x < 0 || y < 0 || x > 16_384 || y > 16_384) throw new Error('Invalid click coordinates.');
      const result = await approvedSimpleAction(call, context, `Click (${x}, ${y})`, call.reason, async () => withComputerRuntimeParent(context.runId, () => clickPointer(x, y, true)));
      context.latestScreenshotDataUrl = undefined;
      context.latestAccessibility = undefined;
      return result;
    }
    default: {
      const neverTool: never = call.name;
      throw new Error(`Unhandled tool: ${neverTool}`);
    }
  }
}
