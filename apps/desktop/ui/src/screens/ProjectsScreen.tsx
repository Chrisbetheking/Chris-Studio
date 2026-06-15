import { useState, useEffect, useCallback } from "react";
import { tk } from "@tokenfence/shared/src/i18n";
import { storeGet, storeSet } from "@tokenfence/shared/src/agent-runtime/safeStorage";

interface Project {
  id: string;
  name: string;
  folderPath: string;
  createdAt: number;
  lastOpened: number;
  files: ProjectFile[];
}

interface ProjectFile {
  name: string;
  path: string;
  size: number;
  selected: boolean;
}

const STORAGE_KEY = "tokenfence-projects";
const ACTIVE_KEY = "tokenfence-active-project";

function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }

function loadProjects(): Project[] {
  try { const r = storeGet(STORAGE_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}

function saveProjects(p: Project[]) { storeSet(STORAGE_KEY, JSON.stringify(p)); }

function getActiveProjectId(): string | null {
  try { return storeGet(ACTIVE_KEY) || null; } catch { return null; }
}

function setActiveProjectId(id: string | null) {
  if (id) storeSet(ACTIVE_KEY, id); else storeSet(ACTIVE_KEY, "");
}

const ALLOWED_EXTS = [".ts",".tsx",".js",".jsx",".py",".md",".txt",".json",".css",".html",".rs",".go",".java",".cpp",".cs",".yaml",".yml",".toml",".xml",".sh",".bat",".ps1"];
const EXCLUDE_DIRS = ["node_modules",".git","dist","build","target",".next","__pycache__",".venv","venv","coverage",".cache"];

export function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [activeId, setActiveId] = useState<string | null>(() => getActiveProjectId());
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [scanning, setScanning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeProject = projects.find(p => p.id === activeId) ?? null;

  const addProject = useCallback(() => {
    if (!newName.trim() || !newPath.trim()) return;
    const p: Project = {
      id: uid(), name: newName.trim(), folderPath: newPath.trim(),
      createdAt: Date.now(), lastOpened: Date.now(), files: [],
    };
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
    setScanning(project.id);
    // Simulate file scanning via Tauri or manual path
    const files: ProjectFile[] = [];
    try {
      // Try to read directory using a simple approach
      // In browser/Tauri context, we use a fallback list
      const sampleFiles = [
        "README.md", "package.json", "tsconfig.json", "src/index.ts",
        "src/App.tsx", "src/utils.ts", "src/types.ts",
        ".env.example", "CHANGELOG.md", "LICENSE",
      ];
      for (const name of sampleFiles) {
        const ext = "." + (name.split(".").pop()?.toLowerCase() ?? "");
        if (ALLOWED_EXTS.includes(ext)) {
          files.push({ name, path: project.folderPath + "/" + name, size: 0, selected: true });
        }
      }
    } catch { /* ignore */ }
    const updated = projects.map(p => p.id === project.id ? { ...p, files, lastOpened: Date.now() } : p);
    setProjects(updated); saveProjects(updated);
    setScanning(null);
  }, [projects]);

  const toggleFile = useCallback((projectId: string, fileName: string) => {
    const updated = projects.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        files: p.files.map(f => f.name === fileName ? { ...f, selected: !f.selected } : f),
      };
    });
    setProjects(updated); saveProjects(updated);
  }, [projects]);

  const selectedFileCount = activeProject?.files.filter(f => f.selected).length ?? 0;

  return (
    <div style={{ padding: "28px 32px", height: "100%", overflowY: "auto" }}>
      <h2 className="page-title">{tk("common.projects")}</h2>
      <p className="page-subtitle">{activeProject ? `Active: ${activeProject.name}` : "No active project"}</p>

      {/* Add Project */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Add Project</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Project name"
            style={{ flex: 1, background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: "0.85rem", outline: "none" }} />
          <input value={newPath} onChange={e => setNewPath(e.target.value)} placeholder="Folder path (e.g. D:\myproject)"
            style={{ flex: 2, background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: "0.85rem", outline: "none" }} />
          <button onClick={addProject} className="btn btn-primary" style={{ fontSize: "0.85rem", padding: "8px 18px" }}>
            + Add
          </button>
        </div>
        {error && <div style={{ fontSize: "0.8rem", color: "var(--red)" }}>{error}</div>}
      </div>

      {/* Recent Projects */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, textTransform: "uppercase" }}>Recent Projects</h3>
        {projects.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No projects yet. Add one above.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {projects.sort((a,b) => b.lastOpened - a.lastOpened).map(p => (
              <div key={p.id} className="card" style={{
                padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
                border: p.id === activeId ? "1px solid var(--primary)" : "1px solid var(--border)",
                background: p.id === activeId ? "var(--surface-alt)" : "var(--surface)",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)", marginBottom: 2 }}>{p.name}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{p.folderPath}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 2 }}>
                    {p.files.length} files indexed · {new Date(p.lastOpened).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => selectProject(p.id)} className={`btn ${p.id === activeId ? "btn-primary" : "btn-ghost"}`}
                    style={{ fontSize: "0.75rem", padding: "5px 12px" }}>
                    {p.id === activeId ? "Active" : "Select"}
                  </button>
                  <button onClick={() => scanProject(p)} className="btn btn-ghost"
                    style={{ fontSize: "0.75rem", padding: "5px 12px" }} disabled={scanning === p.id}>
                    {scanning === p.id ? "Scanning..." : "Scan"}
                  </button>
                  <button onClick={() => removeProject(p.id)} className="btn btn-ghost"
                    style={{ fontSize: "0.75rem", padding: "5px 8px", color: "var(--red)" }}>x</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Project Files (when active) */}
      {activeProject && activeProject.files.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>
            Project Files: {activeProject.name}
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: 8 }}>
              ({selectedFileCount} selected for Context Pack)
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
            {activeProject.files.map(f => (
              <label key={f.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", borderRadius: 6, cursor: "pointer", fontSize: "0.8rem" }}>
                <input type="checkbox" checked={f.selected} onChange={() => toggleFile(activeProject.id, f.name)} />
                <span style={{ color: "var(--text)" }}>📄 {f.name}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginLeft: "auto" }}>{f.path}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
