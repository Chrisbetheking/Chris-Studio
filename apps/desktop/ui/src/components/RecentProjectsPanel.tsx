/* RecentProjectsPanel - uses tokenfence.recentProjects & tokenfence.activeProject localStorage keys */
import { useState, useEffect, useCallback } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import {
  loadRecentProjects,
  addRecentProject,
  removeRecentProject,
  pinProject,
  unpinProject,
  toggleFavoriteProject,
  setActiveProject,
  loadActiveProject,
  type RecentProject,
} from "../data/project-workspace";

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return tk("project.justNow");
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

export function RecentProjectsPanel({ onOpenProject }: { onOpenProject?: (project: { name: string; path: string }) => void } = {}) {
  const [, forceRender] = useState(0);
  useEffect(() => {
    return onLangChange(() => forceRender((n) => n + 1));
  }, []);

  const [projects, setProjects] = useState<RecentProject[]>(() => loadRecentProjects());
  const [activeProject, setActiveProjectState] = useState<RecentProject | null>(() => loadActiveProject());
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");

  const refresh = useCallback(() => {
    setProjects(loadRecentProjects());
    setActiveProjectState(loadActiveProject());
  }, []);

  const handleOpen = useCallback(
    (project: RecentProject) => {
      const updated = addRecentProject({ name: project.name, path: project.path });
      setActiveProject(project);
      setProjects(updated);
      setActiveProjectState(project);
      console.log("[RecentProjectsPanel] Open clicked:", JSON.stringify({ id: project.id, name: project.name, path: project.path }));
      if (onOpenProject) onOpenProject(project);
    },
    [onOpenProject]
  );

  const handleRemove = useCallback(
    (id: string) => {
      const updated = removeRecentProject(id);
      setProjects(updated);
      if (activeProject?.id === id) {
        setActiveProjectState(null);
      }
    },
    [activeProject]
  );

  const handlePin = useCallback(
    (id: string) => {
      const updated = pinProject(id);
      setProjects(updated);
    },
    []
  );

  const handleUnpin = useCallback(
    (id: string) => {
      const updated = unpinProject(id);
      setProjects(updated);
    },
    []
  );

  const handleFavorite = useCallback(
    (id: string) => {
      const updated = toggleFavoriteProject(id);
      setProjects(updated);
    },
    []
  );

  const handleAddProject = useCallback(() => {
    if (!newName.trim() || !newPath.trim()) return;
    addRecentProject({ name: newName.trim(), path: newPath.trim() });
    setNewName("");
    setNewPath("");
    setShowAdd(false);
    refresh();
  }, [newName, newPath, refresh]);

  if (projects.length === 0) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <h4 style={{ margin: 0, color: "var(--text)", fontSize: "0.8rem", fontWeight: 600 }}>
            {tk("project.recentProjects")}
          </h4>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="btn btn-ghost"
            style={{
              fontSize: "0.65rem",
              padding: "2px 8px",
              color: "var(--primary)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            + {tk("project.addProject")}
          </button>
        </div>
        {showAdd && (
          <div
            className="card"
            style={{
              padding: 10,
              marginBottom: 8,
              background: "var(--surface-alt)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={tk("project.projectNamePlaceholder")}
              style={{
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: "0.7rem",
                outline: "none",
              }}
            />
            <input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder={tk("project.projectPathPlaceholder")}
              style={{
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: "0.7rem",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={handleAddProject}
                className="btn btn-primary"
                style={{
                  fontSize: "0.7rem",
                  padding: "4px 12px",
                  background: "var(--primary)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                {tk("project.addProject")}
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="btn btn-ghost"
                style={{
                  fontSize: "0.7rem",
                  padding: "4px 12px",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                {tk("common.cancel")}
              </button>
            </div>
          </div>
        )}
        <div className="card" style={{ padding: 20, background: "var(--surface-alt)", textAlign: "center" }}>
          <div style={{ fontSize: "1.2rem", marginBottom: 6, opacity: 0.5 }}>{"📁"}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {tk("project.noRecentProjects")}
          </div>
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 4 }}>
            {tk("project.addProjectHint")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <h4 style={{ margin: 0, color: "var(--text)", fontSize: "0.8rem", fontWeight: 600 }}>
          {tk("project.recentProjects")}
        </h4>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="btn btn-ghost"
          style={{
            fontSize: "0.65rem",
            padding: "2px 8px",
            color: "var(--primary)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          + {tk("project.addProject")}
        </button>
      </div>

      {showAdd && (
        <div
          className="card"
          style={{
            padding: 10,
            marginBottom: 8,
            background: "var(--surface-alt)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={tk("project.projectNamePlaceholder")}
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: "0.7rem",
              outline: "none",
            }}
          />
          <input
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder={tk("project.projectPathPlaceholder")}
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: "0.7rem",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleAddProject}
              className="btn btn-primary"
              style={{
                fontSize: "0.7rem",
                padding: "4px 12px",
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {tk("project.addProject")}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="btn btn-ghost"
              style={{
                fontSize: "0.7rem",
                padding: "4px 12px",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {tk("common.cancel")}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {projects.map((project) => {
          const isActive = activeProject?.id === project.id;
          return (
            <div
              key={project.id}
              className="card"
              style={{
                padding: 10,
                background: isActive ? "var(--surface-alt)" : "var(--surface)",
                border: isActive ? "1px solid var(--primary)" : "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); console.log("[RecentProjectsPanel] Card clicked", project.name, project.path); handleOpen(project); }}
                >
                  <div style={{ fontSize: "0.75rem", color: "var(--text)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {project.favorite ? "★ " : ""}{project.pinned ? "📌 " : ""}{project.name}
                  </div>
                  <div style={{ fontSize: "0.6rem", color: project.path ? "var(--text-muted)" : "var(--red)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
                    {project.path || "Missing path"}
                  </div>
                  <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 8 }}>
                    <span>{formatTime(project.lastOpenedAt)}</span>
                    {isActive && (
                      <span style={{ color: "var(--primary)", fontWeight: 500 }}>
                        ● {tk("project.currentProject")}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 2, flexShrink: 0, marginLeft: 4 }}>
                  <button
                    type="button" disabled={!project.path} onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (!project.path) return; console.log("[RecentProjectsPanel] Open button clicked", project.name, project.path); handleOpen(project); }}
                    title={tk("project.openProject")}
                    style={{
                      background: "none",
                      border: "none",
                      color: project.path ? "var(--primary)" : "var(--text-muted)",
                      cursor: project.path ? "pointer" : "not-allowed",
                      fontSize: "0.65rem",
                      padding: "1px 4px",
                      opacity: project.path ? 1 : 0.5,
                    }}
                  >
                    {tk("project.open")}
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                <button
                  onClick={() => (project.pinned ? handleUnpin(project.id) : handlePin(project.id))}
                  title={project.pinned ? tk("project.unpin") : tk("project.pin")}
                  style={{
                    background: "none",
                    border: "none",
                    color: project.pinned ? "var(--amber)" : "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "0.6rem",
                    padding: "1px 6px",
                    borderRadius: 3,
                  }}
                >
                  {project.pinned ? tk("project.unpin") : tk("project.pin")}
                </button>
                <button
                  onClick={() => handleFavorite(project.id)}
                  title={project.favorite ? tk("project.unfavorite") : tk("project.favorite")}
                  style={{
                    background: "none",
                    border: "none",
                    color: project.favorite ? "var(--amber)" : "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "0.6rem",
                    padding: "1px 6px",
                    borderRadius: 3,
                  }}
                >
                  {project.favorite ? tk("project.unfavorite") : tk("project.favorite")}
                </button>
                <button
                  onClick={() => handleRemove(project.id)}
                  title={tk("project.remove")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "0.6rem",
                    padding: "1px 6px",
                    borderRadius: 3,
                    marginLeft: "auto",
                  }}
                >
                  {tk("project.remove")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}