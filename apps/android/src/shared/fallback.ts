import type { ProviderModel, FallbackChain, FallbackStep, TaskType, RiskLevel } from './types';
import { PROVIDERS } from './providers';

const CLOUD_FALLBACK_ORDER = ['OpenAI', 'Claude', 'Gemini', 'DeepSeek', 'Qwen'];
const CHINA_LOCAL_ORDER = ['DeepSeek', 'Qwen', 'Doubao', 'Kimi'];
const LOCAL_ONLY = ['Ollama', 'LM Studio'];

export function getDefaultFallbackChain(
  primaryProvider: string,
  riskLevel: RiskLevel = 'safe'
): FallbackChain {
  if (riskLevel === 'high') {
    return {
      id: 'fallback-high-risk',
      label: 'High Risk Fallback (Local First)',
      steps: LOCAL_ONLY.filter((p) => p !== primaryProvider).map((provider, i) => ({
        order: i + 1,
        provider,
        model: findModel(provider)?.model || 'local-model',
        reason: 'High risk: prefer local inference',
      })),
    };
  }

  const isChinaProvider = CHINA_LOCAL_ORDER.includes(primaryProvider);
  const order = isChinaProvider
    ? [...CHINA_LOCAL_ORDER, ...CLOUD_FALLBACK_ORDER.filter((p) => !CHINA_LOCAL_ORDER.includes(p))]
    : [...CLOUD_FALLBACK_ORDER];

  const steps: FallbackStep[] = order
    .filter((p) => p !== primaryProvider)
    .map((provider, i) => ({
      order: i + 1,
      provider,
      model: findModel(provider)?.model || 'default',
      reason: provider === 'Ollama' || provider === 'LM Studio'
        ? 'Fallback to local for reliability'
        : 'Cloud fallback #' + (i + 1),
    }));

  return {
    id: 'fallback-' + primaryProvider.toLowerCase(),
    label: primaryProvider + ' Fallback Chain',
    steps,
  };
}

export function recommendFallbackProviders(
  primaryProvider: string,
  taskType?: TaskType,
  riskLevel?: RiskLevel,
  preferLocal?: boolean
): ProviderModel[] {
  if (preferLocal || riskLevel === 'high') {
    return LOCAL_ONLY.map((p) => findModel(p)).filter(Boolean) as ProviderModel[];
  }

  const isChina = CHINA_LOCAL_ORDER.includes(primaryProvider);
  const order = isChina ? CHINA_LOCAL_ORDER : CLOUD_FALLBACK_ORDER;

  return order
    .filter((p) => p !== primaryProvider)
    .slice(0, 3)
    .map((p) => findModel(p))
    .filter(Boolean) as ProviderModel[];
}

function findModel(providerName: string): ProviderModel | undefined {
  return PROVIDERS.find((p) => p.provider === providerName);
}
