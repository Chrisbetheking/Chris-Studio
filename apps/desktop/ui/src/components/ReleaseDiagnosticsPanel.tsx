import { useState, useCallback } from "react";
import { VERSION } from "../App";
import { BUILD_INFO } from "../data/build-info";
import { tk } from "@tokenfence/shared/src/i18n";

function getLsStatus(key: string): "ok" | "missing" | "invalid" {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return "missing";
    JSON.parse(raw);
    return "ok";
  } catch {
    return "invalid";
  }
}

const LS_KEYS = [
  "tokenfence.activeModel",
  "tokenfence.recentProjects",
  "tokenfence.activeProject",
  "tokenfence.router-rules",
] as const;

export function ReleaseDiagnosticsPanel() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [cleared, setCleared] = useState(false);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const clearProjectState = useCallback(() => {
    localStorage.removeItem("tokenfence.recentProjects");
    localStorage.removeItem("tokenfence.activeProject");
    setCleared(true);
    setTimeout(() => setCleared(false), 3000);
    refresh();
  }, [refresh]);

  const version = VERSION;
  const expectedPath = "E:\\Apps\\TokenFenceStudio\\" + version + "\\TokenFence Studio.exe";
  const expectedZip = "TokenFence-Studio-Windows-" + version + "-portable.zip";

  // Shortcut checks (simplified - full check via PowerShell script)
  const shortcutStatuses = LS_KEYS.map(k => ({ key: k, status: getLsStatus(k) }));

  const statusLabel = (s: string) => {
    if (s === "ok") return { text: tk("diagnostics.ok"), color: "var(--green)" };
    if (s === "missing") return { text: tk("diagnostics.missing"), color: "var(--text-muted)" };
    return { text: tk("diagnostics.invalidJson"), color: "var(--red)" };
  };

  return (
    <div className="card" style={{ marginTop: 16 }} key={refreshKey}>
      <div className="card-title" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{tk("diagnostics.title")}</span>
        <button
          onClick={refresh}
          style={{
            background: "var(--primary)",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            padding: "4px 12px",
            cursor: "pointer",
            fontSize: "0.75rem",
          }}
        >
          {tk("diagnostics.refreshDiagnostics")}
        </button>
      </div>

      {/* Version & Path */}
      <div className="section-list" style={{ marginBottom: 12 }}>
        <div className="section-item">
          <div className="section-item-title">{tk("diagnostics.currentVersion")}</div>
          <div className="section-item-desc" style={{ fontWeight: 600 }}>{version}</div>
        </div>
        <div className="section-item">
          <div className="section-item-title">{tk("diagnostics.expectedPath")}</div>
          <div className="section-item-desc" style={{ fontSize: "0.7rem", wordBreak: "break-all" }}>{expectedPath}</div>
        </div>
        <div className="section-item">
          <div className="section-item-title">{tk("diagnostics.expectedZip")}</div>
          <div className="section-item-desc">{expectedZip}</div>
        </div>
        <div className="section-item">
          <div className="section-item-title">{tk("diagnostics.buildCommit")}</div>
          <div className="section-item-desc" style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>{BUILD_INFO.commit}</div>
        </div>
        <div className="section-item">
          <div className="section-item-title">{tk("diagnostics.buildTime")}</div>
          <div className="section-item-desc" style={{ fontSize: "0.7rem" }}>{BUILD_INFO.builtAt}</div>
        </div>
      </div>

      {/* Shortcut Health */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 6 }}>{tk("diagnostics.shortcutHealth")}</div>
        <div className="section-list">
          <div className="section-item">
            <div className="section-item-title">{tk("diagnostics.desktopShortcut")}</div>
            <div className="section-item-desc" style={{ color: statusLabel(shortcutStatuses[0].status).color }}>
              {tk("diagnostics.notChecked")}
            </div>
          </div>
          <div className="section-item">
            <div className="section-item-title">{tk("diagnostics.startMenuShortcut")}</div>
            <div className="section-item-desc" style={{ color: statusLabel(shortcutStatuses[0].status).color }}>
              {tk("diagnostics.notChecked")}
            </div>
          </div>
          <div className="section-item">
            <div className="section-item-title">{tk("diagnostics.taskbarReminder")}</div>
            <div className="section-item-desc" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              {tk("diagnostics.taskbarPinWarning")}
            </div>
          </div>
        </div>
      </div>

      {/* localStorage Health */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 6 }}>{tk("diagnostics.localStorage")}</div>
        <div className="section-list">
          {shortcutStatuses.map(s => (
            <div className="section-item" key={s.key}>
              <div className="section-item-title" style={{ fontSize: "0.7rem" }}>{s.key}</div>
              <div className="section-item-desc" style={{ color: statusLabel(s.status).color, fontSize: "0.75rem" }}>
                {statusLabel(s.status).text}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={clearProjectState}
          style={{
            marginTop: 8,
            background: "transparent",
            color: "var(--amber)",
            border: "1px solid var(--amber)",
            borderRadius: 4,
            padding: "3px 10px",
            cursor: "pointer",
            fontSize: "0.7rem",
          }}
        >
          {tk("diagnostics.clearProjectState")}
        </button>
        {cleared && (
          <span style={{ marginLeft: 8, fontSize: "0.7rem", color: "var(--green)" }}>
            {tk("diagnostics.projectStateCleared")}
          </span>
        )}
      </div>

      {/* Pre-release Checklist */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 6 }}>{tk("diagnostics.releaseChecklist")}</div>
        <div className="section-list">
          {[
            tk("diagnostics.checklistCurrentPath"),
            tk("diagnostics.checklistDesktopShortcut"),
            tk("diagnostics.checklistStartMenu"),
            tk("diagnostics.checklistReadme"),
            tk("diagnostics.checklistEmail"),
            tk("diagnostics.checklistModelRuntime"),
            tk("diagnostics.checklistSensitive"),
          ].map((item, i) => (
            <div className="section-item" key={i} style={{ padding: "4px 0" }}>
              <span style={{ marginRight: 8, color: "var(--text-muted)" }}>?</span>
              <span style={{ fontSize: "0.7rem" }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Old version warning */}
      <div style={{ marginTop: 8, padding: 8, background: "var(--surface-alt)", borderRadius: 4, fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
        {tk("diagnostics.oldVersionWarning")}
      </div>
    </div>
  );
}
