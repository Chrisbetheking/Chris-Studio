import { useState, useCallback } from "react";
import {
  getRouterRules,
  setRouterRules,
  routeTask,
  markProviderHealthy,
  markProviderUnhealthy,
  loadRouterRules,
} from "@tokenfence/shared/src/plugins/model-router";
import type { RouterRule, TaskCategory, RoutingDecision } from "@tokenfence/shared/src/plugins/model-router";
import { tk } from "@tokenfence/shared/src/i18n";

const categories: TaskCategory[] = ["general", "code", "document", "creative", "analysis", "safety", "agent"];

interface EditRuleState {
  rule: RouterRule;
  primaryModel: string;
  fallbackModel: string;
  askBeforeSwitch: boolean;
}

export function RoutingScreen() {
  const [rules, setRules] = useState<RouterRule[]>(getRouterRules());
  const [decisions, setDecisions] = useState<{ category: TaskCategory; decision: RoutingDecision }[]>([]);
  const [editingRule, setEditingRule] = useState<EditRuleState | null>(null);

  const runAllRoutes = useCallback(() => {
    const results = categories.map((cat) => ({
      category: cat,
      decision: routeTask(cat),
    }));
    setDecisions(results);
  }, []);

  const resetHealth = (provider: string) => {
    markProviderHealthy(provider);
    runAllRoutes();
  };

  const markUnhealthy = (provider: string) => {
    markProviderUnhealthy(provider);
    runAllRoutes();
  };

  const openEdit = (rule: RouterRule) => {
    const fallback = rule.fallbackChain.length > 0 ? rule.fallbackChain[0] : "";
    setEditingRule({
      rule,
      primaryModel: rule.primaryModel,
      fallbackModel: fallback,
      askBeforeSwitch: rule.localPreferred,
    });
  };

  const saveEdit = () => {
    if (!editingRule) return;
    const updated = rules.map((r) => {
      if (r.taskCategory === editingRule.rule.taskCategory) {
        const newChain = editingRule.fallbackModel
          ? [editingRule.fallbackModel, ...r.fallbackChain.slice(1)]
          : r.fallbackChain;
        return {
          ...r,
          primaryModel: editingRule.primaryModel,
          fallbackChain: newChain,
          localPreferred: editingRule.askBeforeSwitch,
        };
      }
      return r;
    });
    setRouterRules(updated);
    setRules(updated);
    setEditingRule(null);
  };

  return (
    <div>
      <h1 className="page-title">{tk("nav.routing")}</h1>
      <p className="page-subtitle">{tk("router.subtitle")}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={runAllRoutes}>{tk("router.runAllRoutes")}</button>
        <button className="btn btn-secondary" onClick={() => { loadRouterRules(); setRules(getRouterRules()); }}>{tk("actions.reload")}</button>
      </div>

      {decisions.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><div className="card-title">{tk("router.currentDecisions")}</div></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
            {decisions.map((d) => (
              <div key={d.category} className="card" style={{ padding: 10, borderLeft: `4px solid ${d.decision.isFallback ? "var(--amber)" : "var(--green)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{d.category}</strong>
                  <span className={`badge ${d.decision.isFallback ? "badge-amber" : "badge-green"}`}>{d.decision.isFallback ? `Fallback #${d.decision.fallbackIndex}` : "Primary"}</span>
                </div>
                <div style={{ fontSize: "0.85rem" }}>
                  {d.decision.provider} / {d.decision.model}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{d.decision.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><div className="card-title">{tk("router.rules")}</div></div>
        {rules.map((rule) => (
          <div key={rule.taskCategory} className="card" style={{ padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <strong>{rule.taskCategory.toUpperCase()}</strong>
              <span className={`badge ${rule.localPreferred ? "badge-green" : "badge-blue"}`}>{rule.localPreferred ? "Local Preferred" : "Cloud"}</span>
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              Primary: {rule.primaryProvider} / {rule.primaryModel}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", marginTop: 2 }}>
              Fallback chain: {rule.fallbackChain.join(" → ")}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <button className="btn btn-secondary" style={{ fontSize: "0.7rem", padding: "2px 8px" }} onClick={() => markUnhealthy(rule.primaryProvider)}>Mark {rule.primaryProvider} Unhealthy</button>
              <button className="btn btn-secondary" style={{ fontSize: "0.7rem", padding: "2px 8px" }} onClick={() => resetHealth(rule.primaryProvider)}>Reset {rule.primaryProvider}</button>
              <button className="btn btn-primary" style={{ fontSize: "0.7rem", padding: "2px 8px", marginLeft: "auto" }} onClick={() => openEdit(rule)}>{tk("routing.edit")}</button>
            </div>
          </div>
        ))}
      </div>

      {editingRule && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setEditingRule(null)}>
          <div className="card" style={{ width: 420, maxWidth: "90vw", padding: 20, backgroundColor: "var(--bg-primary)" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-title" style={{ marginBottom: 16 }}>{tk("routing.editRule")}</div>
            <div style={{ marginBottom: 12 }}>
              <div className="section-item-title" style={{ marginBottom: 4 }}>{tk("routing.fileType")}</div>
              <div style={{ padding: "8px 12px", backgroundColor: "var(--bg-secondary)", borderRadius: 6, fontSize: "0.9rem" }}>{editingRule.rule.taskCategory.toUpperCase()}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="section-item-title" style={{ marginBottom: 4, display: "block" }}>{tk("routing.primaryModel")}</label>
              <input className="input" value={editingRule.primaryModel} onChange={(e) => setEditingRule({ ...editingRule, primaryModel: e.target.value })} style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="section-item-title" style={{ marginBottom: 4, display: "block" }}>{tk("routing.fallbackModel")}</label>
              <input className="input" value={editingRule.fallbackModel} onChange={(e) => setEditingRule({ ...editingRule, fallbackModel: e.target.value })} style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={editingRule.askBeforeSwitch} onChange={(e) => setEditingRule({ ...editingRule, askBeforeSwitch: e.target.checked })} />
                <span>{tk("routing.askBeforeSwitch")}</span>
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setEditingRule(null)}>{tk("actions.cancel")}</button>
              <button className="btn btn-primary" onClick={saveEdit}>{tk("actions.save")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}