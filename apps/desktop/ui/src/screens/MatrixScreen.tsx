export function MatrixScreen() {
  return (
    <div>
      <h1 className="page-title">Model Matrix</h1>
      <p className="page-subtitle">Compare provider performance and safety across models</p>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Providers</div><div className="stat-value">0</div></div>
        <div className="stat-card"><div className="stat-label">Comparisons</div><div className="stat-value">0</div></div>
      </div>
      <div className="card">
        <div className="card-header"><div><div className="card-title">Comparison Matrix</div><div className="card-subtitle">Side-by-side provider evaluation</div></div></div>
        <div className="empty-state"><div className="empty-state-title">No providers configured</div><p>Add providers in Settings to begin comparing</p></div>
      </div>
    </div>
  );
}
