import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { runCli } from "../src/run-cli.ts";
import { captureIo } from "./helpers.ts";

describe("runCli", () => {
  test("--help prints usage and exits 0", async () => {
    const cap = captureIo();
    const code = await runCli(["--help"], cap.io);
    assert.equal(code, 0);
    assert.match(cap.stdout(), /Usage:/);
  });

  test("--version prints the package version", async () => {
    const cap = captureIo();
    const code = await runCli(["--version"], cap.io);
    assert.equal(code, 0);
    assert.match(cap.stdout(), /^\d+\.\d+\.\d+\n$/);
  });

  test("missing suite file is a usage error", async () => {
    const cap = captureIo();
    const code = await runCli([], cap.io);
    assert.equal(code, 2);
    assert.match(cap.stderr(), /Missing suite file/);
  });

  test("unknown flags are usage errors", async () => {
    const cap = captureIo();
    const code = await runCli(["examples/suite.yaml", "--nope"], cap.io);
    assert.equal(code, 2);
  });

  test("mock mode on the example suite exits 0", async () => {
    const cap = captureIo();
    const code = await runCli(["examples/suite.yaml", "--mock"], cap.io);
    assert.equal(code, 0);
    assert.match(cap.stdout(), /4 passed/);
    assert.match(cap.stdout(), /greeting/);
  });

  test("--json prints a machine-readable report", async () => {
    const cap = captureIo();
    const code = await runCli(["examples/suite.yaml", "--mock", "--json"], cap.io);
    assert.equal(code, 0);
    const report = JSON.parse(cap.stdout()) as { ok: boolean; passed: number; runner: string };
    assert.equal(report.ok, true);
    assert.equal(report.passed, 4);
    assert.equal(report.runner, "mock");
  });

  test("failed cases exit 1", async () => {
    const cap = captureIo();
    const code = await runCli(["test/fixtures/fail.yaml", "--mock"], cap.io);
    assert.equal(code, 1);
    assert.match(cap.stdout(), /fail\s+spain/);
  });

  test("--fail-fast skips later cases", async () => {
    const cap = captureIo();
    const code = await runCli(["test/fixtures/fail.yaml", "--mock", "--fail-fast", "--json"], cap.io);
    assert.equal(code, 1);
    const report = JSON.parse(cap.stdout()) as { skipped: number; cases: Array<{ skipped?: boolean }> };
    assert.equal(report.skipped, 1);
    assert.equal(report.cases[1]?.skipped, true);
  });

  test("refuses to call a live provider without keys", async () => {
    const cap = captureIo({ OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" });
    delete cap.io.env.OPENAI_API_KEY;
    delete cap.io.env.ANTHROPIC_API_KEY;
    const code = await runCli(["examples/suite.yaml"], cap.io);
    assert.equal(code, 2);
    assert.match(cap.stderr(), /No API key set/);
  });

  test("invalid timeout is a usage error", async () => {
    const cap = captureIo();
    const code = await runCli(["examples/suite.yaml", "--mock", "--timeout", "nope"], cap.io);
    assert.equal(code, 2);
    assert.match(cap.stderr(), /--timeout/);
  });
});
