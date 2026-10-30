import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatJUnit } from "../src/junit.ts";
import type { Report } from "../src/types.ts";

function baseReport(overrides: Partial<Report> = {}): Report {
  return {
    ok: true,
    version: "0.3.0",
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

describe("formatJUnit", () => {
  test("emits a testsuites/testcase skeleton for passes", () => {
    const xml = formatJUnit(baseReport());
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<testsuites name="demo" tests="1" failures="0" skipped="0"/);
    assert.match(xml, /<testsuite name="demo" tests="1" failures="0" skipped="0"/);
    assert.match(xml, /<testcase name="greeting" classname="demo" time="0\.005"\/>/);
  });

  test("failures include matcher detail", () => {
    const xml = formatJUnit(
      baseReport({
        ok: false,
        passed: 0,
        failed: 1,
        cases: [
          {
            id: "spain",
            ok: false,
            duration_ms: 8,
            output: "[mock] No canned reply for this prompt.",
            checks: [
              {
                name: "contains",
                ok: false,
                expected: "Madrid",
                actual: "[mock] No canned reply for this prompt.",
                detail: 'missing "Madrid"',
              },
            ],
          },
        ],
      }),
    );
    assert.match(xml, /failures="1"/);
    assert.match(xml, /<failure message="[^"]*missing &quot;Madrid&quot;/);
    assert.match(xml, /\[contains\] missing &quot;Madrid&quot;/);
    assert.match(xml, /expected: Madrid/);
    assert.match(xml, /actual: \[mock\] No canned reply/);
  });

  test("skipped cases become skipped elements", () => {
    const xml = formatJUnit(
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
    assert.match(xml, /skipped="1"/);
    assert.match(xml, /<skipped message="skipped \(fail-fast\)"\/>/);
  });

  test("escapes XML special characters in ids and messages", () => {
    const xml = formatJUnit(
      baseReport({
        ok: false,
        passed: 0,
        failed: 1,
        suite: 'a<b>&"c',
        cases: [
          {
            id: 'x<"y>&',
            ok: false,
            duration_ms: 1,
            error: 'boom <tag> & "quotes"',
          },
        ],
      }),
    );
    assert.match(xml, /name="a&lt;b&gt;&amp;&quot;c"/);
    assert.match(xml, /name="x&lt;&quot;y&gt;&amp;"/);
    assert.match(xml, /message="boom &lt;tag&gt; &amp; &quot;quotes&quot;"/);
  });

  test("falls back to eval-smoke suite name when missing", () => {
    const xml = formatJUnit(baseReport({ suite: undefined }));
    assert.match(xml, /name="eval-smoke"/);
  });
});
