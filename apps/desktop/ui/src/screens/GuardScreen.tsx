export function GuardScreen() {
  return (
    <div>
      <h1 className="page-title">Prompt Guard</h1>
      <p className="page-subtitle">Scan, redact, and route prompts safely</p>
      <div className="card">
        <div className="card-header">
          <div><div className="card-title">Guard Status</div><div className="card-subtitle">Real-time prompt safety scanning</div></div>
          <span className="badge badge-green">Active</span>
        </div>
        <div className="section-list">
          <div className="section-item"><div className="section-item-title">Redaction Engine</div><div className="section-item-desc">Detects and masks PII, secrets, and sensitive data before any API call</div></div>
          <div className="section-item"><div className="section-item-title">Policy Engine</div><div className="section-item-desc">Enforces configurable guard policies per provider and task type</div></div>
          <div className="section-item"><div className="section-item-title">Risk Assessment</div><div className="section-item-desc">Scores prompts by risk level (Safe / Low / Medium / High / Critical)</div></div>
          <div className="section-item"><div className="section-item-title">Safe Routing</div><div className="section-item-desc">Routes to local models for sensitive content; cloud models for general tasks</div></div>
        </div>
      </div>
    </div>
  );
}
