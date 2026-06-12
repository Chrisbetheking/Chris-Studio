export function PluginStoreScreen() {
  return (
    <div>
      <h1 className="page-title">Plugin Store</h1>
      <p className="page-subtitle">Browse and install local plugins (experimental MVP)</p>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Available</div><div className="stat-value">10</div></div>
        <div className="stat-card"><div className="stat-label">Installed</div><div className="stat-value">4</div></div>
        <div className="stat-card"><div className="stat-label">Built-in</div><div className="stat-value">10</div></div>
      </div>
      <div className="card">
        <div className="card-header"><div><div className="card-title">Plugin Categories</div><div className="card-subtitle">Output, Knowledge, Media, API, Computer Use</div></div><span className="badge badge-amber">MVP</span></div>
        <div className="section-list">
          <div className="section-item"><div className="section-item-title">Obsidian Vault Writer</div><div className="section-item-desc">Read/write notes to local Obsidian vault (node runtime, approval required)</div></div>
          <div className="section-item"><div className="section-item-title">Markdown to PDF</div><div className="section-item-desc">Convert agent output to PDF (node runtime, stub)</div></div>
          <div className="section-item"><div className="section-item-title">Mind Map Generator</div><div className="section-item-desc">Generate Mermaid mind maps from agent output</div></div>
          <div className="section-item"><div className="section-item-title">API Request Builder</div><div className="section-item-desc">Build and execute API calls to third-party services</div></div>
          <div className="section-item"><div className="section-item-title">MP4 Import</div><div className="section-item-desc">Import MP4 files for analysis (requires approval)</div></div>
        </div>
      </div>
    </div>
  );
}
