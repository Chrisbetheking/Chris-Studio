export function DocumentsScreen() {
  return (
    <div>
      <h1 className="page-title">Document Pipeline</h1>
      <p className="page-subtitle">Chunk, clean, and prepare documents for AI consumption</p>
      <div className="card">
        <div className="card-header"><div><div className="card-title">Pipeline Status</div><div className="card-subtitle">Ready to process documents</div></div><span className="badge badge-slate">Ready</span></div>
        <div className="section-list">
          <div className="section-item"><div className="section-item-title">Upload & Parse</div><div className="section-item-desc">Supports TXT, MD, PDF, DOCX, HTML, CSV, JSON, XML</div></div>
          <div className="section-item"><div className="section-item-title">Cleaning</div><div className="section-item-desc">Strips noise, normalizes whitespace, removes boilerplate</div></div>
          <div className="section-item"><div className="section-item-title">Chunking</div><div className="section-item-desc">Splits into optimal chunks with configurable overlap</div></div>
        </div>
      </div>
      <div className="empty-state"><div className="empty-state-title">No documents uploaded</div><p>Drag and drop files to begin processing</p></div>
    </div>
  );
}
