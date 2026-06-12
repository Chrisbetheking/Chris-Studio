export function AgentLabScreen() {
  return (
    <div>
      <h1 className="page-title">Agent Lab</h1>
      <p className="page-subtitle">Lightweight local agent task workspace (experimental)</p>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Tasks</div><div className="stat-value">0</div></div>
        <div className="stat-card"><div className="stat-label">Active</div><div className="stat-value">0</div></div>
        <div className="stat-card"><div className="stat-label">Completed</div><div className="stat-value">0</div></div>
      </div>
      <div className="card">
        <div className="card-header"><div><div className="card-title">Agent Tasks</div><div className="card-subtitle">Define and run agent workflows with plugin steps</div></div><span className="badge badge-amber">Experimental</span></div>
        <div className="empty-state"><div className="empty-state-title">No tasks defined</div><p>Create your first agent task to begin</p></div>
      </div>
    </div>
  );
}
