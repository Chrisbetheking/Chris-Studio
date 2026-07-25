import { useState, useEffect, useCallback } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import { getBuiltinPlugins } from "@tokenfence/shared/src/plugins/builtin";
import { PROVIDERS } from "@tokenfence/shared/src/providers";
import { isTauri } from "../desktop-bridge";

export function Dashboard() {
  const [tauriAvailable, setTauriAvailable] = useState<boolean | null>(null);
  const [, forceRender] = useState(0);
  const plugins = getBuiltinPlugins();
  const installedPlugins = plugins.filter((p) => p.installed);
  const localProviders = PROVIDERS.filter((p) => p.deployment === "local");
  const cloudProviders = PROVIDERS.filter((p) => p.deployment === "cloud");

  const init = useCallback(async () => {
    setTauriAvailable(await isTauri());
  }, []);

  useEffect(() => { init(); }, [init]);
  useEffect(() => { return onLangChange(() => forceRender((n) => n + 1)); }, []);

  return (
    <div>
      <h1 className="page-title">{tk('app.title')}</h1>
      <p className="page-subtitle">{tk('app.subtitle')} — v1.0.0-rc1</p>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">{tk('nav.providers')}</div>
          <div className="stat-value">{PROVIDERS.length}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>{cloudProviders.length} {tk('providers.cloud')} + {localProviders.length} {tk('providers.local')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{tk('nav.plugins')}</div>
          <div className="stat-value">{plugins.length}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>{installedPlugins.length} {tk('status.installed')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{tk('runtime.localRuntime')}</div>
          <div className="stat-value" style={{ fontSize: "1.2rem" }}>{tauriAvailable === null ? "..." : tauriAvailable ? tk('status.connected') : tk('status.browser')}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>{tauriAvailable ? tk('status.active') : tk('runtime.tauriNotConnected')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{tk('app.version')}</div>
          <div className="stat-value" style={{ fontSize: "1rem" }}>v1.0.0-rc1</div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>Product candidate</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">{tk('runtime.localRuntime')}</div>
            <span className={`badge ${tauriAvailable ? "badge-green" : "badge-amber"}`}>{tauriAvailable ? tk('status.active') : tk('status.browser')}</span>
          </div>
          <div style={{ fontSize: "0.85rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>{tk('runtime.commandExecution')}</span>
              <span style={{ color: tauriAvailable ? "var(--green)" : "var(--text-tertiary)" }}>{tauriAvailable ? tk('status.working') : tk('status.blocked')}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>{tk('runtime.fileIO')}</span>
              <span style={{ color: tauriAvailable ? "var(--green)" : "var(--text-tertiary)" }}>{tauriAvailable ? tk('status.working') : tk('status.blocked')}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>{tk('runtime.outputGeneration')}</span>
              <span style={{ color: "var(--green)" }}>MD, HTML, JSON, PDF, DOCX</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{tk('nav.providers')}</div>
            <span className="badge badge-blue">{PROVIDERS.length}</span>
          </div>
          <div style={{ fontSize: "0.82rem" }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{tk('providers.cloud')}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {cloudProviders.map((p) => (
                <span key={p.provider} className="badge badge-blue">{p.provider}</span>
              ))}
            </div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{tk('providers.local')}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {localProviders.map((p) => (
                <span key={p.provider} className="badge badge-green">{p.provider}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{tk('nav.plugins')}</div>
            <span className="badge badge-gray">{plugins.length}</span>
          </div>
          <div style={{ fontSize: "0.82rem", display: "flex", flexDirection: "column", gap: 4 }}>
            {plugins.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{p.name}</span>
                <span style={{ color: p.installed ? "var(--green)" : "var(--text-tertiary)", fontSize: "0.75rem" }}>{p.installed ? tk('status.installed') : tk('status.available')}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">{tk('common.quickStart')}</div></div>
          <div style={{ fontSize: "0.85rem" }}>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>{tk('nav.providers')} — {tk('providers.notConfigured')}</li>
              <li>{tk('nav.plugins')} — {tk('actions.install')}</li>
              <li>{tk('nav.agentLab')} — {tk('actions.run')}</li>
              <li>{tk('nav.outputs')} — {tk('actions.generate')}</li>
              <li>{tk('nav.routing')} — {tk('actions.test')}</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
