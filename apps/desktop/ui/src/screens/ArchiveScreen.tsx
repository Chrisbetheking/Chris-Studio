export function ArchiveScreen() {
  return (
    <div>
      <h1 className="page-title">Local Archive</h1>
      <p className="page-subtitle">Browse saved prompts, detections, and context packs</p>
      <div className="card">
        <div className="card-header"><div><div className="card-title">Archive</div><div className="card-subtitle">All data stored locally in .tokenfence/</div></div></div>
        <div className="empty-state"><div className="empty-state-title">Archive is empty</div><p>Scan a prompt via Prompt Guard to create your first archive entry</p></div>
      </div>
    </div>
  );
}
