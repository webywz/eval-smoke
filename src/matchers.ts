import { estimateTokens } from "./tokens.js";
import type { Case, CheckResult, Expect, JsonExpect } from "./types.js";

export function asList(value?: string | string[]): string[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

const MAX_REGEX_SOURCE = 512;

export function compileRegex(raw: string): RegExp {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("regex pattern must be a non-empty string");
  }
  if (raw.length > MAX_REGEX_SOURCE) {
    throw new Error(`regex pattern too long (max ${MAX_REGEX_SOURCE} chars)`);
  }
  try {
    const wrapped = raw.match(/^\/([\s\S]+)\/([gimsuy]*)$/);
    if (wrapped?.[1] != null) {
      if (wrapped[1].length === 0) {
        throw new Error("regex pattern must be a non-empty string");
      }
      return new RegExp(wrapped[1], wrapped[2]);
    }
    if (raw.startsWith("(?i)")) {
      const body = raw.slice(4);
      if (body.length === 0) {
        throw new Error("regex pattern must be a non-empty string");
      }
      return new RegExp(body, "i");
    }
    return new RegExp(raw);
  } catch (error) {
    if (error instanceof Error && /non-empty|too long/.test(error.message)) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid regex: ${detail}`);
  }
}

/** Normalize for equals: NFC + CRLF→LF, strip one trailing newline. */
export function normalizeEquals(text: string): string {
  let out = text.normalize("NFC").replace(/\r\n/g, "\n");
  if (out.endsWith("\n")) out = out.slice(0, -1);
  return out;
}

export function hasMatchers(expect: Expect): boolean {
  return (
    asList(expect.contains).length > 0 ||
    asList(expect.not_contains).length > 0 ||
    asList(expect.contains_any).length > 0 ||
    asList(expect.contains_all).length > 0 ||
    asList(expect.starts_with).length > 0 ||
    asList(expect.ends_with).length > 0 ||
    asList(expect.regex).length > 0 ||
    expect.equals != null ||
    expect.json != null ||
    expect.max_tokens != null ||
    expect.min_tokens != null ||
    expect.max_latency_ms != null
  );
}

function clip(text: string, max = 120): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

/** First-difference hint for equals failures (vitest-style pointer). */
export function equalsDiff(expected: string, actual: string): string {
  const max = Math.max(expected.length, actual.length);
  let i = 0;
  while (i < max && expected[i] === actual[i]) i += 1;
  if (i >= max) return "strings differ only by normalization";
  const window = 24;
  const start = Math.max(0, i - 8);
  const expSlice = expected.slice(start, start + window);
  const actSlice = actual.slice(start, start + window);
  const pointer = " ".repeat(i - start) + "^";
  return `first diff at index ${i}\n          expected: ${JSON.stringify(expSlice)}\n          actual:   ${JSON.stringify(actSlice)}\n                    ${pointer}`;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as object).sort();
    const bKeys = Object.keys(b as object).sort();
    if (aKeys.length !== bKeys.length) return false;
    if (!aKeys.every((key, index) => key === bKeys[index])) return false;
    return aKeys.every((key) =>
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }
  return false;
}

function evaluateJson(output: string, expect: JsonExpect): CheckResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      name: "json",
      ok: false,
      expected: expect === true ? "valid JSON" : JSON.stringify(expect),
      actual: clip(output),
      detail: `invalid JSON: ${reason}`,
    };
  }

  if (expect === true) {
    return {
      name: "json",
      ok: true,
      expected: "valid JSON",
      actual: clip(JSON.stringify(parsed)),
    };
  }

  const ok = deepEqual(parsed, expect);
  return {
    name: "json",
    ok,
    expected: JSON.stringify(expect),
    actual: JSON.stringify(parsed),
    detail: ok ? undefined : "JSON value does not deep-equal expect.json",
  };
}

export interface EvaluateOptions {
  /** Measured case duration in ms (for max_latency_ms). */
  durationMs?: number;
}

export function evaluateExpect(
  output: string,
  expect: Expect,
  options: EvaluateOptions = {},
): CheckResult[] {
  const checks: CheckResult[] = [];

  for (const needle of asList(expect.contains)) {
    const ok = output.toLowerCase().includes(needle.toLowerCase());
    checks.push({
      name: "contains",
      ok,
      expected: needle,
      actual: ok ? undefined : clip(output),
      detail: ok ? undefined : `missing ${JSON.stringify(needle)}`,
    });
  }

  for (const needle of asList(expect.not_contains)) {
    const ok = !output.toLowerCase().includes(needle.toLowerCase());
    checks.push({
      name: "not_contains",
      ok,
      expected: needle,
      actual: ok ? undefined : clip(output),
      detail: ok ? undefined : `found ${JSON.stringify(needle)}`,
    });
  }

  {
    const needles = asList(expect.contains_any);
    if (needles.length) {
      const hay = output.toLowerCase();
      const hit = needles.find((n) => hay.includes(n.toLowerCase()));
      const ok = hit != null;
      checks.push({
        name: "contains_any",
        ok,
        expected: needles.join(" | "),
        actual: ok ? undefined : clip(output),
        detail: ok ? undefined : `none of ${JSON.stringify(needles)} found`,
      });
    }
  }

  {
    const needles = asList(expect.contains_all);
    if (needles.length) {
      const hay = output.toLowerCase();
      const missing = needles.filter((n) => !hay.includes(n.toLowerCase()));
      const ok = missing.length === 0;
      checks.push({
        name: "contains_all",
        ok,
        expected: needles.join(" & "),
        actual: ok ? undefined : clip(output),
        detail: ok ? undefined : `missing ${JSON.stringify(missing)}`,
      });
    }
  }

  {
    const needles = asList(expect.starts_with);
    if (needles.length) {
      const hay = output.toLowerCase();
      const hit = needles.find((n) => hay.startsWith(n.toLowerCase()));
      const ok = hit != null;
      checks.push({
        name: "starts_with",
        ok,
        expected: needles.join(" | "),
        actual: ok ? undefined : clip(output),
        detail: ok ? undefined : `does not start with any of ${JSON.stringify(needles)}`,
      });
    }
  }

  {
    const needles = asList(expect.ends_with);
    if (needles.length) {
      const hay = output.toLowerCase();
      const hit = needles.find((n) => hay.endsWith(n.toLowerCase()));
      const ok = hit != null;
      checks.push({
        name: "ends_with",
        ok,
        expected: needles.join(" | "),
        actual: ok ? undefined : clip(output),
        detail: ok ? undefined : `does not end with any of ${JSON.stringify(needles)}`,
      });
    }
  }

  for (const raw of asList(expect.regex)) {
    const re = compileRegex(raw);
    re.lastIndex = 0;
    const ok = re.test(output);
    checks.push({
      name: "regex",
      ok,
      expected: String(re),
      actual: ok ? undefined : clip(output),
      detail: ok ? undefined : `no match for ${re}`,
    });
  }

  if (expect.equals != null) {
    const expected = normalizeEquals(expect.equals);
    const actual = normalizeEquals(output);
    const ok = expected === actual;
    checks.push({
      name: "equals",
      ok,
      expected,
      actual,
      detail: ok ? undefined : equalsDiff(expected, actual),
    });
  }

  if (expect.json != null) {
    checks.push(evaluateJson(output, expect.json));
  }

  if (expect.min_tokens != null) {
    const tokens = estimateTokens(output);
    const ok = tokens >= expect.min_tokens;
    checks.push({
      name: "min_tokens",
      ok,
      expected: String(expect.min_tokens),
      actual: String(tokens),
      detail: ok ? undefined : `estimated ${tokens} tokens < ${expect.min_tokens}`,
    });
  }

  if (expect.max_tokens != null) {
    const tokens = estimateTokens(output);
    const ok = tokens <= expect.max_tokens;
    checks.push({
      name: "max_tokens",
      ok,
      expected: String(expect.max_tokens),
      actual: String(tokens),
      detail: ok ? undefined : `estimated ${tokens} tokens > ${expect.max_tokens}`,
    });
  }

  if (expect.max_latency_ms != null) {
    const duration = options.durationMs ?? 0;
    const ok = duration <= expect.max_latency_ms;
    checks.push({
      name: "max_latency_ms",
      ok,
      expected: String(expect.max_latency_ms),
      actual: String(duration),
      detail: ok
        ? undefined
        : `${duration}ms exceeds max_latency_ms ${expect.max_latency_ms}`,
    });
  }

  return checks;
}

export function evaluateCase(
  output: string,
  testCase: Case,
  options: EvaluateOptions = {},
): CheckResult[] {
  return evaluateExpect(output, testCase.expect, options);
}
