import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseSuite } from "../src/load-suite.ts";
import {
  createComplete,
  createOpenAIComplete,
  DEFAULT_MODELS,
  resolveModel,
  resolveProvider,
} from "../src/providers.ts";
import { UsageError } from "../src/types.ts";
import { jsonResponse } from "./helpers.ts";

const idle = new AbortController().signal;

describe("suite local inference (0.9)", () => {
  test("parses provider ollama|openai-compat and base_url", () => {
    const suite = parseSuite({
      name: "local",
      provider: "ollama",
      base_url: "http://127.0.0.1:11434/v1",
      model: "llama3.2",
      cases: [{ id: "hi", prompt: "Say Hello", expect: { contains: "Hello" } }],
    });
    assert.equal(suite.provider, "ollama");
    assert.equal(suite.base_url, "http://127.0.0.1:11434/v1");

    const compat = parseSuite({
      provider: "openai-compat",
      base_url: "http://localhost:8080/v1",
      cases: [{ id: "a", prompt: "x", expect: { contains: "x" } }],
    });
    assert.equal(compat.provider, "openai-compat");
    assert.equal(compat.base_url, "http://localhost:8080/v1");
  });

  test("rejects unknown provider", () => {
    assert.throws(
      () =>
        parseSuite({
          provider: "vllm",
          cases: [{ id: "a", prompt: "x", expect: { contains: "x" } }],
        }),
      UsageError,
    );
  });

  test("default models for local providers", () => {
    assert.equal(DEFAULT_MODELS.ollama, "llama3.2");
    assert.equal(resolveModel("ollama"), "llama3.2");
    assert.equal(resolveModel("openai-compat"), "gpt-4o-mini");
  });

  test("resolveProvider honors suite ollama", () => {
    assert.equal(resolveProvider({ suiteProvider: "ollama", env: {} }), "ollama");
    assert.equal(
      resolveProvider({ suiteProvider: "openai-compat", env: {} }),
      "openai-compat",
    );
  });

  test("createComplete ollama uses default local base and needs no key", async () => {
    let hit = "";
    const complete = createComplete(
      "ollama",
      {},
      async (url) => {
        hit = String(url);
        return jsonResponse({ choices: [{ message: { content: "Hello" } }] });
      },
    );
    const out = await complete({ prompt: "Say Hello", model: "llama3.2", signal: idle });
    assert.equal(out, "Hello");
    assert.match(hit, /127\.0\.0\.1:11434\/v1\/chat\/completions/);
  });

  test("createComplete openai-compat requires base_url", () => {
    assert.throws(() => createComplete("openai-compat", {}), /base_url|OPENAI_BASE_URL/);
  });

  test("createComplete openai-compat hits suite base_url", async () => {
    let hit = "";
    const complete = createComplete(
      "openai-compat",
      {},
      async (url) => {
        hit = String(url);
        return jsonResponse({ choices: [{ message: { content: "ok" } }] });
      },
      "http://localhost:9999/v1",
    );
    const out = await complete({ prompt: "hi", model: "local", signal: idle });
    assert.equal(out, "ok");
    assert.match(hit, /localhost:9999\/v1\/chat\/completions/);
  });

  test("createOpenAIComplete still accepts custom base", async () => {
    const complete = createOpenAIComplete("sk", async (url) => {
      assert.match(String(url), /example\.com\/v1\/chat\/completions/);
      return jsonResponse({ choices: [{ message: { content: "z" } }] });
    }, "https://example.com/v1");
    assert.equal(await complete({ prompt: "p", model: "m", signal: idle }), "z");
  });
});
