import { useState, useEffect } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";

export function GuardScreen() {
  const [, forceRender] = useState(0);
  useEffect(() => { return onLangChange(() => forceRender((n) => n + 1)); }, []);


  return (
    <div>
      <h1 className="page-title">{tk("guardPage.title")}</h1>
      <p className="page-subtitle">{tk("guardPage.subtitle")}</p>
      <div className="card">
        <div className="card-header">
          <div><div className="card-title">{tk("guardPage.status")}</div><div className="card-subtitle">{tk("guardPage.statusDesc")}</div></div>
          <span className="badge badge-green">{tk("guardPage.active")}</span>
        </div>
        <div className="section-list">
          <div className="section-item"><div className="section-item-title">{tk("guardPage.redactionEngine")}</div><div className="section-item-desc">{tk("guardPage.redactionDesc")}</div></div>
          <div className="section-item"><div className="section-item-title">{tk("guardPage.policyEngine")}</div><div className="section-item-desc">{tk("guardPage.policyDesc")}</div></div>
          <div className="section-item"><div className="section-item-title">{tk("guardPage.riskAssessment")}</div><div className="section-item-desc">{tk("guardPage.riskDesc")}</div></div>
          <div className="section-item"><div className="section-item-title">{tk("guardPage.safeRouting")}</div><div className="section-item-desc">{tk("guardPage.safeRoutingDesc")}</div></div>
        </div>
      </div>
    </div>
  );
}
