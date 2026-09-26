export function estimateTokens(input: string): number {
  if (!input.trim()) return 0;

  const cjk = (input.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (input.replace(/[\u3400-\u9fff]/g, " ").match(/[A-Za-z0-9_@./:-]+/g) || []).length;
  const symbols = Math.max(0, input.length - cjk - words * 4);

  return Math.max(1, Math.ceil(cjk * 1.05 + words * 1.25 + symbols / 6));
}

export function tokenDelta(before: number, after: number): number {
  if (!before) return 0;
  return Math.max(0, Math.round(((before - after) / before) * 1000) / 10);
}
