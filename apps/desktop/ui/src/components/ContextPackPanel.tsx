import { useState, useCallback, useEffect } from "react";
import { tk } from "@tokenfence/shared/src/i18n";
import {
  loadContextPack,
  removeFileFromContextPack,
  clearContextPack,
  type ContextPackState,
} from "../data/context-pack";

interface ContextPackPanelProps {
  compact?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function ContextPackPanel({ compact = false }: ContextPackPanelProps) {
  const [state, setState] = useState<ContextPackState>(loadContextPack);

  const refresh = useCallback(() => setState(loadContextPack()), []);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("tokenfence:contextPackUpdated", handler);
    return () => window.removeEventListener("tokenfence:contextPackUpdated", handler);
  }, [refresh]);

  const handleRemove = useCallback((fileId: string) => {
    removeFileFromContextPack(fileId);
    refresh();
  }, [refresh]);

  const handleClear = useCallback(() => {
    clearContextPack();
    refresh();
  }, [refresh]);

  const totalSize = state.files.reduce((s, f) => s + f.sizeBytes, 0);

  if (compact) {
    return (
      <div style={{ padding: "8px 0" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: 4 }}>
          {tk("context.title")} ({state.files.length})
        </div>
        {state.files.length === 0 ? (
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
            {tk("context.empty")}
          </div>
        ) : (
          <div>
            {state.files.map(f => (
              <div key={f.id} style={{ fontSize: "0.65rem", padding: "2px 0", display: "flex", justifyContent: "space-between" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.name}
                  {f.isLarge && <span style={{ color: "var(--amber)", marginLeft: 4 }}>{tk("project.large")}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{tk("context.title")}</span>
        {state.files.length > 0 && (
          <button
            onClick={handleClear}
            style={{
              background: "transparent",
              color: "var(--red)",
              border: "1px solid var(--red)",
              borderRadius: 3,
              padding: "2px 8px",
              cursor: "pointer",
              fontSize: "0.65rem",
            }}
          >
            {tk("context.clear")}
          </button>
        )}
      </div>

      {state.files.length === 0 ? (
        <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: "0.75rem" }}>
          {tk("context.emptyHint")}
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: "0.7rem", color: "var(--text-muted)" }}>
            <span>{tk("context.fileCount")}: {state.files.length}</span>
            <span>{tk("context.totalSize")}: {formatSize(totalSize)}</span>
          </div>
          <div className="section-list">
            {state.files.map(f => (
              <div className="section-item" key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                    {f.isLarge && <span style={{ color: "var(--amber)", marginLeft: 4, fontSize: "0.65rem" }}>{tk("project.large")}</span>}
                  </div>
                  <div style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>
                    {f.relativePath} ? {formatSize(f.sizeBytes)} ? {f.fileType}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(f.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                  title={tk("context.remove")}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
