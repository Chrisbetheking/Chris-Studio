import { useState, useEffect } from "react";
import { tk } from "@tokenfence/shared/src/i18n";
import { loadProviderConfigs, saveProviderConfigs, PROVIDER_ENDPOINTS, type ProviderConfig } from "@tokenfence/shared/src/providers";
import { MODEL_REGISTRY, getModelsForProvider, getDefaultModelForProvider, type ModelRegistryItem } from "@tokenfence/shared/src/model-registry";
import { resolveActiveModel, setActiveModel, runProviderHealthCheck, saveHealthResult, type HealthResult } from "../data/active-model";

/* ============================================================
   ProviderSetupWizard v1.3.0
   4-step onboarding: Choose Provider -> Configure -> Test -> Select Model
   ============================================================ */

const PROVIDER_LIST = [
  { id: "OpenAI", name: "OpenAI", desc: "GPT-5.5, GPT-4o, o4-mini..." },
  { id: "Claude", name: "Anthropic Claude", desc: "Claude Opus 4.5, Sonnet 4.5, Haiku 4.5" },
  { id: "Gemini", name: "Google Gemini", desc: "Gemini 3.0 Pro, Flash, Ultra" },
  { id: "DeepSeek", name: "DeepSeek", desc: "DeepSeek-V3, R1 (reasoning)" },
  { id: "OpenRouter", name: "OpenRouter", desc: "Multi-provider gateway" },
  { id: "Qwen", name: "Qwen (Tongyi)", desc: "Qwen3, Qwen-Max, Qwen-Coder" },
  { id: "Kimi", name: "Kimi (Moonshot)", desc: "Kimi thinking model" },
  { id: "Doubao", name: "Doubao (ByteDance)", desc: "Doubao-pro, Doubao-lite" },
  { id: "Zhipu", name: "Zhipu (GLM)", desc: "GLM-4, GLM-4V (vision)" },
  { id: "xAI", name: "xAI (Grok)", desc: "Grok-beta" },
  { id: "Mistral", name: "Mistral AI", desc: "Mistral Large, Small, Codestral" },
  { id: "Cohere", name: "Cohere", desc: "Command R+, Command R" },
  { id: "Perplexity", name: "Perplexity", desc: "Sonar, Sonar Pro (search)" },
  { id: "Ollama", name: "Ollama (Local)", desc: "Run models locally" },
  { id: "LM Studio", name: "LM Studio (Local)", desc: "Local inference server" },
  { id: "custom", name: "Custom Provider", desc: "Any OpenAI-compatible endpoint" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function ProviderSetupWizard({ open, onClose, onComplete }: Props) {
  const isZh = tk("common.yes") !== "Yes";

  const [step, setStep] = useState(1);
  const [providerId, setProviderId] = useState("");
  const [customName, setCustomName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [testing, setTesting] = useState(false);
  const [healthResult, setHealthResult] = useState<HealthResult | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelRegistryItem[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const selectedProv = PROVIDER_LIST.find((p) => p.id === providerId);
  const isCustom = providerId === "custom";
  const effectiveProviderId = isCustom ? customName.toLowerCase().replace(/\s+/g, "-") : providerId;

  // Load existing config when provider changes
  useEffect(() => {
    if (!providerId || step < 2) return;
    const configs = loadProviderConfigs();
    const existing = configs.find((c) => c.provider === (isCustom ? effectiveProviderId : providerId));
    if (existing) {
      setApiKey(existing.apiKey || "");
      setBaseUrl(existing.baseUrl || PROVIDER_ENDPOINTS[providerId]?.baseUrl || "");
      setDefaultModel(existing.defaultModel || existing.model || "");
      setEnabled(existing.enabled !== false);
    } else {
      setApiKey("");
      setBaseUrl(PROVIDER_ENDPOINTS[providerId]?.baseUrl || "");
      const defModel = getDefaultModelForProvider(providerId);
      setDefaultModel(defModel?.modelId || "");
      setEnabled(true);
    }
  }, [providerId, step]);

  // Load available models for step 4
  useEffect(() => {
    if (step === 4 && providerId) {
      const models = providerId === "custom"
        ? [{ providerId: effectiveProviderId, providerName: customName, modelId: defaultModel, displayName: defaultModel, capabilities: ["chat"] as any[], status: "configured" as const }]
        : getModelsForProvider(providerId);
      setAvailableModels(models as any[]);
      setSelectedModel(defaultModel || models[0]?.modelId || "");
    }
  }, [step, providerId, defaultModel]);

  const handleChooseProvider = (pid: string) => {
    setProviderId(pid);
    setError("");
    setStep(2);
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) { setError(isZh ? "\u8BF7\u8F93\u5165 API Key" : "Please enter API Key"); return; }
    setError("");
    setTesting(true);
    setHealthResult(null);

    const config: ProviderConfig = {
      provider: effectiveProviderId,
      displayName: selectedProv?.name || customName,
      deployment: providerId === "Ollama" || providerId === "LM Studio" ? "local" as const : "cloud" as const,
      enabled: true,
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim() || undefined,
      defaultModel: defaultModel.trim() || undefined,
      model: defaultModel.trim() || undefined,
      lastHealthStatus: "unknown" as const,
    };

    const result = await runProviderHealthCheck(config);
    setHealthResult(result);
    saveHealthResult(effectiveProviderId, result);

    if (result.status === "ok") {
      setStep(4);
    }
    setTesting(false);
  };

  const handleFinish = () => {
    setSaving(true);
    setError("");
    try {
      const configs = loadProviderConfigs();
      const finalId = effectiveProviderId;
      const idx = configs.findIndex((c) => c.provider === finalId);
      const newConfig: ProviderConfig = {
        provider: finalId,
        displayName: selectedProv?.name || customName,
        deployment: providerId === "Ollama" || providerId === "LM Studio" ? "local" as const : "cloud" as const,
        enabled,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        defaultModel: selectedModel || defaultModel,
        model: selectedModel || defaultModel,
        lastHealthStatus: healthResult?.status === "ok" ? "ok" as const : "unknown" as const,
        lastHealthCheck: healthResult?.testedAt,
      };

      if (idx >= 0) configs[idx] = { ...configs[idx], ...newConfig };
      else configs.push(newConfig);
      saveProviderConfigs(configs);

      // Set active model
      const modelToSet = selectedModel || defaultModel;
      if (modelToSet) {
        setActiveModel(finalId, modelToSet,
          availableModels.find((m) => m.modelId === modelToSet)?.displayName || modelToSet,
          "installed");
      }

      onComplete();
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const stepLabels = [
    isZh ? "\u9009\u62E9\u63D0\u4F9B\u5546" : "Choose Provider",
    isZh ? "\u914D\u7F6E" : "Configure",
    isZh ? "\u6D4B\u8BD5\u8FDE\u63A5" : "Test Connection",
    isZh ? "\u9009\u62E9\u6A21\u578B" : "Select Model",
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10001,
      background: "rgba(0,0,0,0.6)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--tf-surface, #1e1e2e)", borderRadius: 12,
        padding: "28px 32px", minWidth: 520, maxWidth: 620,
        boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        border: "1px solid var(--tf-border, #333)",
        maxHeight: "85vh", overflowY: "auto",
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text)" }}>
            {isZh ? "\u914D\u7F6E\u6A21\u578B\u63D0\u4F9B\u5546" : "Set Up Model Provider"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.2rem", padding: "4px 8px" }}>{"\u2715"}</button>
        </div>

        {/* Step indicators */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {stepLabels.map((label, idx) => (
            <div key={idx} style={{
              flex: 1, textAlign: "center", padding: "6px 0",
              fontSize: "0.7rem", fontWeight: idx + 1 === step ? 700 : 400,
              color: idx + 1 === step ? "var(--primary)" : idx + 1 < step ? "var(--green)" : "var(--text-muted)",
              borderBottom: idx + 1 === step ? "2px solid var(--primary)" : idx + 1 < step ? "2px solid var(--green)" : "2px solid var(--border)",
            }}>
              {idx + 1 < step ? "\u2713 " : ""}{label}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: "8px 12px", marginBottom: 14, background: "rgba(255,80,80,0.12)", borderRadius: 6, color: "var(--red)", fontSize: "0.78rem" }}>{error}</div>
        )}

        {/* Step 1: Choose Provider */}
        {step === 1 && (
          <div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 16 }}>
              {isZh ? "\u9009\u62E9\u4F60\u8981\u914D\u7F6E\u7684\u6A21\u578B\u63D0\u4F9B\u5546\uFF1A" : "Choose the model provider you want to configure:"}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, maxHeight: 400, overflowY: "auto" }}>
              {PROVIDER_LIST.map((prov) => (
                <div
                  key={prov.id}
                  onClick={() => handleChooseProvider(prov.id)}
                  style={{
                    padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                    border: "1px solid var(--border)", background: "var(--tf-bg, #111)",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.background = "var(--surface-alt)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--tf-bg, #111)"; }}
                >
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)", marginBottom: 2 }}>{prov.name}</div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{prov.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Configure */}
        {step === 2 && (
          <div>
            <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 6, background: "var(--surface-alt)", fontSize: "0.85rem", color: "var(--text)" }}>
              {isZh ? "\u6B63\u5728\u914D\u7F6E\uFF1A" : "Configuring: "}<strong>{selectedProv?.name || customName}</strong>
            </div>

            {isCustom && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>
                  {isZh ? "\u63D0\u4F9B\u5546\u540D\u79F0" : "Provider Name"}
                </label>
                <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. MyProvider" style={{ width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)", boxSizing: "border-box" }} />
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>API Key</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..." style={{ flex: 1, padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)" }} />
                <button className="btn btn-ghost" onClick={() => setShowKey(!showKey)}
                  style={{ padding: "6px 12px", fontSize: "0.72rem" }}>
                  {showKey ? (isZh ? "\u9690\u85CF" : "Hide") : (isZh ? "\u663E\u793A" : "Show")}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>Base URL</label>
              <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={PROVIDER_ENDPOINTS[providerId]?.baseUrl || "https://api.example.com/v1"}
                style={{ width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>
                {isZh ? "\u9ED8\u8BA4\u6A21\u578B" : "Default Model"}
              </label>
              <input type="text" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)}
                placeholder="e.g. gpt-4o" style={{ width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: "0.78rem", color: "var(--text)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ accentColor: "var(--primary)" }} />
                {isZh ? "\u542F\u7528" : "Enabled"}
              </label>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setStep(1)} style={{ padding: "8px 18px", fontSize: "0.82rem" }}>
                {isZh ? "\u4E0A\u4E00\u6B65" : "Back"}
              </button>
              <button className="btn btn-primary" onClick={handleTestConnection} disabled={testing || !apiKey.trim()}
                style={{ padding: "8px 18px", fontSize: "0.82rem" }}>
                {testing ? (isZh ? "\u6D4B\u8BD5\u4E2D..." : "Testing...") : (isZh ? "\u6D4B\u8BD5\u8FDE\u63A5" : "Test Connection")}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Test Connection */}
        {step === 3 && (
          <div>
            <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 6, background: "var(--surface-alt)", fontSize: "0.85rem", color: "var(--text)" }}>
              {isZh ? "\u6B63\u5728\u6D4B\u8BD5\uFF1A" : "Testing: "}<strong>{selectedProv?.name || customName}</strong>
            </div>

            {healthResult && (
              <div style={{
                padding: "14px 16px", marginBottom: 14, borderRadius: 8, fontSize: "0.82rem",
                background: healthResult.status === "ok" ? "rgba(0,200,100,0.1)" :
                  healthResult.status === "degraded" ? "rgba(255,180,0,0.1)" :
                  healthResult.status === "failed" ? "rgba(255,80,80,0.1)" :
                  "rgba(128,128,128,0.1)",
                border: "1px solid " + (healthResult.status === "ok" ? "var(--green)" :
                  healthResult.status === "degraded" ? "var(--amber)" :
                  healthResult.status === "failed" ? "var(--red)" : "var(--border)"),
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: healthResult.status === "ok" ? "var(--green)" : healthResult.status === "degraded" ? "var(--amber)" : "var(--red)" }}>
                  {healthResult.status === "ok" ? "\u2705 " + (isZh ? "\u5065\u5EB7" : "Healthy") :
                   healthResult.status === "degraded" ? "\u26A0\uFE0F " + (isZh ? "\u964D\u7EA7" : "Degraded") :
                   healthResult.status === "failed" ? "\u274C " + (isZh ? "\u5931\u8D25" : "Failed") :
                   healthResult.status === "not_configured" ? "\u2753 " + (isZh ? "\u672A\u914D\u7F6E" : "Not configured") :
                   (isZh ? "\u672A\u77E5" : "Unknown")}
                </div>
                {healthResult.latencyMs != null && (
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    Latency: {healthResult.latencyMs}ms
                  </div>
                )}
                {healthResult.error && (
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                    {healthResult.error}
                  </div>
                )}
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 4 }}>
                  {isZh ? "\u6D4B\u8BD5\u65F6\u95F4\uFF1A" : "Tested: "}{new Date(healthResult.testedAt).toLocaleString()}
                </div>
              </div>
            )}

            {!healthResult && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                {isZh ? "\u70B9\u51FB\u201C\u6D4B\u8BD5\u8FDE\u63A5\u201D\u6309\u94AE\u5F00\u59CB\u68C0\u67E5\u3002" : "Click \"Test Connection\" above to start."}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setStep(2)} style={{ padding: "8px 18px", fontSize: "0.82rem" }}>
                {isZh ? "\u4E0A\u4E00\u6B65" : "Back"}
              </button>
              <button className="btn btn-primary" onClick={handleTestConnection} disabled={testing || !apiKey.trim()}
                style={{ padding: "8px 18px", fontSize: "0.82rem" }}>
                {testing ? (isZh ? "\u6D4B\u8BD5\u4E2D..." : "Testing...") : (isZh ? "\u91CD\u65B0\u6D4B\u8BD5" : "Retest")}
              </button>
              {healthResult?.status === "ok" && (
                <button className="btn btn-primary" onClick={() => setStep(4)}
                  style={{ padding: "8px 18px", fontSize: "0.82rem", marginLeft: "auto" }}>
                  {isZh ? "\u7EE7\u7EED" : "Continue"} &rarr;
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Select Default Model */}
        {step === 4 && (
          <div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 12 }}>
              {isZh ? "\u9009\u62E9\u9ED8\u8BA4\u6A21\u578B\uFF1A" : "Select a default model:"}
            </p>

            <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 16 }}>
              {availableModels.map((m) => (
                <div
                  key={m.modelId}
                  onClick={() => setSelectedModel(m.modelId)}
                  style={{
                    padding: "10px 14px", borderRadius: 8, cursor: "pointer", marginBottom: 6,
                    border: selectedModel === m.modelId ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: selectedModel === m.modelId ? "rgba(79,140,255,0.08)" : "var(--tf-bg, #111)",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>{m.displayName}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {m.modelId}
                    {m.contextWindow ? " \u00B7 " + (m.contextWindow >= 1000000 ? (m.contextWindow / 1000000).toFixed(1) + "M" : (m.contextWindow / 1000).toFixed(0) + "K") + " ctx" : ""}
                    {m.isRecommended ? " \u00B7 " + (isZh ? "\u63A8\u8350" : "Recommended") : ""}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setStep(3)} style={{ padding: "8px 18px", fontSize: "0.82rem" }}>
                {isZh ? "\u4E0A\u4E00\u6B65" : "Back"}
              </button>
              <button className="btn btn-primary" onClick={handleFinish} disabled={saving}
                style={{ padding: "8px 24px", fontSize: "0.85rem", marginLeft: "auto" }}>
                {saving ? (isZh ? "\u4FDD\u5B58\u4E2D..." : "Saving...") : (isZh ? "\u5B8C\u6210\u914D\u7F6E" : "Finish Setup")}
              </button>
            </div>
          </div>
        )}

        {/* Bottom close */}
        {step === 1 && (
          <div style={{ marginTop: 20, textAlign: "right" }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ padding: "8px 18px", fontSize: "0.82rem" }}>
              {isZh ? "\u53D6\u6D88" : "Cancel"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
