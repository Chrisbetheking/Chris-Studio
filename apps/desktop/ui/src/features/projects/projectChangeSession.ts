import type {
  ProjectCodingPlan,
  ProjectCodingReview,
  ProjectFileNode,
  ProjectPatchFileSummary,
} from '../../app/types';

const MAX_PLAN_STEPS = 8;
const MAX_CONTEXT_FILES = 12;
const ALLOWED_CHECKS = new Set([
  'npm-typecheck',
  'npm-test',
  'npm-build',
  'cargo-check',
  'cargo-test',
]);

function extractJsonObject(value: string): Record<string, unknown> | undefined {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || value.trim();
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(source.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function parseProjectCodingPlan(value: string): ProjectCodingPlan {
  const parsed = extractJsonObject(value);
  if (parsed) {
    const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
    const steps = rawSteps
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (!entry || typeof entry !== 'object') return '';
        const row = entry as Record<string, unknown>;
        const title = String(row.title ?? row.step ?? row.name ?? '').trim();
        const detail = String(row.detail ?? row.reason ?? row.description ?? '').trim();
        return title ? `${title}${detail ? ` — ${detail}` : ''}` : '';
      })
      .filter(Boolean)
      .slice(0, MAX_PLAN_STEPS);
    const checks = stringList(parsed.checks, 5).filter((entry) => ALLOWED_CHECKS.has(entry));
    return {
      summary: String(parsed.summary ?? parsed.goal ?? '').trim().slice(0, 1_200),
      steps: steps.length ? steps : ['Inspect the scoped repository', 'Prepare a minimal reviewed patch', 'Run approved checks'],
      filesToRead: stringList(parsed.filesToRead ?? parsed.files, MAX_CONTEXT_FILES),
      checks,
      risks: stringList(parsed.risks, 8),
    };
  }

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, '').trim())
    .filter((line) => line.length >= 4)
    .slice(0, MAX_PLAN_STEPS);
  return {
    summary: lines[0] ?? value.trim().slice(0, 1_200),
    steps: lines.length ? lines : ['Inspect the scoped repository', 'Prepare a minimal reviewed patch', 'Run approved checks'],
    filesToRead: [],
    checks: [],
    risks: [],
  };
}

export function extractUnifiedDiff(value: string): string {
  const patchSection = value.match(/(?:^|\n)PATCH:\s*([\s\S]*)$/i)?.[1] ?? value;
  const fenced = patchSection.match(/```(?:diff|patch)?\s*([\s\S]*?)```/i)?.[1] ?? patchSection;
  const start = fenced.indexOf('diff --git ');
  if (start < 0) return '';
  const patch = fenced.slice(start).trimEnd();
  return patch ? `${patch}\n` : '';
}

/**
 * Decode one path token exactly as git writes it in a patch.
 *
 * Git quotes a path with C-style escapes when it contains a quote, a backslash,
 * a control character or a non-ASCII byte. Non-ASCII characters are emitted as
 * octal escapes of their UTF-8 bytes (`"\344\270\255"`), so decoding must
 * reassemble bytes and then interpret them as UTF-8; decoding escape by escape
 * would produce mojibake like "ä¸­" instead of "中".
 */
function unquoteGitPath(raw: string): string {
  const value = raw.trim();
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;
  const body = value.slice(1, -1);
  const bytes: number[] = [];
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character !== '\\') {
      bytes.push(character.charCodeAt(0));
      continue;
    }
    const next = body[index + 1];
    if (next === undefined) break;
    const octal = body.slice(index + 1).match(/^[0-7]{1,3}/);
    if (octal) {
      bytes.push(parseInt(octal[0], 8));
      index += octal[0].length;
      continue;
    }
    index += 1;
    switch (next) {
      case 't': bytes.push(9); break;
      case 'n': bytes.push(10); break;
      case 'v': bytes.push(11); break;
      case 'f': bytes.push(12); break;
      case 'r': bytes.push(13); break;
      default: bytes.push(next.charCodeAt(0)); break;
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes));
  } catch {
    return String.fromCharCode(...bytes);
  }
}

