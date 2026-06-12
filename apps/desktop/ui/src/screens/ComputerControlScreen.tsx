export function ComputerControlScreen() {
  return (
    <div>
      <h1 className="page-title">Computer Use Control</h1>
      <p className="page-subtitle">Permission-gated computer actions (experimental)</p>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Pending</div><div className="stat-value">0</div></div>
        <div className="stat-card"><div className="stat-label">Approved</div><div className="stat-value">0</div></div>
        <div className="stat-card"><div className="stat-label">Executed</div><div className="stat-value">0</div></div>
      </div>
      <div className="card">
        <div className="card-header"><div><div className="card-title">Available Actions</div><div className="card-subtitle">All actions require explicit user approval</div></div><span className="badge badge-amber">Experimental</span></div>
        <div className="section-list">
          <div className="section-item"><div className="section-item-title">Screenshot</div><div className="section-item-desc">Capture screen for visual context</div></div>
          <div className="section-item"><div className="section-item-title">Click / Type / Scroll</div><div className="section-item-desc">UI automation actions</div></div>
          <div className="section-item"><div className="section-item-title">Shell Execute</div><div className="section-item-desc">Run approved local commands (high risk, always requires approval)</div></div>
        </div>
      </div>
    </div>
  );
}
