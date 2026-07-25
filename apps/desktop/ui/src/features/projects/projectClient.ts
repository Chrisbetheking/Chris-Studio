import { invoke } from '@tauri-apps/api/tauri';
import type {
  ProjectChangeSessionResult,
  ProjectRecoveredChangeSession,
  ProjectCommandResult,
  ProjectFileContent,
  ProjectFileNode,
  ProjectWorkspace,
  ProjectWriteResult,
} from '../../app/types';
import { isDesktopRuntime } from '../platform/desktopClient';

export async function chooseProjectFolder(): Promise<ProjectWorkspace | null> {
  if (!isDesktopRuntime()) return null;
  return await invoke<ProjectWorkspace | null>('project_choose_folder');
}

export async function reopenProjectFolder(root: string): Promise<ProjectWorkspace | null> {
  if (!isDesktopRuntime() || !root.trim()) return null;
  return await invoke<ProjectWorkspace | null>('project_set_root', { root });
}

export async function scanProject(): Promise<ProjectFileNode[]> {
  if (!isDesktopRuntime()) return [];
  return await invoke<ProjectFileNode[]>('project_scan');
}

export async function readProjectFile(path: string): Promise<ProjectFileContent> {
  return await invoke<ProjectFileContent>('project_read_file', { path });
}

export async function writeProjectFile(path: string, content: string, confirmed: boolean): Promise<ProjectWriteResult> {
  return await invoke<ProjectWriteResult>('project_write_file', { path, content, confirmed });
}

export async function runProjectPreset(preset: string, confirmed: boolean): Promise<ProjectCommandResult> {
  return await invoke<ProjectCommandResult>('project_run_preset', { preset, confirmed });
}

export async function projectGitStatus(): Promise<ProjectCommandResult> {
  return await invoke<ProjectCommandResult>('project_git_status');
}

export async function projectGitDiff(): Promise<ProjectCommandResult> {
  return await invoke<ProjectCommandResult>('project_git_diff');
}

export async function clonePublicRepository(url: string): Promise<ProjectWorkspace | null> {
  return await invoke<ProjectWorkspace | null>('project_clone_public', { url });
}

export async function applyReviewedPatch(patch: string, confirmed: boolean): Promise<ProjectCommandResult> {
  return await invoke<ProjectCommandResult>('project_apply_patch', { patch, confirmed });
}

export async function applyProjectChangeSession(patch: string, confirmed: boolean): Promise<ProjectChangeSessionResult> {
  return await invoke<ProjectChangeSessionResult>('project_apply_change_session', { patch, confirmed });
}

export async function loadLatestProjectChangeSession(): Promise<ProjectRecoveredChangeSession | null> {
  return await invoke<ProjectRecoveredChangeSession | null>('project_latest_change_session');
}

export async function rollbackProjectChangeSession(sessionId: string, paths: string[], confirmed: boolean): Promise<ProjectChangeSessionResult> {
  return await invoke<ProjectChangeSessionResult>('project_rollback_change_session', { sessionId, paths, confirmed });
}

export async function acceptProjectChangeSession(sessionId: string, paths: string[], confirmed: boolean): Promise<ProjectChangeSessionResult> {
  return await invoke<ProjectChangeSessionResult>('project_accept_change_session', { sessionId, paths, confirmed });
}

export async function createGitBranch(branch: string, confirmed: boolean): Promise<ProjectCommandResult> {
  return await invoke<ProjectCommandResult>('project_git_create_branch', { branch, confirmed });
}

export async function commitProjectChanges(message: string, confirmed: boolean): Promise<ProjectCommandResult> {
  return await invoke<ProjectCommandResult>('project_git_commit', { message, confirmed });
}

export async function pushGitBranch(branch: string, confirmed: boolean): Promise<ProjectCommandResult> {
  return await invoke<ProjectCommandResult>('project_git_push', { branch, confirmed });
}
