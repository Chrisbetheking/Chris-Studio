import { useState, useEffect, useCallback, useMemo } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import { storeGet, storeSet } from "@tokenfence/shared/src/agent-runtime/safeStorage";
import { estimateTokens } from "@tokenfence/shared/src/providers";
import { ProjectFileTree } from "../components/ProjectFileTree";
import { ContextPackPanel } from "../components/ContextPackPanel";
import { buildMockFileTree, flattenFileTree } from "../data/project-file-tree";
import { addFilesToContextPack, type ContextPackFile } from "../data/context-pack";
import { scanProjectDirectory, getScanBridgeStatus } from "../desktop-bridge";

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
function loadProjects(): Project[] { try { const r = storeGet(STORAGE_KEY); if (!r) return []; const parsed = JSON.parse(r); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function saveProjects(p: Project[]) { storeSet(STORAGE_KEY, JSON.stringify(p)); }
function getActiveProjectId(): string | null { try { return storeGet(ACTIVE_KEY) || null; } catch { return null; } }
function setActiveProjectId(id: string | null) { if (id) storeSet(ACTIVE_KEY, id); else storeSet(ACTIVE_KEY, ""); }

export function ProjectsScreen() {
  const [, forceRender] = useState(0);
  useEffect(() => { return onLangChange(() => forceRender((n) => n + 1)); }, []);


  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [scanning, setScanning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectLoadError, setProjectLoadError] = useState(false);
  const [isTauri, setIsTauri] = useState(false);
  const [cpKey, setCpKey] = useState(0);
  const [projectFileTree, setProjectFileTree] = useState<ReturnType<typeof buildMockFileTree>>([]);
  const [isRealTree, setIsRealTree] = useState(false);
  const [scanningTree, setScanningTree] = useState(false);
  const [projectScanError, setProjectScanError] = useState<string | null>(null);
  const [projectScanStatus, setProjectScanStatus] = useState<"idle" | "scanning" | "done" | "failed">("idle");
  const [scanRawNodeCount, setScanRawNodeCount] = useState<number | null>(null);
  const [projectScanSource, setProjectScanSource] = useState<string>("not_started");
  const [manualPath, setManualPath] = useState("");
  const isZh = tk("common.yes") !== "Yes";

  useEffect(() => {
    try { setProjects(loadProjects()); } catch { setProjectLoadError(true); }
  }, []);
  useEffect(() => {
    try { setActiveId(getActiveProjectId()); } catch {}
  }, []);
  useEffect(() => {
    setIsTauri(!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
  }, []);

  const projectFileCount = useMemo(() => {
    function countAll(nodes: any[]): number {
      let n = 0;
      for (const node of nodes) {
        if (node.type === "file") n++;
        if (node.children) n += countAll(node.children);
      }
      return n;
    }
    return countAll(projectFileTree);
  }, [projectFileTree]);

  const projectDirCount = useMemo(() => {
    function countDirs(nodes: any[]): number {
      let n = 0;
      for (const node of nodes) {
        if (node.type === "directory") n++;
        if (node.children) n += countDirs(node.children);
      }
      return n;
    }
    return countDirs(projectFileTree);
  }, [projectFileTree]);

  const activeProject = projects.find(p => p.id === activeId) ?? null;
  const selectedFiles = activeProject?.files.filter(f => f.selected) ?? [];
  const selectedTokens = selectedFiles.reduce((sum, f) => sum + estimateTokens(f.path + f.name), 0);

  // Load real file tree when active project changes (v1.5.3+)
  useEffect(() => {
    if (!activeProject) {
      setProjectFileTree([]);
      setIsRealTree(false);
      setScanningTree(false);
      setProjectScanStatus("idle");
      setProjectScanError(null);
      return;
    }
    let cancelled = false;
    async function loadTree() {
      setScanningTree(true);
      setProjectScanStatus("scanning");
      setProjectScanError(null);
      // Check bridge availability
      let bridgeStatus: { available: boolean; source: "tauri" | "browser" } = { available: false, source: "browser" };
      try { bridgeStatus = await getScanBridgeStatus(); } catch {}
      if (!cancelled) setProjectScanSource(bridgeStatus.source);
      try {
        const nodes = await scanProjectDirectory(activeProject!.folderPath);
        if (!cancelled) {
          if (nodes && nodes.length > 0) {
            setProjectFileTree(nodes);
            setIsRealTree(true);
            setProjectScanStatus("done");
            setScanRawNodeCount(nodes.length);
          } else {
            setScanRawNodeCount(nodes ? nodes.length : 0);
            setProjectFileTree([]);
            setIsRealTree(false);
            setProjectScanStatus("failed");
            setProjectScanError(isZh ? "扫描完成，但未找到可显示文件。请确认路径是否为具体项目文件夹。" : "Scan completed, but no displayable files were found. Please make sure the path points to a specific project folder.");
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error("File tree scan failed:", e);
          setProjectFileTree([]);
          setIsRealTree(false);
          setProjectScanStatus("failed");
          setProjectScanError(e?.message ?? String(e));
        }
      }
      if (!cancelled) setScanningTree(false);
    }
    loadTree();
    return () => { cancelled = true; };
  }, [activeProject]);

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

  const loadProjectAndScan = useCallback(async (folderPath: string) => {
    const normalizedPath = folderPath.trim();
    if (!normalizedPath) return;
    console.log("[ProjectScan] loadProjectAndScan path", normalizedPath);

    const existing = projects.find(p => p.folderPath.toLowerCase() === normalizedPath.toLowerCase());
    const pid = existing ? existing.id : uid();
    if (!existing) {
      const name = normalizedPath.split("\\").pop() || normalizedPath.split("/").pop() || normalizedPath;
      const newProj: Project = { id: pid, name, folderPath: normalizedPath, createdAt: Date.now(), lastOpened: Date.now(), files: [] };
      const updated = [newProj, ...projects];
      setProjects(updated); saveProjects(updated);
    }
    setActiveId(pid); setActiveProjectId(pid);
    setProjectScanStatus("scanning");
    setProjectScanError(null);
    setProjectFileTree([]);
    setScanRawNodeCount(0);
    setProjectScanSource("checking");

    let bridgeStatus = { available: false, source: "browser" as const };
    try { bridgeStatus = await getScanBridgeStatus(); } catch (_) {}
    setProjectScanSource(bridgeStatus.source);
    console.log("[ProjectScan] bridge source", bridgeStatus.source);

    try {
      const nodes = await scanProjectDirectory(normalizedPath);
      console.log("[ProjectScan] raw nodes returned", Array.isArray(nodes) ? nodes.length : typeof nodes);
      const safeTree = Array.isArray(nodes) ? nodes : [];
      const flat = flattenFileTree(safeTree);
      console.log("[ProjectScan] flat nodes", flat.length);

      setProjectFileTree(safeTree);
      setScanRawNodeCount(flat.length);
      setIsRealTree(safeTree.length > 0);
      if (safeTree.length > 0) {
        setProjectScanStatus("done");
      } else {
        setProjectScanStatus("failed");
        setProjectScanError(isZh ? "Scan returned 0 nodes" : "Scan completed but returned 0 nodes.");
      }
    } catch (e: any) {
      console.error("[ProjectScan] error", e?.message ?? String(e));
      setProjectScanStatus("failed");
      setProjectScanError(e?.message ?? "Scan failed");
    }
  }, [projects, isZh]);

  const selectProject = useCallback((id: string) => {
    setActiveId(id); setActiveProjectId(id);
    const updated = projects.map(p => p.id === id ? { ...p, lastOpened: Date.now() } : p);
    setProjects(updated); saveProjects(updated);
    const proj = projects.find(p => p.id === id);
    if (proj) { loadProjectAndScan(proj.folderPath); }
  }, [projects, loadProjectAndScan]);

  const scanProject = useCallback(async (project: Project) => {
    setScanning(project.id); setError(null);
    try {
      if (isTauri) {
        // Real Tauri backend scan
        const { invoke } = await import("@tauri-apps/api/tauri");
        const result: any = await invoke("scan_project_directory", { projectPath: project.folderPath });
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
        setError("Desktop runtime required for real file scanning. Using demo file list.");
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

  const handleAddToContext = useCallback((files: ContextPackFile[]) => {
    addFilesToContextPack(files);
    setCpKey(k => k + 1);
  }, []);

  const toggleAll = useCallback((projectId: string, select: boolean) => {
    const updated = projects.map(p => {
      if (p.id !== projectId) return p;
      return { ...p, files: p.files.map(f => ({ ...f, selected: select })) };
    });
    setProjects(updated); saveProjects(updated);
  }, [projects]);

  return (
    <div style={{ padding: "28px 32px", height: "100%", overflowY: "auto" }}>
      {projectLoadError && (
        <div className="card" style={{ marginBottom: 16, padding: 16, background: "rgba(255,0,0,0.06)", border: "1px solid var(--red)" }}>
          <div style={{ fontWeight: 600, color: "var(--red)", marginBottom: 8 }}>{isZh ? "项目页面加载失败" : "Project page failed to load"}</div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 12 }}>{isZh ? "本地项目数据可能已损坏。清除后重新打开即可。" : "Local project data may be corrupted. Clear it and open a project again."}</p>
          <button className="btn btn-primary" onClick={() => { try { storeSet(STORAGE_KEY, "[]"); storeSet(ACTIVE_KEY, ""); } catch {} setProjects([]); setActiveId(null); setProjectLoadError(false); }} style={{ fontSize: "0.75rem" }}>
            {isZh ? "清除项目状态" : "Clear project state"}
          </button>
        </div>
      )}
      {!projectLoadError && projects.length === 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: 12 }}>&#128193;</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{isZh ? "还没有打开过项目" : "No project opened yet"}</div>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: 400, margin: "0 auto" }}>{isZh ? "打开一个本地文件夹，开始构建项目上下文。" : "Open a local folder to start building project context."}</p>
        </div>
      )}

      {/* Manual project path input */}
      <div className="card" style={{ marginBottom: 16, padding: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") loadProjectAndScan(manualPath); }}
            placeholder={isZh ? "Enter path" : "Enter project folder path..."}
            style={{ flex: 1, padding: "6px 10px", fontSize: "0.78rem", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface)", color: "var(--text)" }}
          />
          <button
            onClick={() => loadProjectAndScan(manualPath)}
            disabled={!manualPath.trim()}
            className="btn btn-primary"
            style={{ fontSize: "0.75rem", padding: "6px 14px" }}
          >
            {isZh ? "Load" : "Load"}
          </button>
        </div>
      </div>

      <h3 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>Recent Projects</h3>
      {projects.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No projects yet.</div>
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
                  {p.files.length} files 路 {p.files.filter(f => f.selected).length} selected 路 ~{selectedTokens} tokens
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

{/* Project Files - always visible */}
      <div style={{ marginTop: 20 }}>
        <div className="card" style={{ padding: 16 }} id="project-files-section">
          <h3 style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>
            {activeProject
              ? `${tk("project.projectFiles")}: ${activeProject.name}${projectScanStatus === "scanning" ? (isZh ? " (scanning)" : " (scanning...)") : projectScanStatus === "done" ? ` (${projectFileCount} ${isZh ? "files" : "files"})` : projectScanStatus === "failed" ? (isZh ? " (scan failed)" : " (scan failed)") : ""}`
              : (isZh ? "Project Files - load a project" : "Project Files - load a project")}
          </h3>
          <div className="scan-diagnostics" style={{ padding: "6px 0", marginBottom: 4, fontSize: "0.68rem", color: "var(--text-muted)", display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
            <span>{isZh ? "Source" : "Source"}: {projectScanSource === "checking" ? "..." : projectScanSource === "tauri" ? (isZh ? "Desktop/Tauri" : "Desktop/Tauri") : projectScanSource === "browser" ? (isZh ? "Browser/Fallback" : "Browser/Fallback") : (isZh ? "Not started" : "Not started")}</span>
            <span>{isZh ? "Status" : "Status"}: {projectScanStatus === "scanning" ? (isZh ? "Scanning" : "Scanning") : projectScanStatus === "done" ? (isZh ? "Done" : "Done") : projectScanStatus === "failed" ? (isZh ? "Failed" : "Failed") : (isZh ? "Idle" : "Idle")}</span>
            <span>{isZh ? "Nodes" : "Nodes"}: {scanRawNodeCount !== null ? scanRawNodeCount : 0}</span>
            <span>{isZh ? "Files" : "Files"}: {projectFileCount}</span>
            <span>{isZh ? "Dirs" : "Dirs"}: {projectDirCount}</span>
          </div>
          {projectScanStatus === "failed" && projectScanError ? (
            <div style={{ padding: 12, marginBottom: 8, background: "var(--surface-alt)", borderRadius: 6, fontSize: "0.78rem", color: "var(--amber)", border: "1px solid var(--border)" }}>
              {projectScanError}
            </div>
          ) : projectScanSource === "browser" && projectScanStatus !== "idle" ? (
            <div style={{ padding: 12, marginBottom: 8, background: "var(--surface-alt)", borderRadius: 6, fontSize: "0.78rem", color: "var(--amber)", border: "1px solid var(--border)" }}>
              {isZh ? "Tauri unavailable" : "Tauri file scanning is unavailable, so real project files could not be scanned."}
            </div>
          ) : null}
          {projectFileTree.length > 0 ? (
            <ProjectFileTree
              nodes={projectFileTree}
              onAddToContext={handleAddToContext}
            />
          ) : projectScanStatus === "done" ? (
            <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              {isZh ? "Scan done but 0 files" : "Scan completed, but no displayable files found."}
            </div>
          ) : projectScanStatus === "idle" && !activeProject ? (
            <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              {isZh ? "Enter path and click Load" : "Enter a project path and click Load, or select a recent project below"}
            </div>
          ) : projectScanStatus === "idle" ? (
            <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              {isZh ? "Click Select to view file tree" : "Click Select on a project below to view its file tree"}
            </div>
          ) : (
            <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              {isZh ? "Loading..." : "Loading..."}
            </div>
          )}
          {activeProject && (
            <div style={{ marginTop: 2, fontSize: "0.65rem", color: "var(--text-muted)" }}>
              <button
                onClick={() => {
                  setProjectScanStatus("scanning");
                  setProjectScanError(null);
                  loadProjectAndScan(activeProject.folderPath);
                }}
                className="btn btn-ghost"
                style={{ fontSize: "0.65rem", padding: "2px 8px" }}
              >
                {isZh ? "Rescan" : "Rescan"}
              </button>
            </div>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <ContextPackPanel key={cpKey} />
        </div>
      </div>
    </div>
  );
}
