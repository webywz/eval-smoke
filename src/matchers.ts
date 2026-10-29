import { estimateTokens } from "./tokens.js";
import type { Case, CheckResult, Expect } from "./types.js";

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

export function hasMatchers(expect: Expect): boolean {
  return (
    asList(expect.contains).length > 0 ||
    asList(expect.not_contains).length > 0 ||
    asList(expect.regex).length > 0 ||
    expect.max_tokens != null
  );
}

export function evaluateExpect(output: string, expect: Expect): CheckResult[] {
  const checks: CheckResult[] = [];

  for (const needle of asList(expect.contains)) {
    const ok = output.toLowerCase().includes(needle.toLowerCase());
    checks.push({
      name: "contains",
      ok,
      expected: needle,
      detail: ok ? undefined : `missing ${JSON.stringify(needle)}`,
    });
  }

  for (const needle of asList(expect.not_contains)) {
    const ok = !output.toLowerCase().includes(needle.toLowerCase());
    checks.push({
      name: "not_contains",
      ok,
      expected: needle,
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
      detail: ok ? undefined : `no match for ${re}`,
    });
  }

  if (expect.max_tokens != null) {
    const tokens = estimateTokens(output);
    const ok = tokens <= expect.max_tokens;
    checks.push({
      name: "max_tokens",
      ok,
      expected: String(expect.max_tokens),
      detail: ok ? undefined : `estimated ${tokens} tokens > ${expect.max_tokens}`,
    });
  }

  return checks;
}

export function evaluateCase(output: string, testCase: Case): CheckResult[] {
  return evaluateExpect(output, testCase.expect);
}
