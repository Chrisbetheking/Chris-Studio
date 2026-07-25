import type { Detection, RiskScore } from "../types";

const weights: Record<Detection["severity"], number> = {
  low: 1,
  medium: 3,
  high: 8,
  critical: 15
};

export function scoreRisk(detections: Detection[]): RiskScore {
  const score = detections.reduce((sum, item) => sum + weights[item.severity], 0);

  if (score >= 30) return { label: "critical", score };
  if (score >= 14) return { label: "high", score };
  if (score >= 4) return { label: "medium", score };
  return { label: "low", score };
}
