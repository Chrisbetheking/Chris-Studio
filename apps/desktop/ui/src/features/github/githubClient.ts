import { invoke } from '@tauri-apps/api/tauri';
import type { GitHubConnectionInfo, GitHubIssueSummary, GitHubPullRequestResult, GitHubRepositoryOverview } from '../../app/types';
import { isDesktopRuntime } from '../platform/desktopClient';

interface SecretReply {
  ok: boolean;
  hasValue: boolean;
  errorMessage?: string;
}

/** Why a call could not run: the browser preview, or a failed native bridge. */
const DESKTOP_REQUIRED = 'Desktop runtime required.';

function bridgeFailure(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export async function saveGitHubToken(token: string): Promise<{ ok: boolean; message?: string }> {
  if (!isDesktopRuntime()) return { ok: false, message: DESKTOP_REQUIRED };
  try {
    const result = await invoke<SecretReply>('github_token_save', { token });
    return { ok: result.ok, message: result.errorMessage };
  } catch (cause) {
    // The credential store can refuse the write; report it rather than letting
    // the rejection escape into a caller that has no try/catch.
    return { ok: false, message: bridgeFailure(cause) };
  }
}

export async function deleteGitHubToken(): Promise<{ ok: boolean; message?: string }> {
  if (!isDesktopRuntime()) return { ok: true };
  try {
    const result = await invoke<SecretReply>('github_token_delete');
    return { ok: result.ok, message: result.errorMessage };
  } catch (cause) {
    return { ok: false, message: bridgeFailure(cause) };
  }
}

export async function testGitHubConnection(): Promise<GitHubConnectionInfo> {
  if (!isDesktopRuntime()) return { ok: false, errorMessage: DESKTOP_REQUIRED };
  try {
    return await invoke<GitHubConnectionInfo>('github_connection_test');
  } catch (cause) {
    return { ok: false, errorMessage: bridgeFailure(cause) };
  }
}

/**
 * Read repository metadata.
 *
 * The two readers below and the PR writer are called from the project screen,
 * which treats a resolved value as authoritative. They used to invoke the native
 * command with no runtime guard and no catch, so in the browser preview (or when
 * the bridge itself failed) the rejection escaped and left the caller's awaited
 * sequence unfinished — the connect flow stopped mid-way with no message.
 */
export async function getGitHubRepository(owner: string, repo: string): Promise<GitHubRepositoryOverview> {
  if (!isDesktopRuntime()) return { ok: false, errorMessage: DESKTOP_REQUIRED };
  try {
    return await invoke<GitHubRepositoryOverview>('github_repository_overview', { owner, repo });
  } catch (cause) {
    return { ok: false, errorMessage: bridgeFailure(cause) };
  }
}

export async function listGitHubIssues(owner: string, repo: string): Promise<GitHubIssueSummary[]> {
  if (!isDesktopRuntime()) return [];
  try {
    const issues = await invoke<GitHubIssueSummary[]>('github_issue_list', { owner, repo });
    return Array.isArray(issues) ? issues : [];
  } catch {
    // The issue list is supplementary context; an unavailable list must not
    // break the connect flow that already succeeded.
    return [];
  }
}

export async function createGitHubPullRequest(input: {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  confirmed: boolean;
}): Promise<GitHubPullRequestResult> {
  if (!isDesktopRuntime()) return { ok: false, errorMessage: DESKTOP_REQUIRED };
  try {
    return await invoke<GitHubPullRequestResult>('github_create_pull_request', input);
  } catch (cause) {
    return { ok: false, errorMessage: bridgeFailure(cause) };
  }
}
