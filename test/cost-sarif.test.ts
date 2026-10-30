import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { estimateCostUsd, lookupUnitPrice } from "../src/cost.js";
import { evaluateExpect } from "../src/matchers.js";
import { parseSuite } from "../src/load-suite.js";
import { runSuite } from "../src/run.js";
import { runCli } from "../src/run-cli.js";
import { formatSarif, renderSarif } from "../src/sarif.js";

describe("unit prices / estimateCostUsd", () => {
  it("looks up gpt-4o-mini and mock offline", () => {
    assert.equal(lookupUnitPrice("gpt-4o-mini").inPerMTok, 0.15);
    assert.ok(lookupUnitPrice("mock").outPerMTok > 0);
    assert.ok(lookupUnitPrice("totally-unknown-model").inPerMTok > 0);
  });

  it("estimates positive cost from prompt+output", () => {
    const est = estimateCostUsd({
      model: "mock",
      prompt: "hello world ".repeat(50),
      output: "Hello",
    });
    assert.ok(est.tokensIn > 0);
    assert.ok(est.costUsd > 0);
  });
});

describe("max_cost_usd matcher", () => {
  it("fails when cost exceeds budget", () => {
    const checks = evaluateExpect("Hello", { max_cost_usd: 0.00000001 }, { costUsd: 0.01 });
    assert.equal(checks.length, 1);
    assert.equal(checks[0]!.name, "max_cost_usd");
    assert.equal(checks[0]!.ok, false);
  });

  it("passes under budget", () => {
    const checks = evaluateExpect("Hello", { max_cost_usd: 1 }, { costUsd: 0.0001 });
    assert.equal(checks[0]!.ok, true);
  });
});

describe("suite budget_usd", () => {
  it("parses budget_usd and max_cost_usd", () => {
    const suite = parseSuite({
      name: "cost",
      model: "mock",
      budget_usd: 0.00000001,
      cases: [
        {
          id: "hi",
          prompt: "Say hello please and thank you very much for your time today",
          expect: { contains: "hello", max_cost_usd: 1 },
        },
      ],
    });
    assert.equal(suite.budget_usd, 0.00000001);
    assert.equal(suite.cases[0]!.expect.max_cost_usd, 1);
  });

  it("fails suite when cost exceeds budget_usd (mock offline)", async () => {
    const suite = parseSuite({
      name: "over",
      model: "mock",
      budget_usd: 1e-12,
      cases: [
        {
          id: "greeting",
          prompt: "Please say hello to the team with a warm welcome message",
          expect: { contains: "hello" },
        },
      ],
    });
    const report = await runSuite(suite, { mock: true });
    assert.equal(report.ok, false);
    assert.ok((report.cost_usd ?? 0) > 1e-12);
    assert.equal(report.budget_usd, 1e-12);
  });
});

describe("SARIF export", () => {
  it("exports failed cases", async () => {
    const suite = parseSuite({
      name: "fail",
      model: "mock",
      cases: [{ id: "nope", prompt: "hello", expect: { contains: "ZZZ_NOT_PRESENT" } }],
    });
    const report = await runSuite(suite, { mock: true });
    const sarif = renderSarif(report);
    assert.equal(sarif.version, "2.1.0");
    assert.ok(sarif.runs[0]!.results.length >= 1);
    assert.match(formatSarif(report), /case-failed/);
  });

  it("CLI --sarif writes file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "es-sarif-"));
    const suitePath = join(dir, "suite.yaml");
    const sarifPath = join(dir, "out.sarif");
    writeFileSync(
      suitePath,
      `name: t\nmodel: mock\ncases:\n  - id: greeting\n    prompt: hello\n    expect:\n      contains: Hello\n`,
      "utf8",
    );
    const chunks: string[] = [];
    const code = await runCli(["--mock", "--sarif", sarifPath, suitePath], {
      stdout: { write: (t) => void chunks.push(t) },
      stderr: { write: () => {} },
      env: {},
      cwd: dir,
      isTTY: false,
    });
    assert.equal(code, 0);
    const body = JSON.parse(readFileSync(sarifPath, "utf8")) as { version: string };
    assert.equal(body.version, "2.1.0");
    rmSync(dir, { recursive: true, force: true });
  });
});
