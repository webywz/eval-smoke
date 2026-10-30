import { estimateTokens } from "./tokens.js";
import type { Case, CheckResult, Expect, JsonExpect } from "./types.js";

export function asList(value?: string | string[]): string[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function compileRegex(raw: string): RegExp {
  const wrapped = raw.match(/^\/([\s\S]+)\/([gimsuy]*)$/);
  if (wrapped?.[1] != null) {
    return new RegExp(wrapped[1], wrapped[2]);
  }
  if (raw.startsWith("(?i)")) {
    return new RegExp(raw.slice(4), "i");
  }
  return new RegExp(raw);
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
    asList(expect.regex).length > 0 ||
    expect.equals != null ||
    expect.json != null ||
    expect.max_tokens != null ||
    expect.min_tokens != null
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

export function evaluateExpect(output: string, expect: Expect): CheckResult[] {
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

  return checks;
}

export function evaluateCase(output: string, testCase: Case): CheckResult[] {
  return evaluateExpect(output, testCase.expect);
}
