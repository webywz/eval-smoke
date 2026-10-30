import { estimateTokens } from "./tokens.js";

/**
 * Rough USD unit prices per 1M tokens (input / output).
 * Offline estimates only — not billed invoices. `--mock` stays offline.
 */
export interface UnitPrice {
  /** USD per 1M input tokens */
  inPerMTok: number;
  /** USD per 1M output tokens */
  outPerMTok: number;
}

/** Built-in rough table keyed by model id substring (lowercased match). */
export const UNIT_PRICE_TABLE: Array<{ match: RegExp; price: UnitPrice }> = [
  { match: /^mock$/i, price: { inPerMTok: 0.1, outPerMTok: 0.4 } },
  { match: /gpt-4o-mini/i, price: { inPerMTok: 0.15, outPerMTok: 0.6 } },
  { match: /gpt-4o/i, price: { inPerMTok: 2.5, outPerMTok: 10 } },
  { match: /gpt-4\.1-mini/i, price: { inPerMTok: 0.4, outPerMTok: 1.6 } },
  { match: /gpt-4\.1/i, price: { inPerMTok: 2, outPerMTok: 8 } },
  { match: /gpt-3\.5/i, price: { inPerMTok: 0.5, outPerMTok: 1.5 } },
  { match: /o1-mini/i, price: { inPerMTok: 3, outPerMTok: 12 } },
  { match: /o1/i, price: { inPerMTok: 15, outPerMTok: 60 } },
  { match: /o3-mini/i, price: { inPerMTok: 1.1, outPerMTok: 4.4 } },
  { match: /claude.*haiku/i, price: { inPerMTok: 0.8, outPerMTok: 4 } },
  { match: /claude.*sonnet/i, price: { inPerMTok: 3, outPerMTok: 15 } },
  { match: /claude.*opus/i, price: { inPerMTok: 15, outPerMTok: 75 } },
];

/** Fallback when model is unknown (gpt-4o-mini-ish). */
export const DEFAULT_UNIT_PRICE: UnitPrice = { inPerMTok: 0.15, outPerMTok: 0.6 };

export function lookupUnitPrice(model: string): UnitPrice {
  const key = model.trim() || "unknown";
  for (const row of UNIT_PRICE_TABLE) {
    if (row.match.test(key)) return row.price;
  }
  return DEFAULT_UNIT_PRICE;
}

export interface CostEstimate {
  /** Estimated input tokens (prompt + system). */
  tokensIn: number;
  /** Estimated output tokens. */
  tokensOut: number;
  /** Estimated USD cost. */
  costUsd: number;
  model: string;
}

/** Estimate case cost from prompt/system/output + model unit prices. */
export function estimateCostUsd(opts: {
  model: string;
  prompt: string;
  system?: string;
  output?: string;
}): CostEstimate {
  const tokensIn = estimateTokens(
    [opts.system, opts.prompt].filter((s): s is string => Boolean(s)).join("\n"),
  );
  const tokensOut = estimateTokens(opts.output ?? "");
  const price = lookupUnitPrice(opts.model);
  const costUsd =
    (tokensIn / 1_000_000) * price.inPerMTok + (tokensOut / 1_000_000) * price.outPerMTok;
  return {
    tokensIn,
    tokensOut,
    costUsd: roundUsd(costUsd),
    model: opts.model,
  };
}

export function roundUsd(n: number): number {
  // Keep enough precision for tiny mock cases while staying JSON-friendly.
  return Math.round(n * 1e8) / 1e8;
}

export function sumCostUsd(costs: number[]): number {
  return roundUsd(costs.reduce((a, b) => a + b, 0));
}
