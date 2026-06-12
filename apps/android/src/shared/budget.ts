import type { ProviderModel, BudgetEstimate, BudgetRoute } from './types';
import { PROVIDERS } from './providers';

const COST_TIERS: Record<string, { tier: number; estCostPer1k: number; estLatencyMs: number }> = {
  'gpt-4o': { tier: 2, estCostPer1k: 0.015, estLatencyMs: 800 },
  'claude-sonnet-4-20250514': { tier: 2, estCostPer1k: 0.015, estLatencyMs: 1200 },
  'gemini-2.5-pro': { tier: 2, estCostPer1k: 0.0125, estLatencyMs: 600 },
  'deepseek-chat': { tier: 1, estCostPer1k: 0.0014, estLatencyMs: 1500 },
  'qwen-max': { tier: 1, estCostPer1k: 0.005, estLatencyMs: 1000 },
  'doubao-pro-256k': { tier: 1, estCostPer1k: 0.001, estLatencyMs: 1200 },
  'kimi-latest': { tier: 1, estCostPer1k: 0.001, estLatencyMs: 1000 },
  'llama3.2': { tier: 0, estCostPer1k: 0, estLatencyMs: 500 },
  'local-model': { tier: 0, estCostPer1k: 0, estLatencyMs: 400 },
  'custom': { tier: 2, estCostPer1k: 0.01, estLatencyMs: 800 },
};

const DEFAULT_TIER = { tier: 2, estCostPer1k: 0.01, estLatencyMs: 1000 };

export function estimateCost(
  provider: ProviderModel,
  estimatedTokens: number
): BudgetEstimate {
  const info = COST_TIERS[provider.model] || DEFAULT_TIER;
  const costTokens = estimatedTokens / 1000;
  return {
    provider: provider.provider,
    model: provider.model,
    estimatedTokens,
    estimatedCost: Math.round(costTokens * info.estCostPer1k * 100000) / 100000,
    estimatedLatencyMs: info.estLatencyMs,
    tier: info.tier,
  };
}

export function recommendBudgetRoute(
  providers: ProviderModel[],
  estimatedTokens: number,
  budgetPriority: 'cost' | 'speed' | 'balanced' = 'balanced'
): BudgetRoute {
  const estimates = providers.map((p) => estimateCost(p, estimatedTokens));

  if (budgetPriority === 'cost') {
    estimates.sort((a, b) => a.estimatedCost - b.estimatedCost || a.estimatedLatencyMs - b.estimatedLatencyMs);
  } else if (budgetPriority === 'speed') {
    estimates.sort((a, b) => a.estimatedLatencyMs - b.estimatedLatencyMs || a.estimatedCost - b.estimatedCost);
  } else {
    estimates.sort((a, b) => {
      const scoreA = a.estimatedCost * 0.5 + (a.estimatedLatencyMs / 1000) * 0.5;
      const scoreB = b.estimatedCost * 0.5 + (b.estimatedLatencyMs / 1000) * 0.5;
      return scoreA - scoreB;
    });
  }

  return {
    priority: budgetPriority,
    estimates,
    recommended: estimates[0],
    alternates: estimates.slice(1, 4),
  };
}

export function getAllBudgetEstimates(estimatedTokens: number): BudgetEstimate[] {
  return PROVIDERS.map((p) => estimateCost(p, estimatedTokens));
}
