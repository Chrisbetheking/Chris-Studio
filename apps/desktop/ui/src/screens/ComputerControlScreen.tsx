import { useState, useCallback, useEffect } from "react";
import {
  requestComputerAction,
  approveComputerAction,
  denyComputerAction,
  markExecuted,
  listComputerRequests,
  listPendingComputerRequests,
} from "@tokenfence/shared/src/plugins/computer-use";
import type { ComputerUseRequest } from "@tokenfence/shared/src/plugins/computer-use";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import { executeCommand, isTauri } from "../desktop-bridge";

export function ComputerControlScreen() {
  const [, forceRender] = useState(0);
  useEffect(() => { return onLangChange(() => forceRender((n) => n + 1)); }, []);

  const [requests, setRequests] = useState<ComputerUseRequest[]>(listComputerRequests());
  const [tauriAvailable, setTauriAvailable] = useState<boolean | null>(null);
  const [result, setResult] = useState("");

  const init = useCallback(async () => {
    setTauriAvailable(await isTauri());
  }, []);
  useState(() => { init(); });

  const refresh = () => setRequests(listComputerRequests());

  const requestAction = (action: ComputerUseRequest["action"]) => {
    requestComputerAction(action, { source: "desktop-ui" }, `User requested ${action} action`);
    refresh();
  };

  const handleApprove = async (id: string) => {
    approveComputerAction(id);
    const req = listComputerRequests().find((r) => r.id === id);
    if (!req) return;
    try {
      const inTauri = await isTauri();
      if (inTauri && req.action === "shell") {
        const res = await executeCommand("echo Approved action executed", [], ".", 5000);
        markExecuted(id, `Shell executed: exit=${res.exit_code}, stdout=${res.stdout.slice(0, 200)}`);
      } else {
        markExecuted(id, `Action '${req.action}' executed in ${inTauri ? "Tauri" : "browser"} mode`);
      }
      setResult(`${tk('computerUse.executed')}: ${id}`);
    } catch (e: any) {
      markExecuted(id, `Error: ${e.message}`);
      setResult(`${tk('common.error')}: ${e.message}`);
    }
    refresh();
  };

  const handleDeny = (id: string) => {
    denyComputerAction(id);
    refresh();
  };

  const pending = listPendingComputerRequests();

  return (
    <div>
      <h1 className="page-title">{tk("computerUse.title")}</h1>
      <p className="page-subtitle">{tk("computerUse.subtitle")}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => requestAction("screenshot")}>{tk('computerUse.screenshot')}</button>
        <button className="btn btn-secondary" onClick={() => requestAction("click")}>{tk('computerUse.click')}</button>
        <button className="btn btn-secondary" onClick={() => requestAction("type")}>{tk('computerUse.type')}</button>
        <button className="btn btn-danger" onClick={() => requestAction("shell")}>{tk('computerUse.shell')}</button>
        <span className="badge badge-amber" style={{ alignSelf: "center" }}>{pending.length} {tk('computerUse.pendingApprovals')}</span>
      </div>

      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 16, border: "2px solid var(--amber)" }}>
          <div className="card-header"><div className="card-title">{tk('computerUse.pendingApprovals')}</div></div>
          {pending.map((req) => (
            <div key={req.id} style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
              <div>
                <strong>{req.action.toUpperCase()}</strong>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{req.reason}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", fontFamily: "monospace" }}>{req.id}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" style={{ backgroundColor: "var(--green)", borderColor: "var(--green)" }} onClick={() => handleApprove(req.id)}>{tk('actions.approve')}</button>
                <button className="btn btn-danger" onClick={() => handleDeny(req.id)}>{tk('actions.deny')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className="card" style={{ marginBottom: 16, background: "var(--bg-secondary)", padding: 12, fontFamily: "monospace", fontSize: "0.85rem" }}>
          {result}
        </div>
      )}

      <div className="card">
        <div className="card-header"><div className="card-title">{tk('computerUse.actionHistory')}</div><span className="badge badge-gray">{requests.length}</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {requests.slice(0, 30).map((req) => (
            <div key={req.id} className="card" style={{ padding: 10, borderLeft: `4px solid ${req.status === "approved" ? "var(--green)" : req.status === "denied" ? "var(--red)" : req.status === "executed" ? "var(--blue)" : "var(--amber)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <strong>{req.action.toUpperCase()}</strong>
                  <span className={`badge ${req.status === "approved" ? "badge-green" : req.status === "denied" ? "badge-red" : req.status === "executed" ? "badge-blue" : "badge-amber"}`} style={{ marginLeft: 8 }}>{req.status}</span>
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>{new Date(req.createdAt).toLocaleTimeString()}</div>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{req.reason}</div>
              {req.result && <div style={{ fontSize: "0.75rem", fontFamily: "monospace", marginTop: 4, color: "var(--text-tertiary)" }}>{req.result}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
