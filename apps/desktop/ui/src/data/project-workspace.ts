
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


function sanitizeProjectName(name: string, fallbackPath?: string): string {
  if (!name || name.trim().length === 0) return fallbackPath ? fallbackPath.split(/[\\\/]/).filter(Boolean).pop() || "Local Project" : "Local Project";
  // Check for mojibake: if name is mostly high-codepoint chars not in CJK range
  let badChars = 0;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if ((c >= 0x6000 && c <= 0x6FFF && !(c >= 0x4E00 && c <= 0x9FFF)) || c === 0x20AC || c === 0xFFFD) {
      badChars++;
    }
  }
  if (badChars > name.length * 0.3) {
    // Mojibake detected - regenerate from path
    return fallbackPath ? fallbackPath.split(/[\\\/]/).filter(Boolean).pop() || "Local Project" : "Local Project";
  }
  return name;
}

export function loadRecentProjects(): RecentProject[] {
  try {
    const raw = storeGet(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = safeParseJson(raw);
    if (!Array.isArray(parsed)) return [];
    // Sanitize mojibake project names from old localStorage data
    let needsSave = false;
    for (const p of parsed) {
      const clean = sanitizeProjectName(p.name, p.path);
      if (clean !== p.name) { p.name = clean; needsSave = true; }
    }
    if (needsSave) saveRecentProjects(parsed as RecentProject[]);
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