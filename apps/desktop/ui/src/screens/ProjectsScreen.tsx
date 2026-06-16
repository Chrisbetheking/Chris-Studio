import { useState, useEffect, useCallback } from "react";
import { tk } from "@tokenfence/shared/src/i18n";
import { storeGet, storeSet } from "@tokenfence/shared/src/agent-runtime/safeStorage";
import { estimateTokens } from "@tokenfence/shared/src/providers";

interface ProjectFile {
  path: string; name: string; extension: string;
  size: number; modified: string; kind: string;
  selected: boolean;
}

interface Project {
  id: string; name: string; folderPath: string;
  createdAt: number; lastOpened: number;
  files: ProjectFile[];
}

const STORAGE_KEY = "tokenfence-projects";
const ACTIVE_KEY = "tokenfence-active-project";

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
function loadProjects(): Project[] { try { const r = storeGet(STORAGE_KEY); return r ? JSON.parse(r) : []; } catch { return []; } }
function saveProjects(p: Project[]) { storeSet(STORAGE_KEY, JSON.stringify(p)); }
function getActiveProjectId(): string | null { try { return storeGet(ACTIVE_KEY) || null; } catch { return null; } }
function setActiveProjectId(id: string | null) { if (id) storeSet(ACTIVE_KEY, id); else storeSet(ACTIVE_KEY, ""); }

