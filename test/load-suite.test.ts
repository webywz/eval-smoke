import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadSuite, parseSuite } from "../src/load-suite.ts";
import { UsageError } from "../src/types.ts";
import { fixtures, repoRoot } from "./helpers.ts";
import { join } from "node:path";

describe("parseSuite", () => {
  test("accepts a bare list of cases", () => {
    const suite = parseSuite([
      { id: "a", prompt: "hi", expect: { contains: "Hello" } },
    ]);
    assert.equal(suite.cases.length, 1);
    assert.equal(suite.cases[0]?.id, "a");
  });

  test("accepts an object with metadata", () => {
    const suite = parseSuite({
      name: "demo",
      model: "gpt-4o-mini",
      provider: "openai",
      system: "Be brief.",
      cases: [{ id: "a", prompt: "hi", expect: { regex: "/hello/i" } }],
    });
    assert.equal(suite.name, "demo");
    assert.equal(suite.provider, "openai");
    assert.equal(suite.system, "Be brief.");
  });

  test("accepts a single case object", () => {
    const suite = parseSuite({
      id: "solo",
      prompt: "Hello?",
      expect: { contains: "Hello" },
    });
    assert.equal(suite.cases[0]?.id, "solo");
  });

  test("rejects duplicate ids", () => {
    assert.throws(
      () =>
        parseSuite([
          { id: "a", prompt: "1", expect: { contains: "x" } },
          { id: "a", prompt: "2", expect: { contains: "y" } },
        ]),
      UsageError,
    );
  });

  test("rejects empty expect", () => {
    assert.throws(
      () => parseSuite([{ id: "a", prompt: "1", expect: {} }]),
      /at least one/,
    );
  });

  test("rejects invalid regex at load time", () => {
    assert.throws(
      () => parseSuite([{ id: "a", prompt: "1", expect: { regex: "(" } }]),
      /invalid regex/,
    );
  });

  test("rejects empty suites", () => {
    assert.throws(() => parseSuite({ cases: [] }), /no cases/);
  });
  test("accepts equals, json, and min_tokens", () => {
    const suite = parseSuite([
      {
        id: "a",
        prompt: "hi",
        expect: { equals: "Hello", json: true, min_tokens: 1, max_tokens: 8 },
      },
    ]);
    assert.equal(suite.cases[0]?.expect.equals, "Hello");
    assert.equal(suite.cases[0]?.expect.json, true);
    assert.equal(suite.cases[0]?.expect.min_tokens, 1);
  });

  test("accepts json object expect", () => {
    const suite = parseSuite([
      { id: "a", prompt: "hi", expect: { json: { city: "Paris" } } },
    ]);
    assert.deepEqual(suite.cases[0]?.expect.json, { city: "Paris" });
  });

  test("rejects min_tokens greater than max_tokens", () => {
    assert.throws(
      () =>
        parseSuite([
          { id: "a", prompt: "1", expect: { min_tokens: 10, max_tokens: 2 } },
        ]),
      /cannot exceed max_tokens/,
    );
  });

});

describe("loadSuite", () => {
  test("loads YAML object suites from disk", () => {
    const suite = loadSuite("examples/suite.yaml", repoRoot);
    assert.equal(suite.name, "demo");
    assert.equal(suite.cases.length, 7);
  });

  test("loads a YAML list", () => {
    const suite = loadSuite(join(fixtures, "list.yaml"));
    assert.equal(suite.cases[0]?.id, "only");
  });

  test("loads JSON suites", () => {
    const suite = loadSuite("examples/suite.json", repoRoot);
    assert.equal(suite.name, "demo-json");
  });

  test("errors on a missing file", () => {
    assert.throws(() => loadSuite("nope.yaml", fixtures), /not found/);
  });

  test("errors on duplicate ids in a file", () => {
    assert.throws(() => loadSuite(join(fixtures, "bad-id.yaml")), /Duplicate case id/);
  });
});
