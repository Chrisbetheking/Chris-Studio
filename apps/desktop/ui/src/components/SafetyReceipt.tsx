import { tk } from "@tokenfence/shared/src/i18n";
import type { GuardResult } from "@tokenfence/shared/src/types";

interface SafetyReceiptProps {
  result: GuardResult;
  provider: string;
  model: string;
  onClose: () => void;
}

export function SafetyReceipt({ result, provider, model, onClose }: SafetyReceiptProps) {
  const riskColors: Record<string, string> = {
    safe: "var(--tf-success)",
    low: "var(--tf-warning)",
    medium: "var(--tf-warning)",
    high: "var(--tf-danger)",
  };

  return (
    <div className="tf-overlay" onClick={onClose}>
      <div className="tf-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="tf-modal-header">
          <h2 className="tf-modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>{tk("safety.receipt")}</span>
          </h2>
          <button onClick={onClose} className="tf-btn-ghost tf-btn-sm">{tk("actions.close")}</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{
            display: "inline-block",
            background: riskColors[result.riskLevel] || "var(--tf-surface-alt)",
            color: "white",
            padding: "4px 12px",
            borderRadius: "12px",
            fontSize: "0.75rem",
            fontWeight: 700,
            marginBottom: 8,
          }}>
            {tk("safety.risk" + result.riskLevel.charAt(0).toUpperCase() + result.riskLevel.slice(1))}
          </div>
        </div>

        {/* Findings summary */}
        <div className="tf-card" style={{ padding: 14, marginBottom: 12 }}>
          <div className="tf-card-title" style={{ fontSize: "0.8rem", marginBottom: 8 }}>
            {tk("safety.findings")}: {result.findings.length}
          </div>
          {result.findings.length > 0 ? (
            result.findings.map((f, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "4px 0", borderBottom: "1px solid var(--tf-border-light)",
                fontSize: "0.72rem",
              }}>
                <span style={{ color: "var(--tf-text)" }}>{f.label}</span>
                <span style={{ color: "var(--tf-primary)", fontFamily: "var(--tf-font-mono)", fontSize: "0.65rem" }}>
                  {f.redacted}
                </span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: "0.75rem", color: "var(--tf-success)" }}>{tk("safety.noFindings")}</div>
          )}
        </div>

        {/* Redacted vs original */}
        {result.redacted !== result.original && (
          <div className="tf-card" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--tf-danger)", marginBottom: 4 }}>
                  {tk("safety.originalContent")}
                </div>
                <div style={{
                  background: "var(--tf-danger-soft)",
                  borderRadius: "6px", padding: "8px",
                  fontSize: "0.65rem", fontFamily: "var(--tf-font-mono)",
                  wordBreak: "break-word", maxHeight: 100, overflowY: "auto",
                }}>
                  {result.original}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--tf-success)", marginBottom: 4 }}>
                  {tk("safety.safeContent")}
                </div>
                <div style={{
                  background: "var(--tf-success-soft)",
                  borderRadius: "6px", padding: "8px",
                  fontSize: "0.65rem", fontFamily: "var(--tf-font-mono)",
                  wordBreak: "break-word", maxHeight: 100, overflowY: "auto",
                }}>
                  {result.redacted}
                </div>
              </div>
            </div>
          </div>
        )}

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
