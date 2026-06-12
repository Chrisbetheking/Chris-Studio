export function Dashboard() {
  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">TokenFence Studio local AI workstation overview</p>
      <div className="status-row">
        <div className="status-item"><span className="status-dot green"></span> Prompt Guard: Active</div>
        <div className="status-item"><span className="status-dot green"></span> Local-first mode</div>
        <span className="badge badge-blue">v0.4.0-dev</span>
      </div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Safety Status</div><div className="stat-value" style={{color:'var(--green)'}}>Active</div></div>
        <div className="stat-card"><div className="stat-label">Providers Ready</div><div className="stat-value">-</div></div>
        <div className="stat-card"><div className="stat-label">Archived Entries</div><div className="stat-value">-</div></div>
        <div className="stat-card"><div className="stat-label">Storage Used</div><div className="stat-value">-</div></div>
      </div>
      <div className="card"><div className="card-header"><div><div className="card-title">Prompt Guard</div><div className="card-subtitle">Scan, redact, and route prompts safely</div></div><span className="badge badge-green">Active</span></div><p style={{fontSize:13,color:'var(--text-secondary)'}}>All prompts are scanned for sensitive data, redacted, and routed through verified providers. Detections logged to local archive.</p></div>
      <div className="card"><div className="card-header"><div><div className="card-title">Document Pipeline</div><div className="card-subtitle">Chunk, clean, and prepare documents for AI consumption</div></div><span className="badge badge-slate">Ready</span></div></div>
      <div className="card"><div className="card-header"><div><div className="card-title">Model Matrix</div><div className="card-subtitle">Compare provider performance and safety</div></div><span className="badge badge-slate">Ready</span></div></div>
      <div className="card"><div className="card-header"><div><div className="card-title">Local Archive</div><div className="card-subtitle">Browse saved prompts, detections, and context packs</div></div><span className="badge badge-slate">Ready</span></div></div>
    </div>
  );
}
