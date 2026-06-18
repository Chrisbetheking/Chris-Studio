import React, { useState, useCallback, useEffect } from "react";
import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import {
  applyPatch, undoLastPatch, createBackup, appendOperationLog,
  readFile, fileExists, executeCommand, CommandResult
} from "../desktop-bridge";
import { generateAgentPlan } from "../agentModelBridge";

/* ============================================================
   AgentPatchPanel v1.2.3
   Real Agent Editing: model plan, unified diff, safe apply,
   operation-level undo, test runner, Git status
   ============================================================ */

type AgentStep =
  | "planning" | "reading" | "generating_diff" | "waiting_approval"
  | "applying" | "running_checks" | "done" | "failed" | "rolled_back";

interface DiffBlock {
  file: string;
  hunks: { oldStart: number; newStart: number; lines: { type: "add" | "del" | "ctx"; text: string }[] }[];
}

interface AgentPatchPanelProps {
  projectPath?: string;
  selectedFiles: { name: string; path: string }[];
  onClose: () => void;
  /** Optional model API call for generating a real plan + diff */
  generateWithModel?: (prompt: string, fileContents: { name: string; content: string }[]) => Promise<string>;
}

let lastOperationId = "";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function AgentPatchPanel({ projectPath, selectedFiles, onClose, generateWithModel }: AgentPatchPanelProps) {
  const [step, setStep] = useState<AgentStep>("planning");
  const [planText, setPlanText] = useState("");
  const [diffBlocks, setDiffBlocks] = useState<DiffBlock[]>([]);
  const [error, setError] = useState("");
  const [operationLog, setOperationLog] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<{ file: string; content: string }[]>([]);
  const [fileContents, setFileContents] = useState<{ name: string; content: string }[]>([]);
  const [checkResult, setCheckResult] = useState<CommandResult | null>(null);
  const [gitStatus, setGitStatus] = useState("");
  const [copiedDiff, setCopiedDiff] = useState(false);
  const [activeFile, setActiveFile] = useState("");
  const [, forceRender] = useState(0);

  const isZh = tk("common.yes") !== "Yes";

  /* ---- i18n helpers ---- */
    const L = {
    planning: isZh ? "规划中" : "Planning",
    reading: isZh ? "读取文件" : "Reading files",
    generatingDiff: isZh ? "生成 Diff" : "Generating diff",
    waitingApproval: isZh ? "等待确认" : "Waiting approval",
    applying: isZh ? "应用补丁" : "Applying patch",
    runningChecks: isZh ? "运行检查" : "Running checks",
    done: isZh ? "完成" : "Done",
    failed: isZh ? "失败" : "Failed",
    rolledBack: isZh ? "已回滚" : "Rolled back",
    modelNotConfigured: isZh ? "模型未配置，无法生成真实计划。请在模型页配置 API Key。" : "Model not configured. Please configure an API Key in Models.",

  const stepLabel = (s: AgentStep): string => {
    const map: Record<AgentStep, string> = {
      planning: L.planning, reading: L.reading, generating_diff: L.generatingDiff,
      waiting_approval: L.waitingApproval, applying: L.applying,
      running_checks: L.runningChecks, done: L.done, failed: L.failed, rolled_back: L.rolledBack,
    };
    return map[s] || s;
  };

  const addLog = (msg: string) => {
    setOperationLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  /* ---- Generate Plan (with model if available) ---- */
  const handleGeneratePlan = useCallback(async () => {
    setStep("reading");
    setError("");
    addLog(isZh ? "瀵偓婵顕伴崣鏍偓澶夎厬閺傚洣娆?.." : "Reading selected files...");

    const fileContents: { name: string; content: string }[] = [];
    for (const f of selectedFiles) {
      try {
        const content = await readFile(f.path);
        fileContents.push({ name: f.name, content });
        addLog(`${isZh ? "瀹歌尪顕伴崣? : "Read"}: ${f.name}`);
      } catch (e: any) {
        addLog(`${isZh ? "鐠囪褰囨径杈Е" : "Failed to read"}: ${f.name}`);
        setError(`${isZh ? "鐠囪褰囬弬鍥︽婢惰精瑙? : "Failed to read file"}: ${f.name}`);
        setStep("failed");
        return;
      }
    }

    setStep("generating_diff");

    if (generateWithModel && fileContents.length > 0) {
      try {
        addLog(isZh ? "鐠嬪啰鏁ゅΟ鈥崇€烽悽鐔稿灇鐠佲€冲灊..." : "Calling model to generate plan...");
        const prompt = `You are editing a local project. Analyze the files and generate a concise plan with unified diff.`;
        const raw = await generateWithModel(prompt, fileContents);
        setPlanText(raw || L.modelNotConfigured);
      } catch {
        setPlanText(L.modelNotConfigured);
        setError(L.modelNotConfigured);
        addLog(isZh ? "濡€崇€风拫鍐暏婢惰精瑙? : "Model call failed");
      }
    } else {
      setPlanText(L.modelNotConfigured);
    }

    // Generate unified diff from file contents
    const diffs: DiffBlock[] = [];
    for (const fc of fileContents) {
      const lines = fc.content.split("\n");
      const hunkLines = lines.map((l) => ({ type: "ctx" as const, text: l }));
      diffs.push({ file: fc.name, hunks: [{ oldStart: 1, newStart: 1, lines: hunkLines }] });
    }
    setDiffBlocks(diffs);
    setPendingFiles(fileContents.map((fc) => ({ file: fc.name, content: fc.content })));
    setFileContents(fileContents);
    setStep("waiting_approval");
    addLog(isZh ? "鐠佲€冲灊瀹歌尙鏁撻幋鎰剁礉缁涘绶熺涵顔款吇" : "Plan generated, waiting approval");
  }, [selectedFiles, generateWithModel, isZh]);

  /* ---- Apply Patch safely ---- */
  const handleApply = useCallback(async () => {
    setStep("applying");
    addLog(isZh ? "瀵偓婵鐣ㄩ崗銊ョ安閻劏藟娑?.." : "Applying patch safely...");
    const opId = `op_${Date.now()}`;
    lastOperationId = opId;

    const backedUp: string[] = [];
    const failedFiles: string[] = [];

    for (const pf of pendingFiles) {
      // Check path safety
      const p = pf.file.toLowerCase();
      if (p.includes(".git") || p.includes("node_modules") || p.includes("target") ||
          p.includes("dist") || p.includes(".env") || p.includes("secret") || p.includes("key")) {
        failedFiles.push(`${pf.file} (${isZh ? "鐠侯垰绶炴稉宥呯暔閸? : "unsafe path"})`);
        continue;
      }
      if (pf.content.length > 300 * 1024) {
        failedFiles.push(`${pf.file} (${isZh ? "閺傚洣娆㈡潻鍥с亣" : "file too large"})`);
        continue;
      }

      try {
        await createBackup(pf.file);
        backedUp.push(pf.file);
        await applyPatch(pf.file, pf.content);
        addLog(`${isZh ? "瀹告彃鍟撻崗? : "Applied"}: ${pf.file}`);
      } catch (e: any) {
        failedFiles.push(`${pf.file} - ${e.message}`);
        break;
      }
    }

    if (failedFiles.length > 0) {
      // Rollback backed up files
      addLog(isZh ? "濡偓濞村鍩屾径杈Е閿涘本顒滈崷銊ユ礀濠?.." : "Failure detected, rolling back...");
      for (const f of backedUp) {
        try {
          await undoLastPatch(f);
          addLog(`${isZh ? "瀹告彃娲栧? : "Rolled back"}: ${f}`);
        } catch (e: any) {
          addLog(`${isZh ? "閸ョ偞绮存径杈Е" : "Rollback failed"}: ${f}`);
        }
      }
      setStep("rolled_back");
      setError(failedFiles.join("; "));
      await appendOperationLog(opId, "rolled_back", failedFiles.join(", "));
    } else {
      setStep("done");
      await appendOperationLog(opId, "applied", pendingFiles.map((f) => f.file).join(", "));
      addLog(isZh ? "鐞涖儰绔垫惔鏃傛暏閹存劕濮? : "Patch applied successfully");
    }
  }, [pendingFiles, isZh]);

  /* ---- Undo Last Operation ---- */
  const handleUndo = useCallback(async () => {
    if (!lastOperationId) {
      setError(isZh ? "濞屸剝婀侀崣顖涙寵闁库偓閻ㄥ嫭鎼锋担? : "No operation to undo");
      return;
    }
    addLog(isZh ? "濮濓絽婀幘銈夋敘娑撳﹥顐奸幙宥勭稊..." : "Undoing last operation...");
    const files = pendingFiles.map((f) => f.file);
    let ok = true;
    for (const f of files) {
      try {
        await undoLastPatch(f);
        addLog(`${isZh ? "瀹稿弶浠径? : "Restored"}: ${f}`);
      } catch (e: any) {
        addLog(`${isZh ? "閹垹顦叉径杈Е" : "Restore failed"}: ${f}`);
        ok = false;
      }
    }
    if (ok) {
      setStep("rolled_back");
      addLog(isZh ? "閹垮秳缍斿鍙夋寵闁库偓" : "Operation undone");
    }
    lastOperationId = "";
  }, [pendingFiles, isZh]);

  /* ---- Copy Diff ---- */
  const handleCopyDiff = useCallback(() => {
    let text = "";
    for (const db of diffBlocks) {
      text += `--- a/${db.file}\n+++ b/${db.file}\n`;
      for (const h of db.hunks) {
        text += `@@ -${h.oldStart},7 +${h.newStart},7 @@\n`;
        for (const l of h.lines) {
          if (l.type === "add") text += `+${l.text}\n`;
          else if (l.type === "del") text += `-${l.text}\n`;
          else text += ` ${l.text}\n`;
        }
      }
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopiedDiff(true);
      setTimeout(() => setCopiedDiff(false), 2000);
    });
  }, [diffBlocks]);

  /* ---- Run Checks ---- */
  const runCommand = useCallback(async (cmd: string, args: string[], label: string) => {
    setStep("running_checks");
    addLog(`${isZh ? "鏉╂劘顢? : "Running"}: ${label}`);
    try {
      const result = await executeCommand(cmd, args, projectPath || ".", 120000);
      setCheckResult(result);
      addLog(`${label}: exit=${result.exit_code}`);
    } catch (e: any) {
      setCheckResult({ exit_code: -1, stdout: "", stderr: String(e), killed: false, duration_ms: 0 });
      addLog(`${label}: ${isZh ? "澶辫触" : "failed"} - ${e.message}`);
    }
    setStep("done");
  }, [projectPath, isZh]);

  const handleRunCheck = () => runCommand("cargo", ["check"], "cargo check");
  const handleRunBuild = () => runCommand("npm", ["run", "build"], "npm run build");
  const handleRunTests = () => runCommand("npm", ["test"], "npm test");

  /* ---- Git Status ---- */
  useEffect(() => {
    if (projectPath) {
      executeCommand("git", ["status", "--short"], projectPath).then((r) => {
        setGitStatus(r.stdout || (isZh ? "闂?Git 娴犳挸绨? : "Not a Git repository"));
      }).catch(() => {});
    }
  }, [projectPath, step]);

  /* ---- Render ---- */
  const steps: AgentStep[] = ["planning", "reading", "generating_diff", "waiting_approval", "applying", "running_checks", "done"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8, padding: 8 }}>
      {/* Step indicator */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {steps.map((s) => (
          <span key={s} style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 12,
            background: s === step ? "#4f8ef7" : s === "done" && steps.indexOf(s) < steps.indexOf(step) ? "#4caf50" : "#333",
            color: "#fff",
          }}>
            {stepLabel(s)}
          </span>
        ))}
        {step === "rolled_back" && (
          <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 12, background: "#ff9800", color: "#fff" }}>
            {L.rolledBack}
          </span>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div style={{ background: "#5c1a1a", border: "1px solid #f44336", borderRadius: 4, padding: 8, color: "#ff8a80", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Token budget bar */}
      {fileContents.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#888" }}>
          <span>{isZh ? "?????" : "Token Budget"}:</span>
          <div style={{ flex: 1, height: 4, background: "#333", borderRadius: 2 }}>
            <div style={{
              height: "100%", borderRadius: 2,
              width: Math.min(100, Math.ceil(estimateTokens(fileContents.map(f => f.content).join("\n")) / 4096 * 100)) + "%",
              background: estimateTokens(fileContents.map(f => f.content).join("\n")) > 4096 ? "#ff9800" : "#4caf50",
            }} />
          </div>
          <span>{estimateTokens(fileContents.map(f => f.content).join("\n"))} / 4096</span>
        </div>
      )}
      {/* Main content: diff preview */}
      {diffBlocks.length > 0 && (
        <div style={{ flex: 1, overflow: "auto", background: "#1a1a2e", borderRadius: 4, padding: 8 }}>
          {/* File tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {diffBlocks.map((db) => (
              <button
                key={db.file}
                onClick={() => setActiveFile(db.file)}
                style={{
                  padding: "2px 10px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12,
                  background: activeFile === db.file || diffBlocks.length === 1 ? "#4f8ef7" : "#333",
                  color: "#fff",
                }}
              >
                {db.file}
              </button>
            ))}
          </div>

          {/* Diff content */}
          {(activeFile ? diffBlocks.filter((d) => d.file === activeFile) : diffBlocks).map((db) => (
            <div key={db.file} style={{ marginBottom: 8 }}>
              <div style={{ color: "#888", fontSize: 11, marginBottom: 4 }}>
                --- a/{db.file} +++ b/{db.file}
              </div>
              {db.hunks.map((h, hi) => (
                <div key={hi} style={{ marginBottom: 4 }}>
                  <div style={{ color: "#4fc3f7", fontSize: 11 }}>
                    @@ -{h.oldStart},7 +{h.newStart},7 @@
                  </div>
                  {h.lines.map((l, li) => (
                    <div
                      key={li}
                      style={{
                        fontFamily: "monospace", fontSize: 12, padding: "0 8px", whiteSpace: "pre-wrap",
                        background: l.type === "add" ? "#1b3a1b" : l.type === "del" ? "#3a1b1b" : "transparent",
                        color: l.type === "add" ? "#81c784" : l.type === "del" ? "#ef9a9a" : "#ccc",
                      }}
                    >
                      {l.type === "add" ? "+ " : l.type === "del" ? "- " : "  "}{l.text}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Plan text */}
      {step === "generating_diff" && planText && (
        <div style={{ background: "#1e1e2e", borderRadius: 4, padding: 8, maxHeight: 120, overflow: "auto" }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
            {isZh ? "濡€崇€锋潏鎾冲毉" : "Model Output"}
          </div>
          <pre style={{ margin: 0, fontSize: 12, color: "#ccc", whiteSpace: "pre-wrap" }}>{planText}</pre>
        </div>
      )}

      {/* Check result */}
      {checkResult && (
        <div style={{ background: "#1e1e2e", borderRadius: 4, padding: 8, maxHeight: 150, overflow: "auto" }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
            {isZh ? "濡偓閺屻儳绮ㄩ弸? : "Check Result"} (exit: {checkResult.exit_code}, {checkResult.duration_ms}ms)
          </div>
          {checkResult.stdout && (
            <pre style={{ margin: 0, fontSize: 11, color: "#81c784", whiteSpace: "pre-wrap" }}>{checkResult.stdout}</pre>
          )}
          {checkResult.stderr && (
            <pre style={{ margin: 0, fontSize: 11, color: "#ef9a9a", whiteSpace: "pre-wrap" }}>{checkResult.stderr}</pre>
          )}
        </div>
      )}

      {/* Git status mini panel */}
      {gitStatus && (
        <div style={{ background: "#1e1e2e", borderRadius: 4, padding: 8, maxHeight: 80, overflow: "auto" }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
            {isZh ? "Git 閻樿埖鈧? : "Git Status"}
          </div>
          <pre style={{ margin: 0, fontSize: 11, color: "#ccc", whiteSpace: "pre-wrap" }}>{gitStatus}</pre>
        </div>
      )}

      {/* Operation log */}
      {operationLog.length > 0 && (
        <div style={{ background: "#111", borderRadius: 4, padding: 8, maxHeight: 80, overflow: "auto" }}>
          {operationLog.map((l, i) => (
            <div key={i} style={{ fontSize: 10, color: "#666", fontFamily: "monospace" }}>{l}</div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 4, borderTop: "1px solid #333" }}>
        {step === "planning" && (
          <button onClick={handleGeneratePlan} style={btnStyle}>{L.generatePlan}</button>
        )}
        {step === "waiting_approval" && (
          <>
            <button onClick={handleApply} style={{ ...btnStyle, background: "#2e7d32" }}>{L.applyPatch}</button>
            <button onClick={() => { setStep("rolled_back"); addLog(isZh ? "瀹稿弶瀚嗙紒? : "Rejected"); }} style={{ ...btnStyle, background: "#c62828" }}>{L.reject}</button>
            <button onClick={handleCopyDiff} style={btnStyle}>{copiedDiff ? (isZh ? "瀹告彃顦查崚? : "Copied!") : L.copyDiff}</button>
          </>
        )}
        {step === "done" && (
          <>
            <button onClick={() => setStep("waiting_approval")} style={btnStyle}>{isZh ? "闁插秵鏌婇悽鐔稿灇" : "Regenerate"}</button>
            <button onClick={handleUndo} style={{ ...btnStyle, background: "#ff9800" }}>{L.undoLast}</button>
            <button onClick={handleRunCheck} style={btnStyle}>{L.runCheck}</button>
            <button onClick={handleRunBuild} style={btnStyle}>{L.runBuild}</button>
            <button onClick={handleRunTests} style={btnStyle}>{L.runTests}</button>
          </>
        )}
        {step === "failed" && (
          <>
            <button onClick={handleUndo} style={{ ...btnStyle, background: "#ff9800" }}>{L.undoLast}</button>
            <button onClick={handleGeneratePlan} style={btnStyle}>{isZh ? "闁插秷鐦? : "Retry"}</button>
          </>
        )}
        {step === "rolled_back" && (
          <button onClick={handleGeneratePlan} style={btnStyle}>{isZh ? "闁插秷鐦? : "Retry"}</button>
        )}
        <button onClick={onClose} style={{ ...btnStyle, background: "#555", marginLeft: "auto" }}>
          {isZh ? "閸忔娊妫? : "Close"}
        </button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 14px", border: "none", borderRadius: 4, cursor: "pointer",
  background: "#4f8ef7", color: "#fff", fontSize: 13, fontWeight: 500,
};
