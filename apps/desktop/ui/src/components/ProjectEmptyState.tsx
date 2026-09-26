import { tk } from "@tokenfence/shared/src/i18n";
import { useState, useEffect } from "react";
import { onLangChange } from "@tokenfence/shared/src/i18n";

export function ProjectEmptyState() {
  const [, forceRender] = useState(0);
  useEffect(() => {
    return onLangChange(() => forceRender((n) => n + 1));
  }, []);

  return (
    <div className="card" style={{
      padding: 24,
      marginBottom: 12,
      background: "var(--surface-alt)",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      borderRadius: 8,
      border: "1px dashed var(--border)",
    }}>
      <div style={{ fontSize: "1.8rem", opacity: 0.5, marginBottom: 4 }}>
        {"📂"}
      </div>
      <div style={{ fontSize: "0.85rem", color: "var(--text)", fontWeight: 600 }}>
        {tk("project.emptyRecentTitle")}
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", maxWidth: 280, lineHeight: 1.4 }}>
        {tk("project.emptyRecentDescription")}
      </div>
      <button
        className="btn btn-ghost"
        style={{
          marginTop: 8,
          fontSize: "0.75rem",
          padding: "8px 18px",
          color: "var(--primary)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          cursor: "pointer",
          transition: "background 0.15s",
        }}
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent("tokenfence:navigate", { detail: { screen: "projects" } })
          );
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-alt)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface)")}
      >
        {tk("project.openProjectTab")} &rarr;
      </button>
    </div>
  );
}

/* Key: tokenfence.recentProjects */
