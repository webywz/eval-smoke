import { estimateCostUsd, sumCostUsd } from "./cost.js";
import { evaluateCase } from "./matchers.js";
import { createComplete, resolveModel, resolveProvider } from "./providers.js";
import type { CaseResult, CompleteFn, Report, RunOptions, Suite } from "./types.js";
import { UsageError } from "./types.js";
import { VERSION } from "./version.js";

const DEFAULT_TIMEOUT_MS = 30_000;

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" && error !== null && (error as { name?: string }).name === "TimeoutError")
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function timeoutError(timeoutMs: number): Error {
  const error = new Error(`timed out after ${timeoutMs}ms`);
  error.name = "TimeoutError";
  return error;
}

async function withTimeout<T>(timeoutMs: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = timeoutError(timeoutMs);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runCase(
  suite: Suite,
  caseIndex: number,
  complete: CompleteFn,
  model: string,
  timeoutMs: number,
): Promise<CaseResult> {
  const testCase = suite.cases[caseIndex];
  if (!testCase) {
    throw new Error(`Missing case at index ${caseIndex}`);
  }
  const started = performance.now();
  const caseModel = testCase.model ?? model;
  try {
    const output = await withTimeout(timeoutMs, (signal) =>
      complete({
        prompt: testCase.prompt,
        system: testCase.system ?? suite.system,
        model: caseModel,
        maxTokens: testCase.expect.max_tokens,
        signal,
      }),
    );
    const duration_ms = Math.round(performance.now() - started);
    const estimate = estimateCostUsd({
      model: caseModel,
      prompt: testCase.prompt,
      system: testCase.system ?? suite.system,
      output,
    });
    const checks = evaluateCase(output, testCase, {
      durationMs: duration_ms,
      costUsd: estimate.costUsd,
    });
    return {
      id: testCase.id,
      ok: checks.every((check) => check.ok),
      duration_ms,
      output,
      checks,
      cost_usd: estimate.costUsd,
    };
  } catch (error) {
    const timedOut = isAbortError(error);
    const estimate = estimateCostUsd({
      model: caseModel,
      prompt: testCase.prompt,
      system: testCase.system ?? suite.system,
      output: "",
    });
    return {
      id: testCase.id,
      ok: false,
      duration_ms: Math.round(performance.now() - started),
      error: timedOut ? `timed out after ${timeoutMs}ms` : errorMessage(error),
      cost_usd: estimate.costUsd,
    };
  }
}

function resolveConcurrency(options: RunOptions): number {
  const raw = options.concurrency ?? 1;
  if (!Number.isInteger(raw) || raw < 1) {
    throw new UsageError("concurrency must be a positive integer");
  }
  if (options.failFast) return 1;
  return raw;
}

async function runSequential(
  suite: Suite,
  complete: CompleteFn,
  model: string,
  timeoutMs: number,
  failFast: boolean,
): Promise<CaseResult[]> {
  const cases: CaseResult[] = [];
  for (let index = 0; index < suite.cases.length; index += 1) {
    const result = await runCase(suite, index, complete, model, timeoutMs);
    cases.push(result);
    if (!result.ok && failFast) {
      for (let rest = index + 1; rest < suite.cases.length; rest += 1) {
        const skipped = suite.cases[rest];
        if (!skipped) continue;
        cases.push({
          id: skipped.id,
          ok: false,
          skipped: true,
          duration_ms: 0,
          error: "skipped (fail-fast)",
        });
      }
      break;
    }
  }
  return cases;
}

async function runConcurrent(
  suite: Suite,
  complete: CompleteFn,
  model: string,
  timeoutMs: number,
  concurrency: number,
): Promise<CaseResult[]> {
  const results: CaseResult[] = new Array(suite.cases.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= suite.cases.length) return;
      results[index] = await runCase(suite, index, complete, model, timeoutMs);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, suite.cases.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function runSuite(suite: Suite, options: RunOptions = {}): Promise<Report> {
  const env = options.env ?? process.env;
  const runner = resolveProvider({
    mock: options.mock,
    provider: options.provider,
    suiteProvider: suite.provider,
    model: options.model ?? suite.model,
    env,
  });
  const model = resolveModel(runner, options.model, suite.model);
  const complete = options.complete ?? createComplete(runner, env, options.fetch ?? globalThis.fetch);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const concurrency = resolveConcurrency(options);
  const started = performance.now();

  const cases =
    concurrency === 1
      ? await runSequential(suite, complete, model, timeoutMs, Boolean(options.failFast))
      : await runConcurrent(suite, complete, model, timeoutMs, concurrency);

  const passed = cases.filter((item) => item.ok).length;
  const skipped = cases.filter((item) => item.skipped).length;
  const failed = cases.length - passed - skipped;
  const cost_usd = sumCostUsd(cases.map((c) => c.cost_usd ?? 0));
  const budget_usd = suite.budget_usd;
  const underBudget = budget_usd == null || cost_usd <= budget_usd;

  return {
    ok: failed === 0 && skipped === 0 && underBudget,
    version: VERSION,
    runner,
    model,
    suite: suite.name,
    passed,
    failed,
    skipped,
    duration_ms: Math.round(performance.now() - started),
    cost_usd,
    ...(budget_usd != null ? { budget_usd } : {}),
    cases,
  };
}

export { DEFAULT_TIMEOUT_MS };
