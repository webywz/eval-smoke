import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { compileRegex, evaluateExpect, hasMatchers } from "../src/matchers.ts";
import { estimateTokens } from "../src/tokens.ts";

describe("evaluateExpect", () => {
  test("contains is case-insensitive and supports lists", () => {
    const checks = evaluateExpect("Hello from Paris", {
      contains: ["hello", "PARIS"],
    });
    assert.equal(checks.length, 2);
    assert.ok(checks.every((check) => check.ok));
  });

  test("contains reports missing needles", () => {
    const [check] = evaluateExpect("Hello", { contains: "Paris" });
    assert.equal(check?.ok, false);
    assert.match(check?.detail ?? "", /missing "Paris"/);
  });

  test("not_contains fails when the needle is present", () => {
    const [check] = evaluateExpect("status PWNED", { not_contains: "pwned" });
    assert.equal(check?.ok, false);
    assert.match(check?.detail ?? "", /found "pwned"/);
  });

  test("regex supports /pattern/flags and (?i) prefix", () => {
    const slash = evaluateExpect("Paris", { regex: "/^paris$/i" });
    const inline = evaluateExpect("Paris", { regex: "(?i)^paris$" });
    const raw = evaluateExpect("Paris", { regex: "Paris" });
    assert.equal(slash[0]?.ok, true);
    assert.equal(inline[0]?.ok, true);
    assert.equal(raw[0]?.ok, true);
  });

  test("max_tokens uses the char/4 estimate", () => {
    const output = "abcd";
    assert.equal(estimateTokens(output), 1);
    const pass = evaluateExpect(output, { max_tokens: 1 });
    const fail = evaluateExpect("abcdefgh", { max_tokens: 1 });
    assert.equal(pass[0]?.ok, true);
    assert.equal(fail[0]?.ok, false);
  });

  test("hasMatchers requires at least one assertion", () => {
    assert.equal(hasMatchers({}), false);
    assert.equal(hasMatchers({ contains: "x" }), true);
  });

  test("compileRegex understands slash-delimited patterns", () => {
    assert.equal(compileRegex("/foo/i").flags.includes("i"), true);
    assert.equal(compileRegex("(?i)foo").flags.includes("i"), true);
  });
});
