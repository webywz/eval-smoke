import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { runCli } from "../src/run-cli.ts";
import { captureIo } from "./helpers.ts";

describe("runCli", () => {
  test("--help prints usage and exits 0", async () => {
    const cap = captureIo();
    const code = await runCli(["--help"], cap.io);
    assert.equal(code, 0);
    assert.match(cap.stdout(), /Usage:/);
    assert.match(cap.stdout(), /--junit/);
    assert.match(cap.stdout(), /--only/);
    assert.match(cap.stdout(), /init/);
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
    assert.match(cap.stdout(), /5 passed/);
    assert.match(cap.stdout(), /greeting/);
  });

  test("--json prints a machine-readable report", async () => {
    const cap = captureIo();
    const code = await runCli(["examples/suite.yaml", "--mock", "--json"], cap.io);
    assert.equal(code, 0);
    const report = JSON.parse(cap.stdout()) as { ok: boolean; passed: number; runner: string };
    assert.equal(report.ok, true);
    assert.equal(report.passed, 5);
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

  test("--concurrency runs cases in parallel", async () => {
    const cap = captureIo();
    const code = await runCli(["examples/suite.yaml", "--mock", "--concurrency", "4", "--json"], cap.io);
    assert.equal(code, 0);
    const report = JSON.parse(cap.stdout()) as { ok: boolean; passed: number };
    assert.equal(report.ok, true);
    assert.equal(report.passed, 5);
  });

  test("invalid concurrency is a usage error", async () => {
    const cap = captureIo();
    const code = await runCli(["examples/suite.yaml", "--mock", "--concurrency", "0"], cap.io);
    assert.equal(code, 2);
    assert.match(cap.stderr(), /--concurrency/);
  });

  test("--no-color strips ANSI even on TTY-shaped io", async () => {
    const withColor = captureIo();
    delete withColor.io.env.NO_COLOR;
    withColor.io.isTTY = true;
    const colored = await runCli(["examples/suite.yaml", "--mock"], withColor.io);
    assert.equal(colored, 0);
    assert.match(withColor.stdout(), /\u001b\[/);

    const noColor = captureIo();
    delete noColor.io.env.NO_COLOR;
    noColor.io.isTTY = true;
    const code = await runCli(["examples/suite.yaml", "--mock", "--no-color"], noColor.io);
    assert.equal(code, 0);
    assert.doesNotMatch(noColor.stdout(), /\u001b\[/);
  });

  test("--only substring filters cases", async () => {
    const cap = captureIo();
    const code = await runCli(["examples/suite.yaml", "--mock", "--only", "greeting", "--json"], cap.io);
    assert.equal(code, 0);
    const report = JSON.parse(cap.stdout()) as { passed: number; cases: Array<{ id: string }> };
    assert.equal(report.passed, 1);
    assert.deepEqual(
      report.cases.map((c) => c.id),
      ["greeting"],
    );
  });

  test("--only /regex/ filters cases", async () => {
    const cap = captureIo();
    const code = await runCli(["examples/suite.yaml", "--mock", "--only", "/^capital/", "--json"], cap.io);
    assert.equal(code, 0);
    const report = JSON.parse(cap.stdout()) as { passed: number; cases: Array<{ id: string }> };
    assert.equal(report.passed, 1);
    assert.equal(report.cases[0]?.id, "capital-france");
  });

  test("--only with zero matches exits 2", async () => {
    const cap = captureIo();
    const code = await runCli(["examples/suite.yaml", "--mock", "--only", "no-such-case"], cap.io);
    assert.equal(code, 2);
    assert.match(cap.stderr(), /matched 0 cases/);
  });

  test("--junit writes XML and still prints human report", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-smoke-junit-cli-"));
    try {
      const out = join(dir, "report.xml");
      const cap = captureIo();
      const code = await runCli(["examples/suite.yaml", "--mock", "--junit", out], cap.io);
      assert.equal(code, 0);
      assert.match(cap.stdout(), /5 passed/);
      const xml = readFileSync(out, "utf8");
      assert.match(xml, /<testsuites /);
      assert.match(xml, /name="greeting"/);
      assert.match(xml, /tests="5"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--junit with --json still writes XML and prints JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-smoke-junit-json-"));
    try {
      const out = join(dir, "report.xml");
      const cap = captureIo();
      const code = await runCli(["test/fixtures/fail.yaml", "--mock", "--junit", out, "--json"], cap.io);
      assert.equal(code, 1);
      const report = JSON.parse(cap.stdout()) as { ok: boolean; failed: number };
      assert.equal(report.ok, false);
      assert.equal(report.failed, 1);
      const xml = readFileSync(out, "utf8");
      assert.match(xml, /<failure /);
      assert.match(xml, /spain/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
