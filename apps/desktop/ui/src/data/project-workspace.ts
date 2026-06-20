
function safeParseJson(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

import { storeGet, storeSet } from "@tokenfence/shared/src/agent-runtime/safeStorage";

/* ============================================================
   Types
   ============================================================ */

export interface RecentProject {
  id: string;
  name: string;
  path: string;
  lastOpenedAt: number;
  pinned: boolean;
  favorite: boolean;
}

/* ============================================================
   Keys
   ============================================================ */

const RECENT_PROJECTS_KEY = "tokenfence.recentProjects";
const ACTIVE_PROJECT_KEY = "tokenfence.activeProject";
const MAX_RECENT = 20;

/* ============================================================
   Helpers
   ============================================================ */

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function sortProjects(projects: RecentProject[]): RecentProject[] {
  return [...projects].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastOpenedAt - a.lastOpenedAt;
  });
}

/* ============================================================
   Load / Save
   ============================================================ */

export function loadRecentProjects(): RecentProject[] {
  try {
    const raw = storeGet(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = safeParseJson(raw);
    if (!Array.isArray(parsed)) return [];
    return sortProjects(parsed as RecentProject[]);
  } catch {
    return [];
  }
}

export function saveRecentProjects(projects: RecentProject[]): void {
  const trimmed = sortProjects(projects).slice(0, MAX_RECENT);
  storeSet(RECENT_PROJECTS_KEY, JSON.stringify(trimmed));
}

/* ============================================================
   Mutations
   ============================================================ */

export function addRecentProject(project: { name: string; path: string }): RecentProject[] {
  const existing = loadRecentProjects();
  const now = Date.now();
  const found = existing.find((p) => p.path === project.path);
  let updated: RecentProject[];
  if (found) {
    updated = existing.map((p) =>
      p.path === project.path ? { ...p, lastOpenedAt: now } : p
    );
  } else {
    const entry: RecentProject = {
      id: uid(),
      name: project.name,
      path: project.path,
      lastOpenedAt: now,
      pinned: false,
      favorite: false,
    };
    updated = [...existing, entry];
  }
  saveRecentProjects(updated);
  return sortProjects(loadRecentProjects());
}

export function removeRecentProject(projectId: string): RecentProject[] {
  const existing = loadRecentProjects();
  const updated = existing.filter((p) => p.id !== projectId);
  saveRecentProjects(updated);
  return sortProjects(loadRecentProjects());
}

export function pinProject(projectId: string): RecentProject[] {
  const existing = loadRecentProjects();
  const now = Date.now();
  const updated = existing.map((p) =>
    p.id === projectId ? { ...p, pinned: true, lastOpenedAt: now } : p
  );
  saveRecentProjects(updated);
  return sortProjects(loadRecentProjects());
}

export function unpinProject(projectId: string): RecentProject[] {
  const existing = loadRecentProjects();
  const updated = existing.map((p) =>
    p.id === projectId ? { ...p, pinned: false } : p
  );
  saveRecentProjects(updated);
  return sortProjects(loadRecentProjects());
}

export function toggleFavoriteProject(projectId: string): RecentProject[] {
  const existing = loadRecentProjects();
  const updated = existing.map((p) =>
    p.id === projectId ? { ...p, favorite: !p.favorite } : p
  );
  saveRecentProjects(updated);
  return sortProjects(loadRecentProjects());
}

/* ============================================================
   Active Project
   ============================================================ */

export function setActiveProject(project: RecentProject): void {
  storeSet(ACTIVE_PROJECT_KEY, JSON.stringify(project));
}

export function loadActiveProject(): RecentProject | null {
  try {
    const raw = storeGet(ACTIVE_PROJECT_KEY);
    if (!raw) return null;
    const p = safeParseJson(raw); return p as RecentProject;
  } catch {
    return null;
  }
}

export function clearActiveProject(): void {
  storeSet(ACTIVE_PROJECT_KEY, "");
}