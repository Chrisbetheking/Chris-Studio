import { useState, useEffect } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";

export function StorageScreen() {
  const [, forceRender] = useState(0);
  useEffect(() => { return onLangChange(() => forceRender((n) => n + 1)); }, []);


  return (
    <div>
      <h1 className="page-title">{tk("storage.title")}</h1>
      <p className="page-subtitle">{tk("storage.subtitle")}</p>
      <div className="card">
        <div className="card-header"><div><div className="card-title">{tk("storage.localStorage")}</div><div className="card-subtitle">{tk("storage.localDesc")}</div></div><span className="badge badge-green">Local</span></div>
        <div className="section-list">
          <div className="section-item"><div className="section-item-title">{tk("storage.dataDirectory")}</div><div className="section-item-desc"><code className="code-block">.tokenfence/</code></div></div>
          <div className="section-item"><div className="section-item-title">{tk("storage.providerConfig")}</div><div className="section-item-desc"><code className="code-block">.tokenfence/providers.json</code></div></div>
          <div className="section-item"><div className="section-item-title">{tk("storage.archive")}</div><div className="section-item-desc"><code className="code-block">.tokenfence/archive.jsonl</code></div></div>
          <div className="section-item"><div className="section-item-title">{tk("storage.redactionVault")}</div><div className="section-item-desc"><code className="code-block">.tokenfence/redactions.json</code></div></div>
        </div>
      </div>
    </div>
  );
}
