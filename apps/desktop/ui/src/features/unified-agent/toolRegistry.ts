import type { ProjectFileNode, ProjectPatchFileSummary } from '../../app/types';
import { activateAccessibility, inspectAccessibility } from './nativeClient';
import { loadProjectRoot } from '../../app/store';
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
  latestAccessibility?: { app?: string; maxIndex: number };
  requestApproval: (request: Omit<UnifiedApprovalRequest, 'id' | 'createdAt' | 'status'>) => Promise<ApprovalResolution>;
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
      const result = await approvedSimpleAction(
        call,
        context,
        `Activate Accessibility element #${index}`,
        call.reason || 'Activate the selected named macOS interface element.',
        async () => activateAccessibility(index, app, true),
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
