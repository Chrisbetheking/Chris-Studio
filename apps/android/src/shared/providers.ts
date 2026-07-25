import type { ProviderModel } from './types';

export const PROVIDERS: ProviderModel[] = [
  { provider: 'OpenAI', model: 'gpt-4o', deployment: 'cloud', bestFor: 'General purpose, coding, reasoning', riskPolicy: 'Standard cloud policy' },
  { provider: 'Claude', model: 'claude-sonnet-4-20250514', deployment: 'cloud', bestFor: 'Long documents, nuanced analysis', riskPolicy: 'Standard cloud policy' },
  { provider: 'Gemini', model: 'gemini-2.5-pro', deployment: 'cloud', bestFor: 'Multimodal, large context', riskPolicy: 'Standard cloud policy' },
  { provider: 'DeepSeek', model: 'deepseek-chat', deployment: 'cloud', bestFor: 'Cost-efficient reasoning', riskPolicy: 'Cloud, hosted in China' },
  { provider: 'Qwen', model: 'qwen-max', deployment: 'cloud', bestFor: 'Chinese language, multilingual', riskPolicy: 'Cloud, hosted in China' },
  { provider: 'Doubao', model: 'doubao-pro-256k', deployment: 'cloud', bestFor: 'Chinese contexts, long text', riskPolicy: 'Cloud, hosted in China' },
  { provider: 'Kimi', model: 'kimi-latest', deployment: 'cloud', bestFor: 'Chinese web search, analysis', riskPolicy: 'Cloud, hosted in China' },
  { provider: 'Ollama', model: 'llama3.2', deployment: 'local', bestFor: 'Fully offline, privacy-first', riskPolicy: 'Local only, no data leaves device' },
  { provider: 'LM Studio', model: 'local-model', deployment: 'local', bestFor: 'Local inference, zero telemetry', riskPolicy: 'Local only, no data leaves device' },
  { provider: 'Custom', model: 'custom', deployment: 'cloud', bestFor: 'OpenAI-compatible endpoints', riskPolicy: 'Depends on endpoint configuration' },
];

export function recommendModel(riskLevel: string): ProviderModel[] {
  if (riskLevel === 'high') {
    return PROVIDERS.filter((p) => p.deployment === 'local');
  }
  return PROVIDERS;
}