function normalizeDiffPath(raw: string): string {
  // A path that contains a space is terminated by a tab in `---`/`+++` lines,
  // so everything after the first tab is patch metadata rather than a path.
  const trimmed = raw.split('\t', 1)[0].trim();
  const value = unquoteGitPath(trimmed);
  if (value === '/dev/null') return '';
  return value.replace(/^[ab]\//, '');
}

/**
 * Read the `---` / `+++` header path.
 *
 * These lines carry the real path even when it contains spaces, and a tab
 * terminates it. Returns `undefined` when the line is absent, and an empty
 * string when the patch explicitly targets `/dev/null`.
 */
function headerPath(section: string, prefix: '--- ' | '+++ '): string | undefined {
  for (const line of section.split(/\r?\n/)) {
    if (line.startsWith('@@')) break;
    if (line.startsWith(prefix)) return normalizeDiffPath(line.slice(prefix.length));
  }
  return undefined;
}

/**
 * Fall back to the `diff --git` header.
 *
 * Needed for content-free renames where git emits no `---`/`+++` lines. An
 * unquoted path may itself contain spaces, so the old/new boundary is located
 * at the last ` b/` occurrence rather than by splitting on whitespace.
 */
function pathsFromHeader(header: string): { oldPath: string; newPath: string } {
  const rest = header.slice('diff --git '.length);
  const quoted = rest.match(/^("(?:[^"\\]|\\.)*")\s+("(?:[^"\\]|\\.)*")$/);
  if (quoted) return { oldPath: normalizeDiffPath(quoted[1]), newPath: normalizeDiffPath(quoted[2]) };
  const separator = rest.lastIndexOf(' b/');
  if (separator > 0) {
    return { oldPath: normalizeDiffPath(rest.slice(0, separator)), newPath: normalizeDiffPath(rest.slice(separator + 1)) };
  }
  const parts = rest.split(/\s+/);
  return { oldPath: normalizeDiffPath(parts[0] ?? ''), newPath: normalizeDiffPath(parts[1] ?? '') };
}

/**
 * Count changed lines inside hunks only.
 *
 * A content line can itself begin with `++` or `--` (for example `++i;` becomes
 * `+++i;` and a SQL comment becomes `--- sql comment`). Skipping every line that
 * looks like a file header therefore undercounted the reviewed diff, so the
 * header check stops at the first `@@` instead.
 */
function countHunkChanges(section: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  for (const line of section.split(/\r?\n/)) {
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('+')) additions += 1;
    else if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

function actionForSection(section: string): ProjectPatchFileSummary['action'] {
  if (/^new file mode /m.test(section)) return 'add';
  if (/^deleted file mode /m.test(section)) return 'delete';
  if (/^rename from |^rename to /m.test(section)) return 'rename';
  return 'modify';
}

export function parseUnifiedDiff(value: string): ProjectPatchFileSummary[] {
  const patch = extractUnifiedDiff(value);
  if (!patch) return [];
  const starts: number[] = [];
  const marker = /^diff --git /gm;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(patch))) starts.push(match.index);
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? patch.length;
    const section = patch.slice(start, end).trimEnd();
    const header = section.split(/\r?\n/, 1)[0];
    const fromHeader = pathsFromHeader(header);
    // `---`/`+++` win because they stay unambiguous when the path has spaces.
    const oldPath = headerPath(section, '--- ') ?? fromHeader.oldPath;
    const newPath = headerPath(section, '+++ ') ?? fromHeader.newPath;
    const action = actionForSection(section);
    const path = action === 'delete' ? oldPath : (newPath || oldPath);
    const { additions, deletions } = countHunkChanges(section);
    return {
      path,
      oldPath: oldPath || undefined,
      newPath: newPath || undefined,
      action,
      additions,
      deletions,
      patch: `${section}\n`,
    };
  }).filter((entry) => Boolean(entry.path));
}

