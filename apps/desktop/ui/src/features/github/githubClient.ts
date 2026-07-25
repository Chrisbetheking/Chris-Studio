import { invoke } from '@tauri-apps/api/tauri';
import type { GitHubConnectionInfo, GitHubIssueSummary, GitHubPullRequestResult, GitHubRepositoryOverview } from '../../app/types';
import { isDesktopRuntime } from '../platform/desktopClient';

interface SecretReply {
  ok: boolean;
  hasValue: boolean;
  errorMessage?: string;
}

export async function saveGitHubToken(token: string): Promise<{ ok: boolean; message?: string }> {
  if (!isDesktopRuntime()) return { ok: false, message: 'Desktop runtime required.' };
  const result = await invoke<SecretReply>('github_token_save', { token });
  return { ok: result.ok, message: result.errorMessage };
}

export async function deleteGitHubToken(): Promise<{ ok: boolean; message?: string }> {
  if (!isDesktopRuntime()) return { ok: true };
  const result = await invoke<SecretReply>('github_token_delete');
  return { ok: result.ok, message: result.errorMessage };
}

export async function testGitHubConnection(): Promise<GitHubConnectionInfo> {
  if (!isDesktopRuntime()) return { ok: false, errorMessage: 'Desktop runtime required.' };
  return await invoke<GitHubConnectionInfo>('github_connection_test');
}

export async function getGitHubRepository(owner: string, repo: string): Promise<GitHubRepositoryOverview> {
  return await invoke<GitHubRepositoryOverview>('github_repository_overview', { owner, repo });
}

export async function listGitHubIssues(owner: string, repo: string): Promise<GitHubIssueSummary[]> {
  return await invoke<GitHubIssueSummary[]>('github_issue_list', { owner, repo });
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
  return await invoke<GitHubPullRequestResult>('github_create_pull_request', input);
}
