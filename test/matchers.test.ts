import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  compileRegex,
  equalsDiff,
  evaluateExpect,
  hasMatchers,
  normalizeEquals,
} from "../src/matchers.ts";
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
    assert.ok(check?.actual);
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

  test("equals normalizes trailing newline and NFC", () => {
    const pass = evaluateExpect("Hello\n", { equals: "Hello" });
    const fail = evaluateExpect("Hallo", { equals: "Hello" });
    assert.equal(pass[0]?.ok, true);
    assert.equal(fail[0]?.ok, false);
    assert.match(fail[0]?.detail ?? "", /first diff at index/);
    assert.equal(fail[0]?.actual, "Hallo");
  });

  test("json true accepts any valid JSON", () => {
    const pass = evaluateExpect('{"a":1}', { json: true });
    const fail = evaluateExpect("not-json", { json: true });
    assert.equal(pass[0]?.ok, true);
    assert.equal(fail[0]?.ok, false);
    assert.match(fail[0]?.detail ?? "", /invalid JSON/);
  });

  test("json object deep-equals parsed output", () => {
    const pass = evaluateExpect('{"city":"Paris"}', { json: { city: "Paris" } });
    const fail = evaluateExpect('{"city":"Lyon"}', { json: { city: "Paris" } });
    assert.equal(pass[0]?.ok, true);
    assert.equal(fail[0]?.ok, false);
    assert.equal(fail[0]?.actual, '{"city":"Lyon"}');
  });

  test("min_tokens and max_tokens use the char/4 estimate", () => {
    const output = "abcd";
    assert.equal(estimateTokens(output), 1);
    const pass = evaluateExpect(output, { min_tokens: 1, max_tokens: 1 });
    const tooShort = evaluateExpect("a", { min_tokens: 2 });
    const tooLong = evaluateExpect("abcdefgh", { max_tokens: 1 });
    assert.ok(pass.every((c) => c.ok));
    assert.equal(tooShort[0]?.ok, false);
    assert.equal(tooLong[0]?.ok, false);
  });

  test("hasMatchers requires at least one assertion", () => {
    assert.equal(hasMatchers({}), false);
    assert.equal(hasMatchers({ contains: "x" }), true);
    assert.equal(hasMatchers({ equals: "x" }), true);
    assert.equal(hasMatchers({ json: true }), true);
    assert.equal(hasMatchers({ min_tokens: 1 }), true);
  });

  test("compileRegex understands slash-delimited patterns", () => {
    assert.equal(compileRegex("/foo/i").flags.includes("i"), true);
    assert.equal(compileRegex("(?i)foo").flags.includes("i"), true);
  });

  test("normalizeEquals and equalsDiff helpers", () => {
    assert.equal(normalizeEquals("Hi\r\n"), "Hi");
    assert.match(equalsDiff("abc", "axc"), /index 1/);
  });
});
