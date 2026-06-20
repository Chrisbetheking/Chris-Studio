import { VERSION } from "../App";
import { tk } from "@tokenfence/shared/src/i18n";

export function AboutScreen() {
  return (
    <div>
      <h1 className="page-title">{tk("about.title")}</h1>
      <p className="page-subtitle">{tk("about.subtitle")}</p>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">{tk("app.version")}</div><div className="stat-value" style={{fontSize:20}}>{VERSION}</div></div>
        <div className="stat-card"><div className="stat-label">{tk("about.repository")}</div><div className="stat-value" style={{fontSize:18,color:"var(--green)"}}>GitHub</div></div>
        <div className="stat-card"><div className="stat-label">{tk("about.license")}</div><div className="stat-value" style={{fontSize:18,color:"var(--amber)"}}>ChrisWang Lab</div></div>
        <div className="stat-card"><div className="stat-label">{tk("about.privacyLabel")}</div><div className="stat-value" style={{fontSize:16}}>{tk("status.localFirst")}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{marginBottom:12}}>{tk("about.releaseInfo")}</div>
        <div className="section-list">
          <div className="section-item"><div className="section-item-title">{tk("about.repository")}</div><div className="section-item-desc">github.com/Chrisbetheking/tokenfence-studio</div></div>
          <div className="section-item"><div className="section-item-title">{tk("about.license")}</div><div className="section-item-desc">ChrisWang Lab</div></div>
          <div className="section-item"><div className="section-item-title">{tk("about.privacyLabel")}</div><div className="section-item-desc">{tk("about.privacyText")}</div></div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{marginBottom:12}}>{tk("about.developer")}</div>
        <div className="section-list">
          <div className="section-item">
            <div className="section-item-title">{tk("about.devName")}</div>
            <div className="section-item-desc">Chris</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{marginBottom:12}}>{tk("about.contact")}</div>
        <div className="section-list">
          <div className="section-item">
            <div className="section-item-title">{tk("about.emailLabel")}</div>
            <div className="section-item-desc">chrisjob@163.com</div>
          </div>
          <div className="section-item">
            <div className="section-item-title">{tk("about.wechatLabel")}</div>
            <div className="section-item-desc">easymoneysniperchris</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{marginBottom:12}}>{tk("about.support")}</div>
        <p style={{fontSize:"0.9rem",color:"var(--text-secondary)",lineHeight:1.6}}>{tk("about.supportText")}</p>
      </div>
    </div>
  );
}