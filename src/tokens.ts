/** Rough cl100k-style estimate used for `expect.min_tokens` / `expect.max_tokens`. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
