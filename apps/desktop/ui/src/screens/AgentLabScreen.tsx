import { tk, onLangChange } from "@tokenfence/shared/src/i18n";
import { useState, useEffect, useCallback } from "react";
import {
  createTask,
  listTasks,
  setTaskStatus,
  updateStepStatus,
  appendLog,
  getLogs,
  buildSkillResult,
} from "@tokenfence/shared/src/agent-runtime/runtimeManager";
import { getBuiltinPlugins } from "@tokenfence/shared/src/plugins/builtin";
import { exportContent } from "@tokenfence/shared/src/plugins/output-generators";
import { writeNote, toMarkdown } from "@tokenfence/shared/src/plugins/obsidian-connector";
import { executeCommand, initTokenfenceDirs, writeFile, fileExists, isTauri } from "../desktop-bridge";
import type { AgentTask, AgentStep, ExecutionLogEntry, PluginManifest } from "@tokenfence/shared/src/agent-runtime/types";
import type { OutputResult } from "@tokenfence/shared/src/plugins/output-generators";

const plugins = getBuiltinPlugins();

export function AgentLabScreen() {
  const [, forceRender] = useState(0);
  useEffect(() => { return onLangChange(() => forceRender((n) => n + 1)); }, []);


  const [tasks, setTasks] = useState<AgentTask[]>(listTasks());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([]);
  const [output, setOutput] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [tauriAvailable, setTauriAvailable] = useState<boolean | null>(null);

  const refresh = useCallback(() => {
    setTasks(listTasks());
    if (selectedTaskId) setLogs(getLogs(selectedTaskId));
  }, [selectedTaskId]);

  const initDirs = useCallback(async () => {
    const inTauri = await isTauri();
    setTauriAvailable(inTauri);
    if (inTauri) {
      await initTokenfenceDirs(".tokenfence");
    }
  }, []);

  useState(() => { initDirs(); });

  const runTask = useCallback(async (pluginId: string, action: string, label: string) => {
    setRunning(true);
    setOutput("");
    const task = createTask(label, "agent-lab", [
      { id: "step-1", order: 1, label: `Run ${label}`, pluginId, action, status: "pending" },
    ]);
    setSelectedTaskId(task.id);
    setTaskStatus(task.id, "running");
    updateStepStatus(task.id, "step-1", "running");

    appendLog({ taskId: task.id, stepId: "step-1", pluginId, level: "info", message: `Starting ${label} (${pluginId})` });

    try {
      const inTauri = await isTauri();
      if (inTauri) {
        // Run in Tauri desktop mode with real command execution
        const safeCmd = `echo TokenFence Agent Lab: ${label}`;
        const result = await executeCommand(safeCmd, [], ".tokenfence", 15000);
        updateStepStatus(task.id, "step-1", "complete", { stdout: result.stdout, exitCode: result.exit_code });
        appendLog({ taskId: task.id, stepId: "step-1", pluginId, level: "info", message: `Executed: exit=${result.exit_code}, duration=${result.duration_ms}ms` });
        setOutput(result.stdout || `Command completed (exit ${result.exit_code}, ${result.duration_ms}ms)`);

        // Also generate output files
        const outDir = ".tokenfence/outputs";
        await initTokenfenceDirs(".tokenfence");

        const md = exportContent(`## ${label}\n\n### Agent Lab Execution Report\n\n- **Plugin**: ${pluginId}\n- **Action**: ${action}\n- **Exit Code**: ${result.exit_code}\n- **Duration**: ${result.duration_ms}ms\n- **Stdout**:\n\`\`\`\n${result.stdout || "(empty)"}\n\`\`\`\n- **Stderr**:\n\`\`\`\n${result.stderr || "(none)"}\n\`\`\``, label, "md");
        await writeFile(`${outDir}/${md.filename}`, md.content);

        const json = exportContent(JSON.stringify({ task: label, pluginId, action, exitCode: result.exit_code, durationMs: result.duration_ms, stdout: result.stdout, stderr: result.stderr }), label, "json");
        await writeFile(`${outDir}/${json.filename}`, json.content);

        const html = exportContent(`<h2>${label}</h2><h3>Agent Lab Execution Report</h3><table><tr><td>Plugin</td><td>${pluginId}</td></tr><tr><td>Action</td><td>${action}</td></tr><tr><td>Exit Code</td><td>${result.exit_code}</td></tr><tr><td>Duration</td><td>${result.duration_ms}ms</td></tr></table><pre>${result.stdout || "(empty)"}</pre>`, label, "html");
        await writeFile(`${outDir}/${html.filename}`, html.content);

        // Write Obsidian note
        const note = writeNote(label, `## Agent Lab\n\nPlugin: ${pluginId}\nAction: ${action}\nExit: ${result.exit_code}\nDuration: ${result.duration_ms}ms\n`, ["agent-lab", "automated"]);
        const vaultPath = ".tokenfence/test-vault";
        await writeFile(`${vaultPath}/${note.path}`, toMarkdown(note));

        appendLog({ taskId: task.id, stepId: "step-1", pluginId, level: "info", message: `Generated output files: ${md.filename}, ${json.filename}, ${html.filename}` });

      } else {
        // Browser/Web mode: generate outputs only
        const md = exportContent(`## ${label}\n\n### Agent Lab Report\n\n- **Plugin**: ${pluginId}\n- **Action**: ${action}\n- **Mode**: Browser (no local execution)\n`, label, "md");
        const json = exportContent(JSON.stringify({ task: label, pluginId, action, mode: "browser" }), label, "json");
        updateStepStatus(task.id, "step-1", "complete", { md, json });
        appendLog({ taskId: task.id, stepId: "step-1", pluginId, level: "info", message: "Generated browser-mode outputs" });
        setOutput(`[Browser mode] Outputs generated: ${md.filename}, ${json.filename}`);
      }

      setTaskStatus(task.id, "complete");
    } catch (e: any) {
      updateStepStatus(task.id, "step-1", "failed", undefined, e.message);
      appendLog({ taskId: task.id, stepId: "step-1", pluginId, level: "error", message: `Failed: ${e.message}` });
      setTaskStatus(task.id, "failed");
      setOutput(`Error: ${e.message}`);
    }

    setRunning(false);
    refresh();
  }, [refresh]);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <div>
      <h1 className={"page-title"}>{tk("agentLab.title")}</h1>
      <p className={"page-subtitle"}>{tk("agentLab.subtitle")}</p>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Tasks</div><div className="stat-value">{tasks.length}</div></div>
        <div className="stat-card"><div className="stat-label">Active</div><div className="stat-value">{tasks.filter((t) => t.status === "running").length}</div></div>
        <div className="stat-card"><div className="stat-label">Complete</div><div className="stat-value">{tasks.filter((t) => t.status === "complete").length}</div></div>
        <div className="stat-card"><div className="stat-label">Tauri</div><div className="stat-value" style={{ fontSize: "0.9rem" }}>{tauriAvailable === null ? "..." : tauriAvailable ? "Connected" : "Browser"}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">Quick Actions</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "8px 0" }}>
          <button className="btn btn-primary" disabled={running} onClick={() => runTask("local.echo", "echo", "Local Echo Test")}>Run Echo Test</button>
          <button className="btn btn-secondary" disabled={running} onClick={() => runTask("obsidian-vault-writer", "write-note", "Obsidian Write Test")}>Obsidian Write Test</button>
          <button className="btn btn-secondary" disabled={running} onClick={() => runTask("markdown-to-pdf", "generate-pdf", "PDF Output Test")}>PDF Output Test</button>
          <button className="btn btn-secondary" disabled={running} onClick={() => runTask("markdown-to-docx", "generate-docx", "DOCX Output Test")}>DOCX Output Test</button>
        </div>
        {output && (
          <div style={{ marginTop: 12, padding: 12, background: "var(--bg-secondary)", borderRadius: 8, fontFamily: "monospace", fontSize: "0.85rem", whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
            {output}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Available Plugins</div><span className="badge badge-green">{plugins.length} built-in</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {plugins.map((p) => (
            <div key={p.id} className="card" style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <strong>{p.name}</strong>
                <span className={`badge ${p.riskLevel === "high" ? "badge-red" : p.riskLevel === "medium" ? "badge-amber" : "badge-green"}`}>{p.riskLevel}</span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 8 }}>{p.description}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                Runtime: {p.runtime} | Category: {p.category} | Approval: {p.requiresApproval ? "Required" : "Auto"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><div className="card-title">Task History</div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tasks.slice(0, 20).map((t) => (
              <div key={t.id} className="card" style={{ padding: 10, cursor: "pointer", borderLeft: `4px solid ${t.status === "complete" ? "var(--green)" : t.status === "failed" ? "var(--red)" : t.status === "running" ? "var(--blue)" : "var(--border)"}` }} onClick={() => { setSelectedTaskId(t.id); setLogs(getLogs(t.id)); }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{t.label}</strong>
                  <span className={`badge ${t.status === "complete" ? "badge-green" : t.status === "failed" ? "badge-red" : t.status === "running" ? "badge-blue" : "badge-gray"}`}>{t.status}</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{t.id} — {new Date(t.createdAt).toLocaleString()}</div>
                {t.id === selectedTaskId && logs.length > 0 && (
                  <div style={{ marginTop: 8, padding: 8, background: "var(--bg-secondary)", borderRadius: 6, fontFamily: "monospace", fontSize: "0.8rem", maxHeight: 150, overflow: "auto" }}>
                    {logs.map((l, i) => (
                      <div key={i} style={{ color: l.level === "error" ? "var(--red)" : l.level === "warn" ? "var(--amber)" : "var(--text-primary)" }}>
                        [{l.level}] {l.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


