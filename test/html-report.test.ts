import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { escapeHtml, formatHtmlReport } from "../src/html-report.ts";
import { runCli } from "../src/run-cli.ts";
import type { Report } from "../src/types.ts";
import { captureIo } from "./helpers.ts";

const report: Report = {
  ok: false,
  version: "0.5.0",
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
      output: '<script>alert("x")</script>',
      checks: [
        {
          name: "contains",
          ok: false,
          expected: "4",
          detail: 'missing "4"',
          actual: '<b>five</b>',
        },
      ],
    },
  ],
};

describe("escapeHtml", () => {
  test("escapes markup", () => {
    assert.equal(escapeHtml("<a>&\"'"), "&lt;a&gt;&amp;&quot;&#39;");
  });
});

describe("formatHtmlReport", () => {
  test("emits self-contained pass/fail table", () => {
    const html = formatHtmlReport(report);
    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /eval-smoke/);
    assert.match(html, /greeting/);
    assert.match(html, /math/);
    assert.match(html, /badge fail/);
    assert.match(html, /1 passed/);
    assert.doesNotMatch(html, /cdn\.|unpkg|jsdelivr/i);
  });

  test("escapes hostile output and details", () => {
    const html = formatHtmlReport(report);
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;alert/);
    assert.match(html, /&lt;b&gt;five&lt;\/b&gt;/);
  });
});

describe("CLI --html", () => {
  test("writes HTML report to path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "es-html-"));
    const out = join(dir, "report.html");
    try {
      const cap = captureIo();
      const code = await runCli(
        ["examples/suite.yaml", "--mock", `--html=${out}`],
        cap.io,
      );
      assert.equal(code, 0);
      const html = readFileSync(out, "utf8");
      assert.match(html, /<!DOCTYPE html>/i);
      assert.match(html, /eval-smoke/);
      assert.match(html, /greeting|pass/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("help mentions --html", async () => {
    const cap = captureIo();
    const code = await runCli(["--help"], cap.io);
    assert.equal(code, 0);
    assert.match(cap.stdout(), /--html/);
  });
});
