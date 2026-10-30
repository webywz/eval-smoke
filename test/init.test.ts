import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { INIT_SUITE_FILENAME, initSuite } from "../src/init.ts";
import { loadSuite } from "../src/load-suite.ts";
import { runSuite } from "../src/run.ts";
import { UsageError } from "../src/types.ts";
import { captureIo } from "./helpers.ts";
import { runCli } from "../src/run-cli.ts";

describe("initSuite", () => {
  test("creates suite.yaml with mock-friendly cases", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-smoke-init-"));
    try {
      const result = initSuite(dir);
      assert.equal(result.created, true);
      assert.equal(existsSync(result.file), true);
      const suite = loadSuite(result.file);
      assert.ok(suite.cases.length >= 3 && suite.cases.length <= 5);
      const report = await runSuite(suite, { mock: true });
      assert.equal(report.ok, true);
      assert.equal(report.passed, suite.cases.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("refuses to overwrite without --force", () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-smoke-init-"));
    try {
      writeFileSync(join(dir, INIT_SUITE_FILENAME), "name: existing\ncases: []\n", "utf8");
      assert.throws(() => initSuite(dir), (error: unknown) => {
        assert.ok(error instanceof UsageError);
        assert.match(error.message, /already exists/);
        return true;
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--force overwrites an existing suite", () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-smoke-init-"));
    try {
      writeFileSync(join(dir, INIT_SUITE_FILENAME), "name: existing\ncases: []\n", "utf8");
      initSuite(dir, { force: true });
      const body = readFileSync(join(dir, INIT_SUITE_FILENAME), "utf8");
      assert.match(body, /name: smoke/);
      assert.match(body, /id: greeting/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runCli init", () => {
  test("init subcommand scaffolds under cwd", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-smoke-cli-init-"));
    try {
      const cap = captureIo();
      cap.io.cwd = dir;
      const code = await runCli(["init"], cap.io);
      assert.equal(code, 0);
      assert.match(cap.stdout(), /Created /);
      assert.equal(existsSync(join(dir, INIT_SUITE_FILENAME)), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("init without --force exits 2 when file exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-smoke-cli-init-"));
    try {
      writeFileSync(join(dir, INIT_SUITE_FILENAME), "x", "utf8");
      const cap = captureIo();
      cap.io.cwd = dir;
      const code = await runCli(["init"], cap.io);
      assert.equal(code, 2);
      assert.match(cap.stderr(), /already exists/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
