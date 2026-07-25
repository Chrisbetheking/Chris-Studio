import { useState, useCallback } from "react";
import { ProjectFileNode, flattenFileTree, isSupportedFile } from "../data/project-file-tree";
import { ContextPackFile, loadContextPack } from "../data/context-pack";
import { tk } from "@tokenfence/shared/src/i18n";

interface ProjectFileTreeProps {
  nodes: ProjectFileNode[];
  onAddToContext: (files: ContextPackFile[]) => void;
}

function getFileIcon(ftype: string | undefined): string {
  if (!ftype) return "📄";
  if (ftype === "other") return "📄";
  return "📃";
}

interface TreeNodeProps {
  node: ProjectFileNode;
  depth: number;
  selectedIds: Set<string>;
  onToggleSelect: (node: ProjectFileNode) => void;
}

function TreeNode({ node, depth, selectedIds, onToggleSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === "directory";
  const isSelected = selectedIds.has(node.id);
  const cp = loadContextPack();
  const isInContext = cp.files.some(f => f.path === node.path);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "2px 0",
          paddingLeft: depth * 16 + 4,
          cursor: isDir ? "pointer" : "default",
          fontSize: "0.75rem",
          gap: 4,
        }}
        onClick={() => isDir && setExpanded(!expanded)}
      >
        {isDir && (
          <span style={{ width: 14, textAlign: "center", flexShrink: 0 }}>
            {expanded ? "▼" : "▶"}
          </span>
        )}
        {!isDir && <span style={{ width: 14, flexShrink: 0 }} />}
        {!isDir && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => { e.stopPropagation(); onToggleSelect(node); }}
            style={{ margin: 0, flexShrink: 0 }}
            disabled={!isSupportedFile(node.name)}
          />
        )}
        <span style={{ flexShrink: 0 }}>{isDir ? (expanded ? "📂" : "📁") : getFileIcon(node.fileType)}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
        {!isDir && !isSupportedFile(node.name) && (
          <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", flexShrink: 0 }}>{tk("project.unsupported")}</span>
        )}
        {isInContext && (
          <span style={{ fontSize: "0.6rem", color: "var(--green)", flexShrink: 0 }}>{tk("project.included")}</span>
        )}
      </div>
      {isDir && expanded && node.children && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectFileTree({ nodes, onAddToContext }: ProjectFileTreeProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((node: ProjectFileNode) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
  }, []);

  const handleAddToContext = useCallback(() => {
    const flat = flattenFileTree(nodes);
    const selected = flat.filter(n => selectedIds.has(n.id) && n.type === "file" && isSupportedFile(n.name));
    if (selected.length === 0) return;
    const files: ContextPackFile[] = selected.map(n => ({
      id: "",
      name: n.name,
      path: n.path,
      relativePath: n.relativePath,
      sizeBytes: n.sizeBytes || 0,
      fileType: n.fileType || "other",
      addedAt: Date.now(),
      isLarge: false,
    }));
    onAddToContext(files);
    setSelectedIds(new Set());
  }, [nodes, selectedIds, onAddToContext]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectedCount = flattenFileTree(nodes).filter(n => selectedIds.has(n.id) && n.type === "file").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>{tk("project.fileTree")}</div>
        <div style={{ display: "flex", gap: 4 }}>
          {selectedCount > 0 && (
            <button
              onClick={clearSelection}
              style={{
                background: "transparent",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                padding: "2px 8px",
                cursor: "pointer",
                fontSize: "0.65rem",
              }}
            >
              {tk("project.clearSelection")}
            </button>
          )}
          <button
            onClick={handleAddToContext}
            disabled={selectedCount === 0}
            style={{
              background: selectedCount > 0 ? "var(--primary)" : "var(--surface-alt)",
              color: selectedCount > 0 ? "#fff" : "var(--text-muted)",
              border: "none",
              borderRadius: 3,
              padding: "2px 8px",
              cursor: selectedCount > 0 ? "pointer" : "default",
              fontSize: "0.65rem",
            }}
          >
            {tk("project.addToContext")}
          </button>
        </div>
      </div>
      <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 4, padding: 4 }}>
        {nodes.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: "0.75rem" }}>
            {tk("project.noProjectFiles")}
          </div>
        ) : (
          nodes.map(node => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          ))
        )}
      </div>
      {selectedCount > 0 && (
        <div style={{ marginTop: 4, fontSize: "0.65rem", color: "var(--text-muted)" }}>
          {selectedCount} {tk("project.selected")}
        </div>
      )}
    </div>
  );
}
