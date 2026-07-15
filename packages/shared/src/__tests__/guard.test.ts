/**
 * TokenFence Studio ? Safety Scanner Tests
 * 
 * Run: npx vitest run
 * or:  npm --workspace packages/shared test
 */

import { describe, it, expect } from "vitest";
import { scanPrompt } from "../guard";

describe("scanPrompt", () => {
  it("detects API keys", () => {
    const result = scanPrompt("My key is sk-abc123def456ghi789jkl012mno345pqr678stu");
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some(f => f.type === "api_key")).toBe(true);
    expect(result.riskLevel).toBe("high");
  });

  it("detects tokens", () => {
    const result = scanPrompt("Use token ghp_abcdefghijklmnopqrstuvwxyz123456");
    expect(result.findings.some(f => f.type === "token")).toBe(true);
    expect(result.riskLevel).toBe("high");
  });

  it("detects database URLs", () => {
    const result = scanPrompt("Connect to postgres://user:pass@host:5432/db");
    expect(result.findings.some(f => f.type === "database_url")).toBe(true);
    expect(result.riskLevel).toBe("high");
  });

  it("detects emails", () => {
    const result = scanPrompt("Contact me at john.doe@example.com");
    expect(result.findings.some(f => f.type === "email")).toBe(true);
    expect(result.riskLevel).toBe("low");
  });

  it("detects phone numbers", () => {
    const result = scanPrompt("Call me at +1-555-123-4567");
    expect(result.findings.some(f => f.type === "phone")).toBe(true);
  });

  it("detects Chinese IDs", () => {
    const result = scanPrompt("ID: 110101199001011234");
    expect(result.findings.some(f => f.type === "chinese_id")).toBe(true);
  });

  it("detects secret assignments", () => {
    const result = scanPrompt('password = "superSecret123"');
    expect(result.findings.some(f => f.type === "secret_assignment")).toBe(true);
  });

  it("detects credential-like text", () => {
    const result = scanPrompt("access_key=AKIAIOSFODNN7EXAMPLE");
    expect(result.findings.some(f => f.type === "credential_like")).toBe(true);
  });

  it("classifies clean text as safe", () => {
    const result = scanPrompt("Hello, how are you today?");
    expect(result.findings.length).toBe(0);
    expect(result.riskLevel).toBe("safe");
  });

  it("redacts API keys properly", () => {
    const result = scanPrompt("My key is sk-abc123def456ghi789jkl012mno345pqr678stu");
    expect(result.redacted).not.toContain("sk-abc123def456ghi789jkl012mno345pqr678stu");
    expect(result.redacted).toContain("***");
  });

  it("redacts emails properly", () => {
    const result = scanPrompt("Email: john.doe@example.com");
    expect(result.redacted).not.toContain("john.doe@example.com");
    expect(result.redacted).toContain("***@example.com");
  });

  it("redacts database URLs", () => {
    const result = scanPrompt("postgres://user:pass@host:5432/db");
    expect(result.redacted).not.toContain("user:pass");
    expect(result.redacted).toContain("***");
  });

  it("handles empty input", () => {
    const result = scanPrompt("");
    expect(result.findings.length).toBe(0);
    expect(result.riskLevel).toBe("safe");
  });

  it("handles multiple findings in one text", () => {
    const result = scanPrompt("Key: sk-test1234567890abcdef Email: test@example.com Phone: 555-123-4567");
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    expect(result.riskLevel).toBe("medium"); // api_key + others >= 3 should bump to medium, or api_key alone = high
    // Actually api_key makes it high regardless
    expect(result.riskLevel).toBe("high");
  });

  it("medium risk with 3+ non-critical findings", () => {
    const result = scanPrompt("Email: a@b.com Phone: 555-123-4567 ID: 110101199001011234");
    expect(result.findings.length).toBeGreaterThanOrEqual(3);
    expect(result.riskLevel).toBe("medium");
  });

  it("preserves original text", () => {
    const text = "Hello world";
    const result = scanPrompt(text);
    expect(result.original).toBe(text);
  });

  it("generates timestamp", () => {
    const result = scanPrompt("test");
    expect(result.timestamp).toBeGreaterThan(0);
    expect(result.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it("does not flag normal code", () => {
    const result = scanPrompt("function hello() { return 42; }");
    expect(result.riskLevel).toBe("safe");
  });

  it("does not flag normal conversation", () => {
    const result = scanPrompt("Can you help me write a Python script?");
    expect(result.riskLevel).toBe("safe");
  });
});