export function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [activeId, setActiveId] = useState<string | null>(() => getActiveProjectId());
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [scanning, setScanning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    setIsTauri(!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
  }, []);

  const activeProject = projects.find(p => p.id === activeId) ?? null;
  const selectedFiles = activeProject?.files.filter(f => f.selected) ?? [];
  const selectedTokens = selectedFiles.reduce((sum, f) => sum + estimateTokens(f.path + f.name), 0);

  const addProject = useCallback(() => {
    if (!newName.trim() || !newPath.trim()) return;
    const p: Project = { id: uid(), name: newName.trim(), folderPath: newPath.trim(), createdAt: Date.now(), lastOpened: Date.now(), files: [] };
    const updated = [...projects, p];
    setProjects(updated); saveProjects(updated);
    setNewName(""); setNewPath(""); setError(null);
  }, [newName, newPath, projects]);

  const removeProject = useCallback((id: string) => {
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated); saveProjects(updated);
    if (activeId === id) { setActiveId(null); setActiveProjectId(null); }
  }, [activeId, projects]);

  const selectProject = useCallback((id: string) => {
    setActiveId(id); setActiveProjectId(id);
    const updated = projects.map(p => p.id === id ? { ...p, lastOpened: Date.now() } : p);
    setProjects(updated); saveProjects(updated);
  }, [projects]);

  const scanProject = useCallback(async (project: Project) => {
    setScanning(project.id); setError(null);
    try {
      if (isTauri) {
        // Real Tauri backend scan
        const { invoke } = await import("@tauri-apps/api/core");
        const result: any = await invoke("scan_project_files", { path: project.folderPath });
        if (result.error) {
          setError(result.error);
          setScanning(null);
          return;
        }
        const files: ProjectFile[] = (result.files || []).map((f: any) => ({
          ...f, selected: true,
        }));
        const updated = projects.map(p => p.id === project.id ? { ...p, files, lastOpened: Date.now() } : p);
        setProjects(updated); saveProjects(updated);
      } else {
        // Browser mode fallback
        setError(tk("status.desktopRuntimeRequired") + " — Using demo file list.");
        const demos = ["README.md","package.json","src/index.ts","src/App.tsx","src/utils.ts"];
        const files: ProjectFile[] = demos.map(name => ({
          path: project.folderPath + "/" + name, name, extension: name.split(".").pop() ?? "",
          size: 0, modified: "", kind: "code", selected: true,
        }));
        const updated = projects.map(p => p.id === project.id ? { ...p, files, lastOpened: Date.now() } : p);
        setProjects(updated); saveProjects(updated);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
    setScanning(null);
  }, [projects, isTauri]);

  const toggleFile = useCallback((projectId: string, fileName: string) => {
    const updated = projects.map(p => {
      if (p.id !== projectId) return p;
      return { ...p, files: p.files.map(f => f.name === fileName ? { ...f, selected: !f.selected } : f) };
    });
    setProjects(updated); saveProjects(updated);
  }, [projects]);

  const toggleAll = useCallback((projectId: string, select: boolean) => {
    const updated = projects.map(p => {
      if (p.id !== projectId) return p;
      return { ...p, files: p.files.map(f => ({ ...f, selected: select })) };
    });
    setProjects(updated); saveProjects(updated);
  }, [projects]);

  return (
    <div style={{ padding: "28px 32px", height: "100%", overflowY: "auto" }}>
      <h2 className="page-title">{tk("common.projects")}</h2>
      <p className="page-subtitle">{activeProject ? `Active: ${activeProject.name} — ${activeProject.folderPath}` : "No active project"}</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Add Project</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={tk("common.projectName")}
            style={{ flex: 1, background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: "0.85rem", outline: "none" }} />
          <input value={newPath} onChange={e => setNewPath(e.target.value)} placeholder={tk("common.folderPath")}
            style={{ flex: 2, background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: "0.85rem", outline: "none" }} />
          <button onClick={addProject} className="btn btn-primary" style={{ fontSize: "0.85rem", padding: "8px 18px" }}>{tk("common.addProject")}</button>
        </div>
        {error && <div style={{ fontSize: "0.8rem", color: error.includes("Desktop runtime") ? "var(--amber)" : "var(--red)", marginTop: 4 }}>{error}</div>}
      </div>

      <h3 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>{tk("common.recentProjects")}</h3>
      {projects.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{tk("common.noProjects")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {projects.sort((a,b) => b.lastOpened - a.lastOpened).map(p => (
            <div key={p.id} className="card" style={{
              padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
              border: p.id === activeId ? "1px solid var(--primary)" : "1px solid var(--border)",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)", marginBottom: 2 }}>{p.name}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{p.folderPath}</div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 2 }}>
                  {p.files.length} files · {p.files.filter(f => f.selected).length} selected · ~{selectedTokens} tokens
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => selectProject(p.id)} className={`btn ${p.id === activeId ? "btn-primary" : "btn-ghost"}`} style={{ fontSize: "0.75rem", padding: "5px 12px" }}>
                  {p.id === activeId ? "Active" : "Select"}
                </button>
                <button onClick={() => scanProject(p)} className="btn btn-ghost" style={{ fontSize: "0.75rem", padding: "5px 12px" }} disabled={scanning === p.id}>
                  {scanning === p.id ? "..." : "Scan"}
                </button>
                <button onClick={() => removeProject(p.id)} className="btn btn-ghost" style={{ fontSize: "0.75rem", padding: "5px 8px", color: "var(--red)" }}>x</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeProject && activeProject.files.length > 0 && (
        <div className="card" style={{ padding: 16, marginTop: 20 }}>
          <div className="card-title" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Project Files: {activeProject.name}</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => toggleAll(activeProject.id, true)} className="btn btn-ghost" style={{ fontSize: "0.65rem", padding: "2px 8px" }}>{tk("common.allFiles")}</button>
              <button onClick={() => toggleAll(activeProject.id, false)} className="btn btn-ghost" style={{ fontSize: "0.65rem", padding: "2px 8px" }}>{tk("common.noneFiles")}</button>
            </div>
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 8 }}>
            {selectedFiles.length} " + " " + tk("common.filesSelected") · ~{selectedTokens} tokens
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 300, overflowY: "auto", fontSize: "0.75rem" }}>
            {activeProject.files.map(f => (
              <label key={f.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 6px", borderRadius: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={f.selected} onChange={() => toggleFile(activeProject.id, f.name)} />
                <span style={{ color: f.kind === "code" ? "var(--primary)" : "var(--text-muted)", fontSize: "0.7rem" }}>[{f.kind}]</span>
                <span style={{ color: "var(--text)" }}>{f.name}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", marginLeft: "auto" }}>{(f.size / 1024).toFixed(1)}KB</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
