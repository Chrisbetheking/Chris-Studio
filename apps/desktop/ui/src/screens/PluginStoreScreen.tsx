import { useState } from "react";
import { getBuiltinPlugins, getPluginsByCategory } from "@tokenfence/shared/src/plugins/builtin";
import type { PluginManifest } from "@tokenfence/shared/src/agent-runtime/types";

const plugins = getBuiltinPlugins();
const categories = [...new Set(plugins.map((p) => p.category))];

const catLabels: Record<string, string> = {
  "knowledge": "Knowledge",
  "output": "Output",
  "media": "Media",
  "api": "API",
  "computer-use": "Computer Use",
  "built-in": "Built-in",
};

export function PluginStoreScreen() {
  const [filter, setFilter] = useState<string>("all");
  const [installed, setInstalled] = useState<Set<string>>(new Set(plugins.filter((p) => p.installed).map((p) => p.id)));
  const [enabled, setEnabled] = useState<Set<string>>(new Set(plugins.filter((p) => p.enabled).map((p) => p.id)));

  const toggleInstall = (id: string) => {
    setInstalled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleEnable = (id: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = filter === "all" ? plugins : plugins.filter((p) => p.category === filter);

  return (
    <div>
      <h1 className="page-title">Plugin Store</h1>
      <p className="page-subtitle">Browse, install, and configure local agent plugins</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button className={`btn ${filter === "all" ? "btn-primary" : "btn-secondary"}`} onClick={() => setFilter("all")}>All ({plugins.length})</button>
        {categories.map((c) => (
          <button key={c} className={`btn ${filter === c ? "btn-primary" : "btn-secondary"}`} onClick={() => setFilter(c)}>{catLabels[c] || c} ({getPluginsByCategory(c).length})</button>
        ))}
      </div>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-label">Available</div><div className="stat-value">{plugins.length}</div></div>
        <div className="stat-card"><div className="stat-label">Installed</div><div className="stat-value">{installed.size}</div></div>
        <div className="stat-card"><div className="stat-label">Enabled</div><div className="stat-value">{enabled.size}</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {filtered.map((p) => (
          <div key={p.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <strong>{p.name}</strong>
                <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>v{p.version} — {p.id}</div>
                <div style={{ fontSize: "0.8rem", marginTop: 4 }}>{p.description}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
              <span className={`badge ${p.riskLevel === "high" ? "badge-red" : p.riskLevel === "medium" ? "badge-amber" : "badge-green"}`}>{p.riskLevel}</span>
              <span className="badge badge-blue">{p.runtime}</span>
              <span className="badge badge-gray">{catLabels[p.category] || p.category}</span>
              {p.requiresApproval && <span className="badge badge-amber">Approval</span>}
            </div>

            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: 8 }}>
              Permissions: {p.permissions.join(", ")}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className={`btn ${installed.has(p.id) ? "btn-danger" : "btn-primary"}`} style={{ fontSize: "0.8rem", padding: "4px 12px" }} onClick={() => toggleInstall(p.id)}>
                {installed.has(p.id) ? "Uninstall" : "Install"}
              </button>
              {installed.has(p.id) && (
                <button className={`btn ${enabled.has(p.id) ? "btn-secondary" : "btn-primary"}`} style={{ fontSize: "0.8rem", padding: "4px 12px" }} onClick={() => toggleEnable(p.id)}>
                  {enabled.has(p.id) ? "Disable" : "Enable"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

