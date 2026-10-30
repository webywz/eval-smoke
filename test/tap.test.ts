import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatTap } from "../src/tap.ts";
import type { Report } from "../src/types.ts";

function baseReport(overrides: Partial<Report> = {}): Report {
  return {
    ok: true,
    version: "0.7.0",
    runner: "mock",
    model: "gpt-4o-mini",
    suite: "demo",
    passed: 1,
    failed: 0,
    skipped: 0,
    duration_ms: 12,
    cases: [
      {
        id: "greeting",
        ok: true,
        duration_ms: 5,
        output: "Hello",
        checks: [{ name: "contains", ok: true, expected: "Hello" }],
      },
    ],
    ...overrides,
  };
}

describe("formatTap", () => {
  test("emits TAP version 13 with plan and ok lines", () => {
    const tap = formatTap(baseReport());
    assert.match(tap, /^TAP version 13\n/);
    assert.match(tap, /^1\.\.1$/m);
    assert.match(tap, /^ok 1 - greeting$/m);
  });

  test("failures are not ok with YAML diagnostics", () => {
    const tap = formatTap(
      baseReport({
        ok: false,
        passed: 0,
        failed: 1,
        cases: [
          {
            id: "spain",
            ok: false,
            duration_ms: 8,
            checks: [
              {
                name: "contains",
                ok: false,
                expected: "Madrid",
                detail: 'missing "Madrid"',
              },
            ],
          },
        ],
      }),
    );
    assert.match(tap, /^not ok 1 - spain$/m);
    assert.match(tap, /  ---/);
    assert.match(tap, /missing "Madrid"/);
    assert.match(tap, /  \.\.\./);
  });

  test("skipped cases use SKIP directive", () => {
    const tap = formatTap(
      baseReport({
        ok: false,
        passed: 0,
        failed: 0,
        skipped: 1,
        cases: [
          {
            id: "later",
            ok: false,
            skipped: true,
            duration_ms: 0,
            error: "skipped (fail-fast)",
          },
        ],
      }),
    );
    assert.match(tap, /^ok 1 - later # SKIP skipped \(fail-fast\)$/m);
  });

  test("plan count matches cases", () => {
    const tap = formatTap(
      baseReport({
        passed: 2,
        cases: [
          { id: "a", ok: true, duration_ms: 1 },
          { id: "b", ok: true, duration_ms: 2 },
        ],
      }),
    );
    assert.match(tap, /^1\.\.2$/m);
    assert.match(tap, /^ok 1 - a$/m);
    assert.match(tap, /^ok 2 - b$/m);
  });
});
