export function OutputScreen() {
  return (
    <div>
      <h1 className="page-title">Output Generation</h1>
      <p className="page-subtitle">Export agent output to various formats (MVP)</p>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Formats</div><div className="stat-value">5</div></div>
        <div className="stat-card"><div className="stat-label">Exports</div><div className="stat-value">0</div></div>
      </div>
      <div className="card">
        <div className="card-header"><div><div className="card-title">Supported Formats</div><div className="card-subtitle">Markdown, HTML, JSON, PDF, DOCX</div></div><span className="badge badge-amber">MVP</span></div>
        <div className="section-list">
          <div className="section-item"><div className="section-item-title">Markdown</div><div className="section-item-desc">Clean Markdown output with frontmatter</div></div>
          <div className="section-item"><div className="section-item-title">HTML</div><div className="section-item-desc">Styled HTML with responsive layout</div></div>
          <div className="section-item"><div className="section-item-title">JSON</div><div className="section-item-desc">Structured JSON for programmatic use</div></div>
          <div className="section-item"><div className="section-item-title">PDF / DOCX</div><div className="section-item-desc">Stub generators (requires local runtime for full conversion)</div></div>
        </div>
      </div>
    </div>
  );
}
