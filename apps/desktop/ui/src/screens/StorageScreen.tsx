export function StorageScreen() {
  return (
    <div>
      <h1 className="page-title">Storage Settings</h1>
      <p className="page-subtitle">Configure local storage paths and options</p>
      <div className="card">
        <div className="card-header"><div><div className="card-title">Local Storage</div><div className="card-subtitle">All keys, archives, and configs stay on your machine</div></div><span className="badge badge-green">Local</span></div>
        <div className="section-list">
          <div className="section-item"><div className="section-item-title">Data Directory</div><div className="section-item-desc"><code className="code-block">.tokenfence/</code></div></div>
          <div className="section-item"><div className="section-item-title">Provider Config</div><div className="section-item-desc"><code className="code-block">.tokenfence/providers.json</code></div></div>
          <div className="section-item"><div className="section-item-title">Archive</div><div className="section-item-desc"><code className="code-block">.tokenfence/archive.jsonl</code></div></div>
          <div className="section-item"><div className="section-item-title">Redaction Vault</div><div className="section-item-desc"><code className="code-block">.tokenfence/redactions.json</code></div></div>
        </div>
      </div>
    </div>
  );
}
