import { tk } from "@tokenfence/shared/src/i18n";
import type { GuardResult } from "@tokenfence/shared/src/types";

interface SafetyInspectorProps {
  result: GuardResult | null;
  onClose?: () => void;
}

export function SafetyInspector({ result, onClose }: SafetyInspectorProps) {
  if (!result) {
    return (
      <div className="safety-panel">
        <div className="safety-panel-header">
          <h3>{tk("safety.inspector")}</h3>
        </div>
        <div className="tf-empty" style={{ padding: "24px 16px" }}>
          <div className="tf-empty-desc">{tk("safety.inspectorDesc")}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--tf-text-muted)", marginTop: 8 }}>
            {tk("safety.noFindings")}
          </div>
        </div>
      </div>
    );
  }

  const riskColors: Record<string, string> = {
    safe: "var(--tf-success)",
    low: "var(--tf-warning)",
    medium: "var(--tf-warning)",
    high: "var(--tf-danger)",
  };

  const riskLabels: Record<string, string> = {
    safe: tk("safety.riskSafe"),
    low: tk("safety.riskLow"),
    medium: tk("safety.riskMedium"),
    high: tk("safety.riskHigh"),
  };

  return (
    <div className="safety-panel">
      <div className="safety-panel-header">
        <h3>{tk("safety.inspector")}</h3>
        {onClose && (
          <button onClick={onClose} className="tf-btn-ghost tf-btn-sm" style={{ padding: "2px 6px" }}>
            x
          </button>
        )}
      </div>

      {/* Risk level */}
      <div className="safety-risk-badge" style={{
        background: riskColors[result.riskLevel] || "var(--tf-surface-alt)",
        color: "white",
        padding: "6px 14px",
        borderRadius: "20px",
        fontSize: "0.75rem",
        fontWeight: 700,
        display: "inline-block",
        marginBottom: 12,
      }}>
        {riskLabels[result.riskLevel] || result.riskLevel}
      </div>

      {/* Findings count */}
      <div style={{ fontSize: "0.75rem", color: "var(--tf-text-muted)", marginBottom: 12 }}>
        {result.findings.length === 0
          ? tk("safety.noFindings")
          : tk("safety.findingsFound").replace("{count}", String(result.findings.length))}
      </div>

      {/* Finding details */}
      {result.findings.length > 0 && (
        <div className="safety-findings-list">
          {result.findings.map((f, i) => (
            <div key={i} className="safety-finding-item" style={{
              background: "var(--tf-surface-alt)",
              borderRadius: "8px",
              padding: "8px 12px",
              marginBottom: 6,
              fontSize: "0.72rem",
            }}>
              <div style={{ fontWeight: 600, color: "var(--tf-text)", marginBottom: 2 }}>{f.label}</div>
              <div style={{ color: "var(--tf-text-muted)", fontSize: "0.65rem" }}>
                {f.type} ? {f.label}
              </div>
              <div style={{ color: "var(--tf-primary)", fontSize: "0.65rem", marginTop: 2 }}>
                &rarr; {f.redacted}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Redacted preview */}
      {result.redacted !== result.original && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--tf-text-secondary)", marginBottom: 4 }}>
            {tk("safety.redactedPreview")}
          </div>
          <div style={{
            background: "var(--tf-surface-alt)",
            borderRadius: "8px",
            padding: "10px",
            fontSize: "0.7rem",
            color: "var(--tf-text-secondary)",
            wordBreak: "break-word",
            maxHeight: 120,
            overflowY: "auto",
            fontFamily: "var(--tf-font-mono)",
          }}>
            {result.redacted}
          </div>
        </div>
      )}
    </div>
  );
}
