import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { runSuite } from "../src/run.ts";
import type { CompleteFn, Suite } from "../src/types.ts";

const suite: Suite = {
  name: "unit",
  cases: [
    { id: "ok", prompt: "hello there", expect: { contains: "Hello" } },
    { id: "bad", prompt: "mystery", expect: { contains: "never-seen" } },
    { id: "later", prompt: "hello again", expect: { contains: "Hello" } },
  ],
};

describe("runSuite", () => {
  test("mock mode passes the example-shaped cases it knows", async () => {
    const report = await runSuite(
      {
        name: "demo",
        cases: [{ id: "greeting", prompt: "Say Hello please", expect: { contains: "Hello" } }],
      },
      { mock: true },
    );
    assert.equal(report.ok, true);
    assert.equal(report.runner, "mock");
    assert.equal(report.passed, 1);
  });

  test("records per-case failures without throwing", async () => {
    const report = await runSuite(suite, { mock: true });
    assert.equal(report.ok, false);
    assert.equal(report.passed, 2);
    assert.equal(report.failed, 1);
    assert.equal(report.cases[1]?.ok, false);
  });

  test("fail-fast skips remaining cases", async () => {
    let calls = 0;
    const complete: CompleteFn = async ({ prompt }) => {
      calls += 1;
      return prompt.includes("hello") ? "Hello" : "nope";
    };
    const report = await runSuite(suite, { complete, provider: "mock", failFast: true });
    assert.equal(calls, 2);
    assert.equal(report.failed, 1);
    assert.equal(report.skipped, 1);
    assert.equal(report.cases[2]?.skipped, true);
    assert.equal(report.ok, false);
  });

  test("timeouts become case failures", async () => {
    const complete: CompleteFn = ({ signal }) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve("too late"), 10_000);
        const onAbort = () => {
          clearTimeout(timer);
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      });
    const report = await runSuite(
      { cases: [{ id: "slow", prompt: "hello", expect: { contains: "Hello" } }] },
      { complete, provider: "mock", timeoutMs: 20 },
    );
    assert.equal(report.ok, false);
    assert.match(report.cases[0]?.error ?? "", /timed out/);
  });

  test("uses a custom complete function for live-shaped tests", async () => {
    const report = await runSuite(
      { cases: [{ id: "live", prompt: "ping", expect: { contains: "pong", max_tokens: 8 } }] },
      {
        provider: "openai",
        env: { OPENAI_API_KEY: "sk-test" },
        complete: async () => "pong",
      },
    );
    assert.equal(report.ok, true);
    assert.equal(report.cases[0]?.output, "pong");
  });

  test("concurrency runs cases in parallel while preserving order", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const complete: CompleteFn = async ({ prompt }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 40));
      inFlight -= 1;
      return prompt.includes("hello") ? "Hello" : "nope";
    };
    const report = await runSuite(suite, { complete, provider: "mock", concurrency: 3 });
    assert.equal(report.cases.map((c) => c.id).join(","), "ok,bad,later");
    assert.ok(maxInFlight >= 2, `expected parallel work, maxInFlight=${maxInFlight}`);
    assert.equal(report.passed, 2);
    assert.equal(report.failed, 1);
  });

  test("fail-fast forces sequential even if concurrency is set", async () => {
    let calls = 0;
    const complete: CompleteFn = async ({ prompt }) => {
      calls += 1;
      return prompt.includes("hello") ? "Hello" : "nope";
    };
    const report = await runSuite(suite, {
      complete,
      provider: "mock",
      failFast: true,
      concurrency: 8,
    });
    assert.equal(calls, 2);
    assert.equal(report.skipped, 1);
  });

});
