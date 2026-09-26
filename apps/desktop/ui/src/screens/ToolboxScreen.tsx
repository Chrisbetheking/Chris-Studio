import { useState, useEffect, useCallback } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import { storeGet, storeSet } from "@tokenfence/shared/src/agent-runtime/safeStorage";
import { executeCommand, openLogsFolder } from "../desktop-bridge";

/* ============================================================
   Toolbox Screen — Token Calc, Guard, ContextPack, Markdown, API
   ============================================================ */
type ToolId = "token-calc" | "prompt-guard" | "context-pack" | "markdown" | "api-builder";

export function ToolboxScreen() {
  const [, forceRender] = useState(0);
  useEffect(() => { return onLangChange(() => forceRender((n) => n + 1)); }, []);
  const [activeTool, setActiveTool] = useState<ToolId>("token-calc");

  const isZh = tk("common.yes") !== "Yes";

  const tools: { id: ToolId; icon: string; labelEn: string; labelZh: string }[] = [
    { id: "token-calc", icon: "\u{1F522}", labelEn: "Token Calculator", labelZh: "\u4EE4\u724CToken\u8BA1\u7B97\u5668" },
    { id: "prompt-guard", icon: "\u{1F6E1}\uFE0F", labelEn: "Prompt Guard Scanner", labelZh: "\u63D0\u793A\u8BCD\u5B89\u5168\u626B\u63CF" },
    { id: "context-pack", icon: "\u{1F4E6}", labelEn: "Context Pack Inspector", labelZh: "\u4E0A\u4E0B\u6587\u5305\u68C0\u67E5\u5668" },
    { id: "markdown", icon: "\u{1F4C4}", labelEn: "Markdown Tools", labelZh: "Markdown \u5DE5\u5177" },
    { id: "api-builder", icon: "\u{1F310}", labelEn: "API Request Builder", labelZh: "API \u8BF7\u6C42\u6784\u5EFA\u5668" },
  ];

  const getLabel = (t: typeof tools[0]) => isZh ? t.labelZh : t.labelEn;

  /* ---- Token Calculator ---- */
  const [tokenText, setTokenText] = useState("");
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);

  /* ---- Prompt Guard Scanner ---- */
  const [guardText, setGuardText] = useState("");
  const [guardResult, setGuardResult] = useState<{ flagged: boolean; details: string } | null>(null);
  const sensitivePatterns = [/api[_\-]?key\s*[:=]\s*['\"]?\w+/i, /sk-[a-zA-Z0-9]{32,}/, /ghp_[a-zA-Z0-9]{36,}/, /-----BEGIN.*PRIVATE KEY-----/s];
  const runGuard = () => {
    for (const pat of sensitivePatterns) {
      if (pat.test(guardText)) {
        setGuardResult({ flagged: true, details: isZh ? "\u68C0\u6D4B\u5230\u654F\u611F\u5185\u5BB9\uff08API Key / \u5BC6\u94A5\uff09" : "Sensitive content detected (API Key / secret)" });
        return;
      }
    }
    setGuardResult({ flagged: false, details: isZh ? "\u672A\u68C0\u6D4B\u5230\u654F\u611F\u6570\u636E" : "No sensitive data detected" });
  };

  /* ---- Context Pack Inspector ---- */
  const [ctxPackText, setCtxPackText] = useState("");
  const ctxStats = { chars: ctxPackText.length, tokens: estimateTokens(ctxPackText), lines: ctxPackText.split("\n").length };

  /* ---- Markdown Tools ---- */
  const [mdText, setMdText] = useState("");
  const [mdHtml, setMdHtml] = useState("");
  const convertMdToHtml = () => {
    // Simple markdown-to-HTML conversion
    let html = mdText
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");
    html = "<!DOCTYPE html><html><head><meta charset='utf-8'><style>body{font-family:system-ui;max-width:800px;margin:auto;padding:20px;line-height:1.6}h1{font-size:1.5em}h2{font-size:1.3em}h3{font-size:1.1em}code{background:#f0f0f0;padding:2px 6px;border-radius:4px}</style></head><body><p>" + html + "</p></body></html>";
    setMdHtml(html);
  };

  /* ---- API Request Builder ---- */
  const [apiUrl, setApiUrl] = useState("");
  const [apiMethod, setApiMethod] = useState("GET");
  const [apiBody, setApiBody] = useState("");
  const [apiResult, setApiResult] = useState("");
  const [apiLoading, setApiLoading] = useState(false);
  const sendApiRequest = async () => {
    setApiLoading(true);
    setApiResult("");
    try {
      const opts: RequestInit = { method: apiMethod, headers: { "Content-Type": "application/json" } };
      if (apiMethod !== "GET" && apiBody.trim()) opts.body = apiBody;
      const resp = await fetch(apiUrl, opts);
      const text = await resp.text();
      setApiResult(`Status: ${resp.status}\n\n${text.slice(0, 10000)}`);
    } catch (e: any) {
      setApiResult(`${isZh ? "\u9519\u8BEF" : "Error"}: ${e.message}`);
    }
    setApiLoading(false);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 24px 12px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--text)" }}>{tk("common.toolbox")}</h2>
        <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>{tk("common.toolGroupDesc")}</p>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Tool list */}
        <div style={{ width: 200, minWidth: 200, borderRight: "1px solid var(--border)", overflowY: "auto", padding: 8 }}>
          {tools.map((t) => (
            <div
              key={t.id}
              onClick={() => setActiveTool(t.id)}
              style={{
                padding: "10px 12px", cursor: "pointer", borderRadius: 8, marginBottom: 2,
                background: activeTool === t.id ? "var(--surface-alt)" : "transparent",
                fontSize: "0.78rem", color: activeTool === t.id ? "var(--primary)" : "var(--text)",
                fontWeight: activeTool === t.id ? 600 : 400,
              }}
            >
              {t.icon} {getLabel(t)}
            </div>
          ))}
        </div>

        {/* Tool content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {/* Token Calculator */}
          {activeTool === "token-calc" && (
            <div>
              <h3 style={{ margin: "0 0 12px", fontSize: "1rem", color: "var(--text)" }}>{getLabel(tools[0])}</h3>
              <textarea className="input" value={tokenText} onChange={(e) => setTokenText(e.target.value)}
                placeholder={isZh ? "\u7C98\u8D34\u6587\u672C\u4EE5\u4F30\u7B97Token\u6570..." : "Paste text to estimate tokens..."}
                style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, resize: "vertical", boxSizing: "border-box" }} />
              <div style={{ marginTop: 12, display: "flex", gap: 16 }}>
                <div className="card" style={{ flex: 1, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--primary)" }}>{tokenText.length.toLocaleString()}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{isZh ? "\u5B57\u7B26" : "Chars"}</div>
                </div>
                <div className="card" style={{ flex: 1, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--primary)" }}>~{estimateTokens(tokenText).toLocaleString()}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{isZh ? "Token (\u4F30\u7B97)" : "Tokens (est.)"}</div>
                </div>
                <div className="card" style={{ flex: 1, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--primary)" }}>{tokenText.split(/\s+/).filter(Boolean).length}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{isZh ? "\u5355\u8BCD" : "Words"}</div>
                </div>
              </div>
            </div>
          )}

          {/* Prompt Guard Scanner */}
          {activeTool === "prompt-guard" && (
            <div>
              <h3 style={{ margin: "0 0 12px", fontSize: "1rem", color: "var(--text)" }}>{getLabel(tools[1])}</h3>
              <textarea className="input" value={guardText} onChange={(e) => setGuardText(e.target.value)}
                placeholder={isZh ? "\u8F93\u5165\u63D0\u793A\u8BCD\u8FDB\u884C\u5B89\u5168\u626B\u63CF..." : "Enter prompt to scan for sensitive data..."}
                style={{ width: "100%", minHeight: 150, fontFamily: "monospace", fontSize: "0.8rem", background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, resize: "vertical", boxSizing: "border-box" }} />
              <button className="btn btn-primary" onClick={runGuard} style={{ marginTop: 10, fontSize: "0.8rem" }}>
                {isZh ? "\u626B\u63CF" : "Scan"}
              </button>
              {guardResult && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: guardResult.flagged ? "rgba(255,0,0,0.08)" : "rgba(0,200,0,0.08)", color: guardResult.flagged ? "var(--red)" : "var(--green)", fontSize: "0.8rem" }}>
                  {guardResult.flagged ? "\u26A0\uFE0F " : "\u2705 "}{guardResult.details}
                </div>
              )}
            </div>
          )}

          {/* Context Pack Inspector */}
          {activeTool === "context-pack" && (
            <div>
              <h3 style={{ margin: "0 0 12px", fontSize: "1rem", color: "var(--text)" }}>{getLabel(tools[2])}</h3>
              <textarea className="input" value={ctxPackText} onChange={(e) => setCtxPackText(e.target.value)}
                placeholder={isZh ? "\u7C98\u8D34\u4E0A\u4E0B\u6587\u5305\u5185\u5BB9..." : "Paste context pack content..."}
                style={{ width: "100%", minHeight: 150, fontFamily: "monospace", fontSize: "0.8rem", background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, resize: "vertical", boxSizing: "border-box" }} />
              <div style={{ marginTop: 12, display: "flex", gap: 16 }}>
                <div className="card" style={{ flex: 1, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary)" }}>{ctxStats.chars.toLocaleString()}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{isZh ? "\u5B57\u7B26" : "Chars"}</div>
                </div>
                <div className="card" style={{ flex: 1, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary)" }}>~{ctxStats.tokens.toLocaleString()}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Tokens</div>
                </div>
                <div className="card" style={{ flex: 1, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary)" }}>{ctxStats.lines.toLocaleString()}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{isZh ? "\u884C" : "Lines"}</div>
                </div>
              </div>
            </div>
          )}

          {/* Markdown Tools */}
          {activeTool === "markdown" && (
            <div>
              <h3 style={{ margin: "0 0 12px", fontSize: "1rem", color: "var(--text)" }}>{getLabel(tools[3])}</h3>
              <textarea className="input" value={mdText} onChange={(e) => setMdText(e.target.value)}
                placeholder="# Markdown here..."
                style={{ width: "100%", minHeight: 150, fontFamily: "monospace", fontSize: "0.8rem", background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, resize: "vertical", boxSizing: "border-box" }} />
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={convertMdToHtml} style={{ fontSize: "0.8rem" }}>
                  {isZh ? "\u8F6C\u6362\u4E3A HTML" : "Convert to HTML"}
                </button>
                {mdHtml && (
                  <button className="btn btn-secondary" onClick={() => { navigator.clipboard.writeText(mdHtml); }} style={{ fontSize: "0.8rem" }}>
                    {isZh ? "\u590D\u5236 HTML" : "Copy HTML"}
                  </button>
                )}
              </div>
              {mdHtml && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                    {isZh ? "HTML \u9884\u89C8" : "HTML Preview"}
                  </div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "white", color: "#333", fontSize: "0.8rem", maxHeight: 300, overflow: "auto" }}
                    dangerouslySetInnerHTML={{ __html: mdHtml }} />
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: "0.7rem", color: "var(--text-muted)", cursor: "pointer" }}>
                      {isZh ? "\u67E5\u770B HTML \u6E90\u7801" : "View HTML Source"}
                    </summary>
                    <pre style={{ fontSize: "0.65rem", background: "var(--surface-alt)", padding: 8, borderRadius: 6, overflow: "auto", maxHeight: 200 }}>{mdHtml}</pre>
                  </details>
                </div>
              )}
            </div>
          )}

          {/* API Request Builder */}
          {activeTool === "api-builder" && (
            <div>
              <h3 style={{ margin: "0 0 12px", fontSize: "1rem", color: "var(--text)" }}>{getLabel(tools[4])}</h3>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <select className="input" value={apiMethod} onChange={(e) => setApiMethod(e.target.value)}
                  style={{ width: 100, padding: "8px 12px", background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.8rem" }}>
                  <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
                </select>
                <input className="input" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.example.com/endpoint"
                  style={{ flex: 1, padding: "8px 12px", background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.8rem", boxSizing: "border-box" }} />
              </div>
              {apiMethod !== "GET" && (
                <textarea className="input" value={apiBody} onChange={(e) => setApiBody(e.target.value)}
                  placeholder='{"key": "value"}'
                  style={{ width: "100%", minHeight: 80, fontFamily: "monospace", fontSize: "0.75rem", background: "var(--surface-alt)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: 8, resize: "vertical", boxSizing: "border-box", marginBottom: 8 }} />
              )}
              <button className="btn btn-primary" onClick={sendApiRequest} disabled={apiLoading || !apiUrl.trim()} style={{ fontSize: "0.8rem" }}>
                {apiLoading ? "..." : (isZh ? "\u53D1\u9001" : "Send")}
              </button>
              {apiResult && (
                <pre style={{ marginTop: 12, padding: 12, background: "var(--surface-alt)", borderRadius: 8, fontSize: "0.7rem", fontFamily: "monospace", color: "var(--text)", overflow: "auto", maxHeight: 300, whiteSpace: "pre-wrap" }}>{apiResult}</pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
