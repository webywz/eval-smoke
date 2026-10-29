import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { repoRoot } from "./helpers.ts";

const SHEBANG = "#!/usr/bin/env node";
const BIN_NAME = "eval-smoke";
const BIN_TARGET = "dist/cli.js";

function readPackage(): { bin: Record<string, string>; version: string } {
  return JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    bin: Record<string, string>;
    version: string;
  };
}

function packTarball(): { tarball: string; stderr: string; cleanup: () => void } {
  const dest = mkdtempSync(join(tmpdir(), "eval-smoke-pack-"));
  const result = spawnSync("npm", ["pack", "--json", "--pack-destination", dest], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const cleanup = () => rmSync(dest, { recursive: true, force: true });
  if (result.status !== 0) {
    cleanup();
    throw new Error(`npm pack failed:\n${result.stderr}\n${result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout) as Array<{ filename: string }> | { filename: string };
  const filename = Array.isArray(parsed) ? parsed[0]?.filename : parsed.filename;
  const tarball = filename
    ? join(dest, filename)
    : join(dest, readdirSync(dest).find((name) => name.endsWith(".tgz")) ?? "");
  return { tarball, stderr: result.stderr ?? "", cleanup };
}

function extractPackage(tarball: string): { root: string; cleanup: () => void } {
  const dest = mkdtempSync(join(tmpdir(), "eval-smoke-tar-"));
  const result = spawnSync("tar", ["-xzf", tarball, "-C", dest], { encoding: "utf8" });
  const cleanup = () => rmSync(dest, { recursive: true, force: true });
  if (result.status !== 0) {
    cleanup();
    throw new Error(`tar extract failed:\n${result.stderr}`);
  }
  return { root: join(dest, "package"), cleanup };
}

describe("npm pack CLI bin", () => {
  test("package.json bin is dist/cli.js without a ./ prefix", () => {
    const pkg = readPackage();
    assert.deepEqual(pkg.bin, { [BIN_NAME]: BIN_TARGET });
  });

  test("tarball keeps eval-smoke bin, shebang, and mode 755", () => {
    const packed = packTarball();
    try {
      assert.doesNotMatch(packed.stderr, /was invalid and removed/);
      const extracted = extractPackage(packed.tarball);
      try {
        const pkg = JSON.parse(readFileSync(join(extracted.root, "package.json"), "utf8")) as {
          bin?: Record<string, string>;
          version: string;
        };
        assert.equal(pkg.version, readPackage().version);
        assert.ok(pkg.bin, "packed package.json dropped bin");
        const bin = pkg.bin[BIN_NAME];
        assert.ok(bin === BIN_TARGET || bin === `./${BIN_TARGET}`, `unexpected bin path: ${bin}`);

        const cliPath = join(extracted.root, BIN_TARGET);
        const mode = statSync(cliPath).mode & 0o777;
        assert.equal(mode, 0o755, `expected dist/cli.js mode 755, got ${mode.toString(8)}`);

        const source = readFileSync(cliPath, "utf8");
        assert.equal(source.split("\n", 1)[0], SHEBANG);
      } finally {
        extracted.cleanup();
      }
    } finally {
      packed.cleanup();
    }
  });
});
