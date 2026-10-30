import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { checkBaseline, loadBaseline } from "../src/baseline.ts";
import { resolveGithubSummaryPath } from "../src/github-summary.ts";
import { normalizeGithubSummaryArgv, runCli } from "../src/run-cli.ts";
import { formatGithubSummary } from "../src/summary-md.ts";
import type { Report } from "../src/types.ts";
import { captureIo } from "./helpers.ts";

function sampleReport(overrides: Partial<Report> = {}): Report {
  return {
    ok: true,
    version: "0.4.0",
    runner: "mock",
    model: "gpt-4o-mini",
    suite: "demo",
    passed: 2,
    failed: 0,
    skipped: 0,
    duration_ms: 3,
    cases: [
      { id: "greeting", ok: true, duration_ms: 1 },
      { id: "capital-france", ok: true, duration_ms: 1 },
    ],
    ...overrides,
  };
}

describe("normalizeGithubSummaryArgv", () => {
  test("rewrites bare flag to sentinel", () => {
    assert.deepEqual(normalizeGithubSummaryArgv(["--mock", "--github-summary"]), [
      "--mock",
      "--github-summary=__auto__",
    ]);
  });

  test("keeps explicit path", () => {
    assert.deepEqual(normalizeGithubSummaryArgv(["--github-summary", "out.md"]), [
      "--github-summary",
      "out.md",
    ]);
  });
});

describe("resolveGithubSummaryPath", () => {
  test("flag true uses env or local default", () => {
    assert.equal(
      resolveGithubSummaryPath(true, { GITHUB_STEP_SUMMARY: "/tmp/g.md" }, "/cwd"),
      "/tmp/g.md",
    );
    assert.equal(resolveGithubSummaryPath(true, {}, "/cwd"), join("/cwd", "github-step-summary.md"));
  });
});

describe("checkBaseline", () => {
  test("passes when baseline cases still pass", () => {
    const baseline = new Map([
      ["greeting", true],
      ["capital-france", true],
    ]);
    const check = checkBaseline(sampleReport(), baseline);
    assert.equal(check.ok, true);
  });

  test("flags formerly-passing case that now fails", () => {
    const baseline = new Map([["greeting", true]]);
    const report = sampleReport({
      ok: false,
      passed: 1,
      failed: 1,
      cases: [
        { id: "greeting", ok: false, duration_ms: 1, error: "nope" },
        { id: "capital-france", ok: true, duration_ms: 1 },
      ],
    });
    const check = checkBaseline(report, baseline);
    assert.equal(check.ok, false);
    assert.match(check.regressions[0] ?? "", /greeting/);
  });

  test("flags missing baseline case", () => {
    const baseline = new Map([
      ["greeting", true],
      ["gone", true],
    ]);
    const check = checkBaseline(sampleReport(), baseline);
    assert.equal(check.ok, false);
    assert.match(check.regressions.join("\n"), /gone.*missing/);
  });

  test("allows new cases and ignores baseline failures", () => {
    const baseline = new Map([
      ["greeting", true],
      ["old-fail", false],
    ]);
    const report = sampleReport({
      cases: [
        { id: "greeting", ok: true, duration_ms: 1 },
        { id: "capital-france", ok: true, duration_ms: 1 },
        { id: "brand-new", ok: true, duration_ms: 1 },
      ],
      passed: 3,
    });
    assert.equal(checkBaseline(report, baseline).ok, true);
  });
});

describe("formatGithubSummary", () => {
  test("renders a table", () => {
    const md = formatGithubSummary(sampleReport());
    assert.match(md, /### eval-smoke/);
    assert.match(md, /greeting/);
    assert.match(md, /PASS/);
  });
});

describe("CLI baseline + github-summary", () => {
  test("--update-baseline writes JSON and --baseline passes", async () => {
    const cap = captureIo();
    const dir2 = mkdtempSync(join(tmpdir(), "eval-smoke-bl2-"));
    try {
      const baseline = join(dir2, "baseline.json");
      const code = await runCli(
        ["examples/suite.yaml", "--mock", "--update-baseline", baseline],
        cap.io,
      );
      assert.equal(code, 0, cap.stderr());
      assert.match(cap.stderr(), /Wrote baseline/);
      const parsed = JSON.parse(readFileSync(baseline, "utf8")) as { cases: Array<{ id: string; ok: boolean }> };
      assert.ok(parsed.cases.length >= 4);
      assert.ok(parsed.cases.every((c) => typeof c.ok === "boolean"));

      const cap2 = captureIo();
      const code2 = await runCli(
        ["examples/suite.yaml", "--mock", "--baseline", baseline],
        cap2.io,
      );
      assert.equal(code2, 0, cap2.stderr());
      assert.match(cap2.stderr(), /no regressions/);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  test("--baseline detects regression when a case disappears via --only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-smoke-reg-"));
    try {
      const baseline = join(dir, "baseline.json");
      const cap0 = captureIo();
      assert.equal(
        await runCli(["examples/suite.yaml", "--mock", "--update-baseline", baseline], cap0.io),
        0,
      );

      const cap = captureIo();
      const code = await runCli(
        ["examples/suite.yaml", "--mock", "--only", "greeting", "--baseline", baseline],
        cap.io,
      );
      assert.equal(code, 1);
      assert.match(cap.stderr(), /missing from current run/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--github-summary appends markdown", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-smoke-gs-"));
    try {
      const out = join(dir, "summary.md");
      const cap = captureIo();
      const code = await runCli(
        ["examples/suite.yaml", "--mock", `--github-summary=${out}`],
        cap.io,
      );
      assert.equal(code, 0, cap.stderr());
      const body = readFileSync(out, "utf8");
      assert.match(body, /eval-smoke/);
      assert.match(body, /greeting/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("GITHUB_STEP_SUMMARY env alone appends", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-smoke-env-"));
    try {
      const out = join(dir, "from-env.md");
      const cap = captureIo({ GITHUB_STEP_SUMMARY: out });
      const code = await runCli(["examples/suite.yaml", "--mock"], cap.io);
      assert.equal(code, 0, cap.stderr());
      assert.match(readFileSync(out, "utf8"), /PASS|pass/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loadBaseline rejects missing file", () => {
    assert.throws(() => loadBaseline("/tmp/no-such-baseline-eval-smoke.json"), /baseline not found/);
  });

  test("help mentions new flags", async () => {
    const cap = captureIo();
    assert.equal(await runCli(["--help"], cap.io), 0);
    assert.match(cap.stdout(), /--baseline/);
    assert.match(cap.stdout(), /--update-baseline/);
    assert.match(cap.stdout(), /--github-summary/);
  });

  test("examples/github-action.yml exists and mentions flags", () => {
    const yml = readFileSync(join(captureIo().io.cwd, "examples/github-action.yml"), "utf8");
    assert.match(yml, /--github-summary/);
    assert.match(yml, /--junit/);
    assert.match(yml, /--mock/);
  });
});
