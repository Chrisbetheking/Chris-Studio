/* Third-party API Connector Builder */

export interface ApiToolDefinition {
  id: string;
  name: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  authType: "none" | "bearer" | "api-key" | "basic";
  authKey?: string;
  authValue?: string;
}

export interface ApiCallResult {
  success: boolean;
  status?: number;
  data?: unknown;
  error?: string;
  durationMs: number;
}

const toolDefs = new Map<string, ApiToolDefinition>();

export function registerApiTool(tool: ApiToolDefinition): void {
  toolDefs.set(tool.id, tool);
}

export function getApiTool(id: string): ApiToolDefinition | undefined {
  return toolDefs.get(id);
}

export function listApiTools(): ApiToolDefinition[] {
  return Array.from(toolDefs.values());
}

export function removeApiTool(id: string): boolean {
  return toolDefs.delete(id);
}

export async function executeApiCall(toolId: string, bodyParams?: Record<string, unknown>): Promise<ApiCallResult> {
  const tool = toolDefs.get(toolId);
  if (!tool) return { success: false, error: `Tool ${toolId} not found`, durationMs: 0 };

  const start = performance.now();
  try {
    const headers: Record<string, string> = { ...tool.headers, "Content-Type": "application/json" };
    if (tool.authType === "bearer" && tool.authValue) {
      headers["Authorization"] = `Bearer ${tool.authValue}`;
    } else if (tool.authType === "api-key" && tool.authValue) {
      headers[tool.authKey || "X-API-Key"] = tool.authValue;
    }

    const response = await fetch(tool.url, {
      method: tool.method,
      headers,
      body: tool.method !== "GET" && bodyParams ? JSON.stringify(bodyParams) : undefined,
    });
    const data = await response.json();
    return { success: response.ok, status: response.status, data, durationMs: performance.now() - start };
  } catch (e: any) {
    return { success: false, error: e.message, durationMs: performance.now() - start };
  }
}