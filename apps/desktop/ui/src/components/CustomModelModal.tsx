import { useState } from "react";
import { tk } from "@tokenfence/shared/src/i18n";
import { saveCustomModel, removeCustomModel, customModelToProviderConfig, loadCustomModels, type CustomModelEntry } from "../data/active-model";
import { saveProviderConfigs, loadProviderConfigs } from "@tokenfence/shared/src/providers";

/* ============================================================
   CustomModelModal — Add custom provider + model v1.2.8
   ============================================================ */

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

export function CustomModelModal({ open, onClose, onAdded }: Props) {
  const isZh = tk("common.yes") !== "Yes";

  const [providerName, setProviderName] = useState("");
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [contextLength, setContextLength] = useState(128000);
  const [modelType, setModelType] = useState<"chat" | "reasoning" | "coding" | "vision">("chat");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const providerId = providerName.toLowerCase().replace(/\s+/g, "-");

  const handleSubmit = () => {
    setError("");

    if (!providerName.trim()) { setError(isZh ? "\u8BF7\u8F93\u5165\u63D0\u4F9B\u5546\u540D\u79F0" : "Please enter a provider name."); return; }
    if (!modelId.trim()) { setError(isZh ? "\u8BF7\u8F93\u5165\u6A21\u578B ID" : "Please enter a model ID."); return; }
    if (!baseUrl.trim()) { setError(isZh ? "\u8BF7\u8F93\u5165 Base URL" : "Please enter a base URL."); return; }
    if (!apiKey.trim()) { setError(isZh ? "\u8BF7\u8F93\u5165 API Key" : "Please enter an API key."); return; }

    setSubmitting(true);

    try {
      // Save as custom model
      const entry: CustomModelEntry = {
        id: "custom-" + Date.now(),
        providerId,
        providerName: providerName.trim(),
        modelId: modelId.trim(),
        displayName: displayName.trim() || modelId.trim(),
        baseUrl: baseUrl.trim().replace(/\/+$/, ""),
        apiKey: apiKey.trim(),
        contextLength,
        modelType,
        addedAt: Date.now(),
      };
      saveCustomModel(entry);

      // Also save as provider config so it appears in provider list
      const config = customModelToProviderConfig(entry);
      const configs = loadProviderConfigs();
      const idx = configs.findIndex((c) => c.provider === config.provider);
      if (idx >= 0) configs[idx] = { ...configs[idx], ...config };
      else configs.push(config);

      // Merge with existing if same provider
      const merged: any[] = [];
      const seen = new Set<string>();
      for (const c of configs) {
        if (!seen.has(c.provider)) {
          seen.add(c.provider);
          merged.push(c);
        }
      }
      saveProviderConfigs(merged);

      onAdded();
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.6)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--tf-surface, #1e1e2e)", borderRadius: 12,
        padding: "24px 28px", minWidth: 480, maxWidth: 560,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        border: "1px solid var(--tf-border, #333)",
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontSize: "1.05rem", fontWeight: 600, color: "var(--text)" }}>
          {isZh ? "\u6DFB\u52A0\u81EA\u5B9A\u4E49\u6A21\u578B" : "Add Custom Model"}
        </h3>

        {error && (
          <div style={{ padding: "8px 12px", marginBottom: 14, background: "rgba(255,80,80,0.12)", borderRadius: 6, color: "var(--red, #f44)", fontSize: "0.78rem" }}>{error}</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Provider Name */}
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>
              {isZh ? "\u63D0\u4F9B\u5546\u540D\u79F0" : "Provider Name"}
            </label>
            <input
              type="text"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              placeholder={isZh ? "\u4F8B\u5982: MyProvider" : "e.g. MyProvider"}
              style={{ width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)" }}
            />
          </div>

          {/* Model ID */}
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>
              {isZh ? "\u6A21\u578B ID" : "Model ID"}
            </label>
            <input
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="e.g. my-model-v1"
              style={{ width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)" }}
            />
          </div>

          {/* Display Name */}
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>
              {isZh ? "\u663E\u793A\u540D\u79F0" : "Display Name"}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={isZh ? "\u53EF\u9009\uFF0C\u9ED8\u8BA4\u4F7F\u7528 Model ID" : "Optional, defaults to Model ID"}
              style={{ width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)" }}
            />
          </div>

          {/* Base URL */}
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>
              Base URL
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              style={{ width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)" }}
            />
          </div>

          {/* API Key */}
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              style={{ width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)" }}
            />
          </div>

          {/* Context Length + Model Type */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>
                {isZh ? "\u4E0A\u4E0B\u6587\u957F\u5EA6" : "Context Length"}
              </label>
              <input
                type="number"
                value={contextLength}
                onChange={(e) => setContextLength(Number(e.target.value))}
                style={{ width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 3 }}>
                {isZh ? "\u6A21\u578B\u7C7B\u578B" : "Model Type"}
              </label>
              <select
                value={modelType}
                onChange={(e) => setModelType(e.target.value as any)}
                style={{ width: "100%", padding: "8px 10px", fontSize: "0.82rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--tf-bg, #111)", color: "var(--text)" }}
              >
                <option value="chat">Chat</option>
                <option value="reasoning">Reasoning</option>
                <option value="coding">Coding</option>
                <option value="vision">Vision</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            style={{ padding: "8px 18px", fontSize: "0.82rem" }}
          >
            {isZh ? "\u53D6\u6D88" : "Cancel"}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
            style={{ padding: "8px 18px", fontSize: "0.82rem" }}
          >
            {submitting ? "..." : isZh ? "\u6DFB\u52A0" : "Add Model"}
          </button>
        </div>
      </div>
    </div>
  );
}
