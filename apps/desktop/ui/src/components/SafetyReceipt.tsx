import { tk } from "@tokenfence/shared/src/i18n";
import type { GuardResult } from "@tokenfence/shared/src/types";
import { Shield, AlertTriangle, CheckCircle } from "lucide-react";

interface SafetyReceiptProps {
  result: GuardResult;
  provider: string;
  model: string;
  onClose: () => void;
}

export function SafetyReceipt({ result, provider, model, onClose }: SafetyReceiptProps) {
  const riskInfo = (() => {
    switch (result.riskLevel) {
      case "safe": return { color: "var(--tf-success)", bg: "var(--tf-success-soft)", icon: <CheckCircle size={16} />, label: tk("safety.riskSafe") };
      case "low": return { color: "var(--tf-warning)", bg: "var(--tf-warning-soft)", icon: <AlertTriangle size={16} />, label: tk("safety.riskLow") };
      case "medium": return { color: "var(--tf-warning)", bg: "var(--tf-warning-soft)", icon: <AlertTriangle size={16} />, label: tk("safety.riskMedium") };
      case "high": return { color: "var(--tf-danger)", bg: "var(--tf-danger-soft)", icon: <Shield size={16} />, label: tk("safety.riskHigh") };
    }
  })();

  return (
    <div className="tf-overlay" onClick={onClose}>
      <div className="tf-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="tf-modal-header">
          <h2 className="tf-modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {riskInfo.icon}
            <span>{tk("safety.receipt")}</span>
          </h2>
          <button onClick={onClose} className="tf-btn-ghost tf-btn-sm">{tk("actions.close")}</button>
        </div>

        {/* Risk level */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 14px", borderRadius: "20px",
          background: riskInfo.bg, color: riskInfo.color,
          fontSize: "0.8rem", fontWeight: 700, marginBottom: 16,
        }}>
          {riskInfo.icon}
          {riskInfo.label}
        </div>

        {/* Findings summary (no raw secrets!) */}
        <div className="tf-card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 8 }}>
            {tk("safety.scanResult")}: {result.findings.length} {tk("safety.findings")}
          </div>
          {result.findings.length === 0 ? (
            <div style={{ fontSize: "0.75rem", color: "var(--tf-success)" }}>
              <CheckCircle size={12} style={{ display: "inline", marginRight: 4 }} />
              {tk("safety.noFindings")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {result.findings.map((f, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 0", borderBottom: "1px solid var(--tf-border-light)",
                  fontSize: "0.72rem",
                }}>
                  <span style={{ color: "var(--tf-text)", fontWeight: 500 }}>{f.label}</span>
                  <span style={{ color: "var(--tf-primary)", fontFamily: "var(--tf-font-mono)", fontSize: "0.68rem" }}>
                    {f.redacted}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Safe outgoing content preview */}
        <div className="tf-card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--tf-success)", marginBottom: 6 }}>
            <CheckCircle size={12} style={{ display: "inline", marginRight: 4 }} />
            {tk("safety.safeContent")}
          </div>
          <div style={{
            background: "var(--tf-success-soft)",
            borderRadius: "6px", padding: "10px",
            fontSize: "0.68rem", fontFamily: "var(--tf-font-mono)",
            wordBreak: "break-word", maxHeight: 80, overflowY: "auto",
            color: "var(--tf-success-text)",
          }}>
            {result.redacted}
          </div>
        </div>

        {/* Destination */}
        <div className="tf-card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: "0.7rem", color: "var(--tf-text-muted)", marginBottom: 4 }}>
            {tk("safety.sentTo")}
          </div>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--tf-text)" }}>
            {provider} / {model}
          </div>
        </div>

        {/* Timestamp */}
        <div style={{ fontSize: "0.65rem", color: "var(--tf-text-muted)", textAlign: "right" }}>
          {tk("safety.timestamp")}: {new Date(result.timestamp).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
