export function MindMapScreen() {
  return (
    <div>
      <h1 className="page-title">Mind Map Generator</h1>
      <p className="page-subtitle">Generate mind maps from agent output (Mermaid + Markdown)</p>
      <div className="card">
        <div className="card-header"><div><div className="card-title">Mind Map Output</div><div className="card-subtitle">Uses Mermaid syntax; falls back to Markdown lists</div></div><span className="badge badge-blue">Mermaid</span></div>
        <div className="empty-state"><div className="empty-state-title">No mind maps generated</div><p>Use the Output page to generate mind maps from agent text</p></div>
      </div>
    </div>
  );
}
