export function ProvidersScreen() {
  return (
    <div>
      <h1 className="page-title">Provider Settings</h1>
      <p className="page-subtitle">Configure API keys and endpoints for AI providers</p>
      <div className="card">
        <div className="card-header"><div><div className="card-title">Supported Providers</div><div className="card-subtitle">Multi-provider with automatic fallback</div></div></div>
        <div className="section-list">
          <div className="section-item"><div className="section-item-title">Anthropic (Claude)</div><div className="section-item-desc">Claude 3.5 Sonnet, Claude 3 Haiku</div></div>
          <div className="section-item"><div className="section-item-title">Google (Gemini)</div><div className="section-item-desc">Gemini 2.0 Flash, Gemini 1.5 Pro</div></div>
          <div className="section-item"><div className="section-item-title">Ollama (Local)</div><div className="section-item-desc">Run models locally. No external API key needed.</div></div>
          <div className="section-item"><div className="section-item-title">OpenAI Compatible</div><div className="section-item-desc">Any OpenAI-compatible endpoint or local server</div></div>
        </div>
      </div>
    </div>
  );
}
