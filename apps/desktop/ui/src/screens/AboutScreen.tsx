export function AboutScreen() {
  return (
    <div>
      <h1 className="page-title">About TokenFence Studio</h1>
      <p className="page-subtitle">Local-first AI safety workstation</p>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Version</div><div className="stat-value" style={{fontSize:20}}>v0.5.0-dev</div></div>
        <div className="stat-card"><div className="stat-label">Android APK</div><div className="stat-value" style={{fontSize:18,color:'var(--green)'}}>Available</div></div>
        <div className="stat-card"><div className="stat-label">Windows/macOS</div><div className="stat-value" style={{fontSize:18,color:'var(--amber)'}}>Experimental</div></div>
        <div className="stat-card"><div className="stat-label">iOS</div><div className="stat-value" style={{fontSize:16}}>Self-build</div></div>
      </div>
      <div className="card">
        <div className="card-title" style={{marginBottom:12}}>Release Info</div>
        <div className="section-list">
          <div className="section-item"><div className="section-item-title">Repository</div><div className="section-item-desc">github.com/Chrisbetheking/tokenfence-studio</div></div>
          <div className="section-item"><div className="section-item-title">License</div><div className="section-item-desc">ChrisWang Lab</div></div>
          <div className="section-item"><div className="section-item-title">Privacy</div><div className="section-item-desc">All keys and archives stay on your machine. Nothing sent to external servers without explicit configuration.</div></div>
        </div>
      </div>
    </div>
  );
}
