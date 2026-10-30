import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatReport } from "../src/report.ts";
import type { Report } from "../src/types.ts";

const report: Report = {
  ok: false,
  version: "0.1.0",
  runner: "mock",
  model: "mock",
  suite: "demo",
  passed: 1,
  failed: 1,
  skipped: 0,
  duration_ms: 12,
  cases: [
    {
      id: "greeting",
      ok: true,
      duration_ms: 4,
      output: "Hello",
      checks: [{ name: "contains", ok: true, expected: "Hello" }],
    },
    {
      id: "math",
      ok: false,
      duration_ms: 8,
      output: "five",
      checks: [{ name: "contains", ok: false, expected: "4", detail: 'missing "4"' }],
    },
  ],
};

describe("formatReport", () => {
  test("human output lists pass/fail and failure details", () => {
    const text = formatReport(report, { color: false });
    assert.match(text, /eval-smoke 0\.1\.0/);
    assert.match(text, /pass\s+greeting/);
    assert.match(text, /fail\s+math/);
    assert.match(text, /missing "4"/);
    assert.match(text, /1 passed {2}1 failed {2}12ms/);
  });

  test("json output is parseable and complete", () => {
    const parsed = JSON.parse(formatReport(report, { json: true })) as Report;
    assert.equal(parsed.ok, false);
    assert.equal(parsed.cases.length, 2);
    assert.equal(parsed.cases[1]?.checks?.[0]?.name, "contains");
  });

  test("equals failures show first-diff detail", () => {
    const equalsReport: Report = {
      ...report,
      cases: [
        {
          id: "exact",
          ok: false,
          duration_ms: 1,
          output: "Hallo",
          checks: [
            {
              name: "equals",
              ok: false,
              expected: "Hello",
              actual: "Hallo",
              detail: "first diff at index 1\n          expected: \"Hello\"\n          actual:   \"Hallo\"\n                    ^",
            },
          ],
        },
      ],
    };
    const textOut = formatReport(equalsReport, { color: false });
    assert.match(textOut, /equals:/);
    assert.match(textOut, /first diff at index 1/);
  });

});