export function composeSelectedPatch(files: ProjectPatchFileSummary[], selectedPaths: Iterable<string>): string {
  const selected = new Set(selectedPaths);
  const patch = files
    .filter((entry) => selected.has(entry.path))
    .map((entry) => entry.patch.trimEnd())
    .join('\n')
    .trimEnd();
  return patch ? `${patch}\n` : '';
}

function flatten(nodes: ProjectFileNode[]): ProjectFileNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flatten(node.children) : [])]);
}

function tokenSet(task: string): Set<string> {
  return new Set(task.toLowerCase().split(/[^a-z0-9_./-]+/).filter((token) => token.length >= 3));
}

export function chooseProjectContextFiles(
  nodes: ProjectFileNode[],
  requested: string[],
  selectedPath: string,
  task: string,
): string[] {
  const files = flatten(nodes).filter((node) => node.kind === 'file');
  const available = new Set(files.map((node) => node.path));
  const result: string[] = [];
  const add = (path: string) => {
    const normalized = path.trim().replace(/^\.\//, '');
    if (available.has(normalized) && !result.includes(normalized) && result.length < MAX_CONTEXT_FILES) result.push(normalized);
  };
  if (selectedPath) add(selectedPath);
  requested.forEach(add);

  const roots = [
    'package.json', 'README.md', 'README.zh-CN.md', 'Cargo.toml',
    'apps/desktop/ui/package.json', 'apps/desktop/src-tauri/Cargo.toml',
  ];
  roots.forEach(add);

  const tokens = tokenSet(task);
  files
    .map((node) => {
      const lower = node.path.toLowerCase();
      let score = 0;
      for (const token of tokens) if (lower.includes(token)) score += token.length;
      if (/\.(tsx?|jsx?|rs|py|go|java|kt|vue|svelte|css|scss|json|ya?ml|md)$/i.test(node.path)) score += 2;
      if (node.size > 250_000) score -= 20;
      return { path: node.path, score };
    })
    .filter((entry) => entry.score > 2)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .forEach((entry) => add(entry.path));

  return result.slice(0, MAX_CONTEXT_FILES);
}

export function parseProjectCodingReview(value: string): ProjectCodingReview {
  const parsed = extractJsonObject(value);
  if (parsed) {
    const verdictRaw = String(parsed.verdict ?? parsed.status ?? '').toLowerCase();
    const verdict: ProjectCodingReview['verdict'] = verdictRaw.includes('pass') || verdictRaw.includes('approve')
      ? 'pass'
      : verdictRaw.includes('block') || verdictRaw.includes('fail')
        ? 'block'
        : 'revise';
    return {
      verdict,
      summary: String(parsed.summary ?? parsed.reason ?? '').trim().slice(0, 2_000),
      issues: stringList(parsed.issues, 12),
      tested: stringList(parsed.tested ?? parsed.evidence, 12),
    };
  }
  const block = /\b(block|fail(?:ed)?|unsafe)\b|阻止|失败|不安全/i.test(value);
  const revise = /\b(revise|change|issue|missing)\b|修改|问题|缺失/i.test(value);
  return {
    verdict: block ? 'block' : revise ? 'revise' : 'pass',
    summary: value.trim().slice(0, 2_000),
    issues: [],
    tested: [],
  };
}

export function normalizeApprovedChecks(plan: ProjectCodingPlan, hasPackageJson: boolean, hasCargoToml: boolean): string[] {
  const checks = plan.checks.filter((entry) => ALLOWED_CHECKS.has(entry));
  if (checks.length) return checks.slice(0, 3);
  const defaults: string[] = [];
  if (hasPackageJson) defaults.push('npm-typecheck', 'npm-test');
  if (hasCargoToml) defaults.push('cargo-check');
  return defaults.slice(0, 3);
}
