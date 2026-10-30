import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { redactSecrets } from "../src/redact.ts";

describe("redactSecrets", () => {
  test("scrubs sk-, ghp_, and Bearer tokens", () => {
    const raw =
      'key=sk-abcDEF1234567890 expected ghp_ABCDEFGHijklmnop Bearer eyJhbGciOiJIUzI1NiJ9.payload';
    const out = redactSecrets(raw);
    assert.doesNotMatch(out, /sk-abc/);
    assert.doesNotMatch(out, /ghp_ABCD/);
    assert.doesNotMatch(out, /Bearer eyJ/);
    assert.match(out, /\[REDACTED\]/);
    assert.equal((out.match(/\[REDACTED\]/g) ?? []).length, 3);
  });

  test("leaves ordinary text alone", () => {
    assert.equal(redactSecrets("Hello Paris"), "Hello Paris");
  });
});
