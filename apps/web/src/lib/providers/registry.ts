import type { ProviderSpec } from "../types";

export const providerRegistry: ProviderSpec[] = [
  {
    id: "openai",
    label: "OpenAI",
    group: "global",
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o4-mini"],
    defaultModel: "gpt-4.1-mini",
    needsKey: true,
    keyEnv: "OPENAI_API_KEY"
  },
  {
    id: "anthropic",
    label: "Anthropic / Claude",
    group: "global",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    models: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"],
    defaultModel: "claude-3-5-sonnet-latest",
    needsKey: true,
    keyEnv: "ANTHROPIC_API_KEY"
  },
  {
    id: "gemini",
    label: "Google Gemini",
    group: "global",
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    defaultModel: "gemini-2.5-flash",
    needsKey: true,
    keyEnv: "GEMINI_API_KEY"
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    group: "china",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    models: ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash", "deepseek-v4-pro"],
    defaultModel: "deepseek-chat",
    needsKey: true,
    keyEnv: "DEEPSEEK_API_KEY"
  },
  {
    id: "volcengine",
    label: "Volcengine Ark / Doubao",
    group: "china",
    kind: "openai-compatible",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: ["doubao-seed-1-6", "doubao-seed-1-6-flash", "doubao-1-5-pro-32k", "doubao-1-5-lite-32k"],
    defaultModel: "doubao-seed-1-6-flash",
    needsKey: true,
    keyEnv: "VOLCENGINE_API_KEY",
    note: "OpenAI-compatible Ark endpoint. Some accounts use custom endpoint/model IDs."
  },
  {
    id: "qwen",
    label: "Qwen / Alibaba Cloud Bailian",
    group: "china",
    kind: "openai-compatible",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-coder-plus", "qwen-long"],
    defaultModel: "qwen-plus",
    needsKey: true,
    keyEnv: "DASHSCOPE_API_KEY"
  },
  {
    id: "qianfan",
    label: "Baidu Qianfan",
    group: "china",
    kind: "openai-compatible",
    baseUrl: "https://qianfan.baidubce.com/v2",
    models: ["ernie-4.0-turbo-8k", "ernie-4.0-8k", "ernie-speed-8k", "ernie-lite-8k"],
    defaultModel: "ernie-speed-8k",
    needsKey: true,
    keyEnv: "QIANFAN_API_KEY",
    note: "If your Qianfan account uses a different OpenAI-compatible endpoint, override the base URL in provider settings."
  },
  {
    id: "kimi",
    label: "Kimi / Moonshot",
    group: "china",
    kind: "openai-compatible",
    baseUrl: "https://api.moonshot.ai/v1",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2-0711-preview"],
    defaultModel: "moonshot-v1-32k",
    needsKey: true,
    keyEnv: "MOONSHOT_API_KEY"
  },
  {
    id: "zhipu",
    label: "Zhipu GLM",
    group: "china",
    kind: "openai-compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-plus", "glm-4-air", "glm-4-flash", "glm-4.5", "glm-4.5-air"],
    defaultModel: "glm-4-flash",
    needsKey: true,
    keyEnv: "ZHIPU_API_KEY"
  },
  {
    id: "minimax",
    label: "MiniMax",
    group: "china",
    kind: "openai-compatible",
    baseUrl: "https://api.minimax.chat/v1",
    models: ["MiniMax-M1", "abab6.5s-chat", "abab6.5g-chat", "abab6.5-chat"],
    defaultModel: "MiniMax-M1",
    needsKey: true,
    keyEnv: "MINIMAX_API_KEY",
    note: "OpenAI-compatible preset. Adjust the model name if your account exposes different IDs."
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    group: "china",
    kind: "openai-compatible",
    baseUrl: "https://api.siliconflow.cn/v1",
    models: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1", "Qwen/Qwen2.5-72B-Instruct", "Qwen/Qwen2.5-Coder-32B-Instruct"],
    defaultModel: "deepseek-ai/DeepSeek-V3",
    needsKey: true,
    keyEnv: "SILICONFLOW_API_KEY"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    group: "router",
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["openai/gpt-4.1-mini", "anthropic/claude-3.5-sonnet", "google/gemini-2.5-flash", "deepseek/deepseek-chat", "qwen/qwen3-coder"],
    defaultModel: "openai/gpt-4.1-mini",
    needsKey: true,
    keyEnv: "OPENROUTER_API_KEY"
  },
  {
    id: "groq",
    label: "Groq",
    group: "global",
    kind: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    defaultModel: "llama-3.3-70b-versatile",
    needsKey: true,
    keyEnv: "GROQ_API_KEY"
  },
  {
    id: "together",
    label: "Together AI",
    group: "global",
    kind: "openai-compatible",
    baseUrl: "https://api.together.xyz/v1",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3"],
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    needsKey: true,
    keyEnv: "TOGETHER_API_KEY"
  },
  {
    id: "302ai",
    label: "302.AI",
    group: "router",
    kind: "openai-compatible",
    baseUrl: "https://api.302.ai/v1",
    models: ["gpt-4o-mini", "claude-3-5-sonnet-latest", "gemini-2.5-flash", "deepseek-chat"],
    defaultModel: "gpt-4o-mini",
    needsKey: true,
    keyEnv: "THREE_ZERO_TWO_API_KEY",
    note: "Router preset. Model names depend on your 302.AI account configuration."
  },
  {
    id: "modelscope",
    label: "ModelScope",
    group: "china",
    kind: "openai-compatible",
    baseUrl: "https://api-inference.modelscope.cn/v1",
    models: ["Qwen/Qwen2.5-72B-Instruct", "Qwen/Qwen2.5-Coder-32B-Instruct", "deepseek-ai/DeepSeek-V3"],
    defaultModel: "Qwen/Qwen2.5-72B-Instruct",
    needsKey: true,
    keyEnv: "MODELSCOPE_API_KEY"
  },
  {
    id: "ollama",
    label: "Ollama",
    group: "local",
    kind: "ollama",
    baseUrl: "http://localhost:11434",
    models: ["llama3.1", "qwen2.5-coder", "mistral", "gemma2"],
    defaultModel: "llama3.1",
    needsKey: false,
    note: "Start Ollama locally before testing."
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    group: "local",
    kind: "openai-compatible",
    baseUrl: "http://localhost:1234/v1",
    models: ["local-model"],
    defaultModel: "local-model",
    needsKey: false,
    note: "Start the LM Studio local server first."
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    group: "custom",
    kind: "openai-compatible",
    baseUrl: "http://localhost:8000/v1",
    models: ["custom-model"],
    defaultModel: "custom-model",
    needsKey: false,
    advanced: true
  }
];

export function findProvider(id: string) {
  return providerRegistry.find((provider) => provider.id === id);
}
