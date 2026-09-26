import { useState, useCallback } from "react";
import { exportContent } from "@tokenfence/shared/src/plugins/output-generators";
import { initTokenfenceDirs, writeFile, isTauri } from "../desktop-bridge";
import type { OutputResult } from "@tokenfence/shared/src/plugins/output-generators";

export function OutputScreen() {
  const [title, setTitle] = useState("Agent Report");
  const [content, setContent] = useState("## Summary\n\nThis is a sample agent output report.\n\n- Task completed successfully\n- No errors detected\n- Output files generated");
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<OutputResult[]>([]);
  const [tauriAvailable, setTauriAvailable] = useState<boolean | null>(null);

  const initDirs = useCallback(async () => {
    setTauriAvailable(await isTauri());
  }, []);
  useState(() => { initDirs(); });

  const generate = useCallback(async (format: OutputResult["format"]) => {
    setGenerating(true);
    try {
      const result = exportContent(content, title, format);
      const inTauri = await isTauri();
      if (inTauri) {
        await initTokenfenceDirs(".tokenfence");
        await writeFile(`.tokenfence/outputs/${result.filename}`, result.content);
        result.filePath = `.tokenfence/outputs/${result.filename}`;
      }
      setResults((prev) => [result, ...prev.filter((r) => r.filename !== result.filename)]);
    } catch (e: any) {
      console.error("Generate failed:", e);
    }
    setGenerating(false);
  }, [title, content]);

  const formats: { format: OutputResult["format"]; label: string; icon: string }[] = [
    { format: "md", label: "Markdown", icon: "MD" },
    { format: "html", label: "HTML", icon: "HTML" },
    { format: "json", label: "JSON", icon: "JSON" },
    { format: "pdf", label: "PDF", icon: "PDF" },
    { format: "docx", label: "DOCX", icon: "DOCX" },
  ];

  return (
    <div>
      <h1 className="page-title">Output Generator</h1>
      <p className="page-subtitle">Generate Markdown, HTML, JSON, PDF, and DOCX files from agent output</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Content</div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" />
            <label>Content (Markdown)</label>
            <textarea className="input" rows={8} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write your content in Markdown..." style={{ fontFamily: "monospace", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {formats.map((f) => (
                <button key={f.format} className="btn btn-primary" disabled={generating} onClick={() => generate(f.format)}>
                  Generate {f.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Generated Files</div>
            <span className="badge badge-green">{results.length} files</span>
          </div>
          {results.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No files generated yet</div>
              <p>Select a format and generate to create output files.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {results.map((r, i) => (
                <div key={i} className="card" style={{ padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong>{r.filename}</strong>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        {r.format.toUpperCase()} — {r.content.length} bytes — {new Date(r.generatedAt).toLocaleTimeString()}
                      </div>
                      {r.filePath && <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", fontFamily: "monospace" }}>{r.filePath}</div>}
                    </div>
                    <span className="badge badge-green">Generated</span>
                  </div>
                  <pre style={{ marginTop: 8, padding: 8, background: "var(--bg-secondary)", borderRadius: 6, fontSize: "0.75rem", maxHeight: 120, overflow: "auto", whiteSpace: "pre-wrap" }}>{r.content.slice(0, 500)}{r.content.length > 500 ? "..." : ""}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><div className="card-title">Status</div></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, fontSize: "0.85rem" }}>
          <div><span style={{ color: "var(--text-secondary)" }}>Tauri Desktop:</span> {tauriAvailable === null ? "Detecting..." : tauriAvailable ? "Connected — files written to .tokenfence/outputs/" : "Browser mode — no filesystem access"}</div>
          <div><span style={{ color: "var(--text-secondary)" }}>PDF:</span> Built-in minimal PDF generator</div>
          <div><span style={{ color: "var(--text-secondary)" }}>DOCX:</span> Office Open XML template</div>
        </div>
      </div>
    </div>
  );
}

