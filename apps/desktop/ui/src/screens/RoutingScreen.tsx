export function RoutingScreen() {
  return (
    <div>
      <h1 className="page-title">Model Routing</h1>
      <p className="page-subtitle">Auto-routing by task type with fallback chains (experimental)</p>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Task Categories</div><div className="stat-value">7</div></div>
        <div className="stat-card"><div className="stat-label">Rules</div><div className="stat-value">7</div></div>
      </div>
      <div className="card">
        <div className="card-header"><div><div className="card-title">Routing Rules</div><div className="card-subtitle">Per-category rules with automatic fallback</div></div><span className="badge badge-amber">Experimental</span></div>
        <div className="section-list">
          <div className="section-item"><div className="section-item-title">Code</div><div className="section-item-desc">Anthropic Claude ? OpenAI GPT-4o ? Ollama DeepSeek Coder</div></div>
          <div className="section-item"><div className="section-item-title">Safety</div><div className="section-item-desc">Ollama Llama 3.2 (local preferred) ? OpenAI GPT-4o-mini</div></div>
          <div className="section-item"><div className="section-item-title">General</div><div className="section-item-desc">OpenAI GPT-4o ? Gemini Flash ? Ollama Llama 3.2</div></div>
          <div className="section-item"><div className="section-item-title">Agent</div><div className="section-item-desc">Anthropic Claude ? OpenAI GPT-4o ? Gemini Flash ? Ollama Llama 3.2</div></div>
        </div>
      </div>
    </div>
  );
}
