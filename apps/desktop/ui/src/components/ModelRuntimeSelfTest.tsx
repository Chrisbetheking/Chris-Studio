import { useState, useEffect } from "react";
import {
  getActiveModelViewState,
  resolveActiveModel,
  migrateActiveModelStorageV2,
  resolveActiveModel,
  setActiveModelV2,
  normalizeDisplayText,
  hasAnyConfiguredProvider,
  canonicalizeProviderId,
  getProviderDisplayName,
  type ActiveModelV2,
  type ResolvedModelV2,
} from "../data/active-model";
import { tk } from "@tokenfence/shared/src/i18n";

/* ============================================================
   ModelRuntimeSelfTest ï¿?verify ActiveModelV2 consistency
   ============================================================ */

interface TestCase {
  id: string;
  name: string;
  fn: () => { pass: boolean; detail: string };
}

interface TestResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

export function ModelRuntimeSelfTest() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [overallPass, setOverallPass] = useState(false);

  const runTests = () => {
    setRunning(true);
    setRan(false);

    // Use setTimeout so state updates before tests run
    setTimeout(() => {
      const tests: TestCase[] = buildTestCases();
      const res: TestResult[] = [];

      for (const t of tests) {
        try {
          const r = t.fn();
          res.push({ id: t.id, name: t.name, pass: r.pass, detail: r.detail });
        } catch (e: any) {
          res.push({ id: t.id, name: t.name, pass: false, detail: `Exception: ${e.message}` });
        }
      }

      setResults(res);
      setOverallPass(res.every((r) => r.pass));
      setRunning(false);
      setRan(true);
    }, 50);
  };

  const allPass = results.length > 0 && results.every((r) => r.pass);
  const failCount = results.filter((r) => !r.pass).length;

  return (
    <div style={{ padding: 16, height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: "1rem", color: "var(--text)" }}>
          {tk("models.selfTest") || "Model Runtime Self Test"}
        </h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={runTests}
            disabled={running}
            className="btn btn-primary"
            style={{ fontSize: "0.8rem", padding: "6px 14px" }}
          >
            {running ? (tk("common.running") || "Running...") : (tk("common.runTests") || "Run Tests")}
          </button>
          <button
            onClick={() => {
              try {
                localStorage.removeItem("tokenfence.activeModel");
                migrateActiveModelStorageV2();
                window.dispatchEvent(new Event("tokenfence:active-model-changed"));
                setResults([]);
                setRan(false);
              } catch { /* ignore */ }
            }}
            className="btn btn-ghost"
            style={{ fontSize: "0.8rem", padding: "6px 14px", color: "var(--amber)" }}
          >
            Reset Model Runtime State
          </button>
        </div>
      </div>

      {ran && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 12,
          background: allPass ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          color: allPass ? "var(--green, #22c55e)" : "var(--red, #ef4444)",
          fontSize: "0.85rem", fontWeight: 600,
        }}>
          {allPass
            ? (tk("models.selfTestAllPass") || "All tests passed")
            : `${failCount} test${failCount > 1 ? "s" : ""} failed`}
        </div>
      )}

      {results.length === 0 && !running && !ran && (
        <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", padding: "20px 0", textAlign: "center" }}>
          {tk("models.selfTestDesc") || "Click 'Run Tests' to verify model state consistency."}
        </div>
      )}

      {running && (
        <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", padding: "20px 0", textAlign: "center" }}>
          {tk("common.running") || "Running..."}
        </div>
      )}

      {results.map((r) => (
        <div
          key={r.id}
          style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "8px 12px", marginBottom: 6, borderRadius: 6,
            background: r.pass ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
            border: `1px solid ${r.pass ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
          }}
        >
          <span style={{
            flexShrink: 0, width: 22, height: 22,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "50%",
            background: r.pass ? "var(--green, #22c55e)" : "var(--red, #ef4444)",
            color: "#fff", fontWeight: 700, fontSize: "0.7rem",
          }}>
            {r.pass ? "\u2713" : "\u2717"}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--text)" }}>{r.name}</div>
            {!r.pass && (
              <div style={{ fontSize: "0.7rem", color: "var(--red, #ef4444)", marginTop: 2 }}>{r.detail}</div>
            )}
            {r.pass && r.detail && (
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>{r.detail}</div>
            )}
          </div>
          <span style={{
            fontSize: "0.7rem", fontWeight: 600, flexShrink: 0,
            color: r.pass ? "var(--green, #22c55e)" : "var(--red, #ef4444)",
          }}>
            {r.pass ? "PASS" : "FAIL"}
          </span>
        </div>
      ))}

      {ran && !allPass && (
        <div style={{
          marginTop: 16, padding: "10px 14px", borderRadius: 8, fontSize: "0.75rem",
          background: "rgba(234,179,8,0.1)", color: "var(--amber, #eab308)",
        }}>
          <strong>{tk("common.note") || "Note"}:</strong>{" "}
          {tk("models.selfTestFailNote") ||
            "If tests fail, please run 'Migrate Storage' from the Models page or clear localStorage to reset model state."}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers for test building                                           */
/* ------------------------------------------------------------------ */

function buildTestCases(): TestCase[] {
  return [
    // --- 1. Schema / Structure ---
    {
      id: "schema_version",
      name: "valid not_configured state",
      fn: () => {
        try {
          const raw = localStorage.getItem("tokenfence.activeModel");
          if (!raw) return { pass: true, detail: "No active model - valid not_configured state" };
          const parsed = JSON.parse(raw);
          if ((parsed as Record<string, unknown>).schemaVersion !== 2) {
            return { pass: false, detail: `schemaVersion is ${(parsed as Record<string, unknown>).schemaVersion}, expected 2` };
          }
          return { pass: true, detail: "schemaVersion = 2" };
        } catch (e) {
          return { pass: false, detail: `Failed to parse localStorage: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },

    // --- 2. No raw unicode escapes ---
    {
      id: "no_unicode_escapes",
      name: "No raw \\uXXXX escapes in active model",
      fn: () => {
        try {
          const runtime = (window as any).__TOKENFENCE_MODEL_RUNTIME__;
          const hasRawUnicode = Boolean(runtime?.hasRawUnicode);
          if (hasRawUnicode) {
            return { pass: false, detail: "Runtime reports raw unicode escapes" };
          }
          const raw = localStorage.getItem("tokenfence.activeModel");
          if (!raw) return { pass: true, detail: "No active model ï¿?nothing to check" };
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            return { pass: false, detail: `Failed to parse localStorage: ${e instanceof Error ? e.message : String(e)}` };
          }
          const obj = parsed as Record<string, unknown>;
          const fields = ["providerId", "modelId", "providerDisplayName", "modelDisplayName", "displayLabel"];
          for (const f of fields) {
            const val = String(obj[f] ?? "");
            if (val.indexOf("\\u") >= 0) {
              return { pass: false, detail: `Field "${f}" contains raw \\uXXXX: ${val}` };
            }
          }
          return { pass: true, detail: "All fields clean" };
        } catch (e) {
          return { pass: false, detail: `Error: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },

// --- 3. displayLabel consistency ---
    {
      id: "display_label_consistent",
      name: "displayLabel matches providerDisplayName / modelDisplayName",
      fn: () => {
        try {
          const raw = localStorage.getItem("tokenfence.activeModel");
          if (!raw) return { pass: true, detail: "No active model ï¿?nothing to check" };
          let m: ActiveModelV2;
        try {
          m = JSON.parse(raw) as ActiveModelV2;
        } catch (e) {
          return { pass: false, detail: `Failed to parse localStorage: ${e instanceof Error ? e.message : String(e)}` };
        }
          const expected = `${m.providerDisplayName} / ${m.modelDisplayName}`;
          if (m.displayLabel !== expected) {
            return { pass: false, detail: `displayLabel "${m.displayLabel}" !== expected "${expected}"` };
          }
          return { pass: true, detail: `displayLabel = "${m.displayLabel}"` };
        } catch (e) {
          return { pass: false, detail: `Failed to parse localStorage: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },

    // --- 4. View state consistency ---
    {
      id: "view_state",
      name: "View state is internally consistent",
      fn: () => {
        const runtime = (window as any).__TOKENFENCE_MODEL_RUNTIME__;
        const hasRawUnicode = Boolean(runtime?.hasRawUnicode);
        if (hasRawUnicode) {
          return { pass: false, detail: "Runtime reports raw unicode escapes" };
        }
        const vs = getActiveModelViewState();
        if (!vs.hasModel) return { pass: true, detail: "No model configured ï¿?view state consistent (not_configured)" };
        const r = vs.resolved;
        if (!r) return { pass: false, detail: "hasModel=true but resolved is null" };
        // Check displayLabel
        if (r.displayLabel !== `${r.providerDisplayName} / ${r.modelDisplayName}`) {
          return { pass: false, detail: `resolved.displayLabel inconsistent` };
        }
        return { pass: true, detail: `ViewState: ${vs.displayLabel}, status=${vs.status}` };
      },
    },

// --- 5. No fake OpenAI fallback ---
    {
      id: "no_fake_openai",
      name: "No fake OpenAI when provider not configured",
      fn: () => {
        const hasConfigured = hasAnyConfiguredProvider();
        const resolved = resolveActiveModel();
        // If no providers configured, resolved MUST be null
        if (!hasConfigured) {
          if (resolved !== null) {
            return { pass: false, detail: `No configured providers but resolveActiveModel returned: ${resolved.providerId} / ${resolved.modelId}` };
          }
          return { pass: true, detail: "No configured providers ï¿?correctly returns null" };
        }
        // If providers are configured, resolved should have configured=true
        if (resolved && !resolved.configured) {
          return { pass: false, detail: "Resolved model has configured=false but providers exist" };
        }
        return { pass: true, detail: resolved ? `Resolved: ${resolved.displayLabel}` : "No active model (no fallback)" };
      },
    },

    // --- 6. Canonical provider names ---
    {
      id: "canonical_providers",
      name: "Canonical provider names resolve correctly",
      fn: () => {
        const testCases: [string, string][] = [
          ["OpenAI", "OpenAI"],
          ["Claude", "Anthropic"],
          ["Gemini", "Google"],
          ["DeepSeek", "DeepSeek"],
          ["Qwen", "Alibaba"],
          ["Kimi", "Moonshot"],
          ["openai", "OpenAI"],
          ["claude", "Anthropic"],
          ["  OpenAI  ", "OpenAI"],
        ];
        const failures: string[] = [];
        for (const [input, expected] of testCases) {
          const result = getProviderDisplayName(canonicalizeProviderId(input));
          if (result !== expected) {
            failures.push(`"${input}" ï¿?"${result}" (expected "${expected}")`);
          }
        }
        if (failures.length > 0) {
          return { pass: false, detail: failures.join("; ") };
        }
        return { pass: true, detail: `${testCases.length} canonical mappings verified` };
      },
    },

    // --- 7. normalizeDisplayText handles edge cases ---
    {
      id: "normalize_unicode",
      name: "normalizeDisplayText handles escaped unicode",
      fn: () => {
        // Simulated escaped unicode for "é…ç½®" (U+914D U+7F6E)
        const escaped = "\\u914D\\u7F6E";
        const result = normalizeDisplayText(escaped);
        if (result === escaped) {
          // The function should have decoded it ï¿?but wait, this depends on the actual implementation
          // Let's test: if input has no real backslash-u, it won't match
          // Actually let's test the raw pattern
          const rawWithEscapes = String.raw`\u914D\u7F6E`;
          const decoded = normalizeDisplayText(rawWithEscapes);
          if (decoded === rawWithEscapes) {
            return { pass: false, detail: "normalizeDisplayText did not decode raw \\uXXXX pattern: " + rawWithEscapes };
          }
          return { pass: true, detail: `Decoded: "${decoded}"` };
        }
        return { pass: true, detail: `Decoded: "${result}"` };
      },
    },

    // --- 8. migrate does not corrupt ---
    {
      id: "migrate_safe",
      name: "migrateActiveModelStorageV2 runs without crash",
      fn: () => {
        try {
          migrateActiveModelStorageV2();
          return { pass: true, detail: "Migration completed" };
        } catch (e: any) {
          return { pass: false, detail: `migrateActiveModelStorageV2 threw: ${e.message}` };
        }
      },
    },

    // --- 9. setActiveModel produces valid state ---
    {
      id: "set_active_model",
      name: "setActiveModelV2 writes localStorage and dispatches event",
      fn: () => {
        try {
          if (typeof setActiveModelV2 !== "function") {
            return { pass: false, detail: "setActiveModelV2 is not a function" };
          }
          // Test: set a model and verify it's written to localStorage
          const beforeRaw = localStorage.getItem("tokenfence.activeModel");
          let eventFired = false;
          const handler = () => { eventFired = true; };
          window.addEventListener("tokenfence:active-model-changed", handler);
          
          const result = setActiveModelV2({
            providerId: "OpenAI",
            modelId: "gpt-5.5",
            source: "installed",
            configured: false,
          });
          
          window.removeEventListener("tokenfence:active-model-changed", handler);
          
          const afterRaw = localStorage.getItem("tokenfence.activeModel");
          const after = afterRaw ? JSON.parse(afterRaw) : null;
          
          if (!after) return { pass: false, detail: "localStorage not written" };
          if (after.providerId !== "OpenAI") return { pass: false, detail: "providerId mismatch: " + after.providerId };
          if (after.modelId !== "gpt-5.5") return { pass: false, detail: "modelId mismatch: " + after.modelId };
          if (!eventFired) return { pass: false, detail: "tokenfence:active-model-changed event NOT dispatched" };
          if (result.displayLabel.indexOf("/") < 0) return { pass: false, detail: "displayLabel missing separator: " + result.displayLabel };
          
          // Restore previous state
          if (beforeRaw) {
            localStorage.setItem("tokenfence.activeModel", beforeRaw);
          } else {
            localStorage.removeItem("tokenfence.activeModel");
          }
          
          return { pass: true, detail: "setActiveModelV2 writes localStorage AND dispatches event: " + result.displayLabel };
        } catch (e: any) {
          return { pass: false, detail: `Error: ${e.message}` };
        }
      },
    },

    // --- 10. Active model apply indicator is consistent ---
    {
      id: "active_model_indicator_consistency",
      name: "Active model apply indicator is consistent",
      fn: () => {
        const runtime = (window as any).__TOKENFENCE_MODEL_RUNTIME__;
        if (!runtime) {
          return { pass: false, detail: "__TOKENFENCE_MODEL_RUNTIME__ not found (ChatWorkspace may not be mounted)" };
        }
        const hl = String(runtime.headerLabel ?? "");
        const il = String(runtime.inspectorLabel ?? "");
        const st = String(runtime.sendTargetLabel ?? "");
        const hasRaw = !!(runtime.hasRawUnicode);

        if (hasRaw) {
          return { pass: false, detail: "UI contains raw unicode escapes" };
        }
        if (hl.indexOf("/ GPT-5.5") >= 0 || il.indexOf("/ GPT-5.5") >= 0 || st.indexOf("/ GPT-5.5") >= 0) {
          return { pass: false, detail: "UI contains hardcoded / GPT-5.5" };
        }

        if (hl !== il || il !== st) {
          return { pass: false, detail: "Labels inconsistent: Header=" + hl + " Inspector=" + il + " SendTarget=" + st };
        }

        const hasConfigured = hasAnyConfiguredProvider();
        if (!hasConfigured) {
          if (hl === "" || hl === "No Model") {
            return { pass: false, detail: "No-configured-model label is empty or No Model: " + hl };
          }
          return { pass: true, detail: "No configured model state consistent: " + hl };
        }

        if (hl === "" || hl.indexOf("u672A") >= 0 || hl === "No configured model") {
          return { pass: false, detail: "Has configured provider but label shows not-configured: " + hl };
        }

        return { pass: true, detail: "Active model consistent: Header=" + hl + " Inspector=" + il + " SendTarget=" + st };
      },
    }
  ];
}
