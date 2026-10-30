import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { checkBaseline, loadBaseline, writeBaseline } from "./baseline.js";
import { appendGithubSummary, resolveGithubSummaryPath } from "./github-summary.js";
import { initSuite } from "./init.js";
import { formatJUnit } from "./junit.js";
import { loadSuite } from "./load-suite.js";
import { compileRegex } from "./matchers.js";
import { formatHtmlReport } from "./html-report.js";
import { redactSecrets } from "./redact.js";
import { formatReport } from "./report.js";
import { formatTap } from "./tap.js";
import { DEFAULT_TIMEOUT_MS, runSuite } from "./run.js";
import { formatGithubSummary } from "./summary-md.js";
import { UsageError, type ProviderName, type Suite } from "./types.js";
import { VERSION } from "./version.js";

/** Sentinel so node:util accepts a bare --github-summary flag. */
const GITHUB_SUMMARY_AUTO = "__auto__";

export const HELP = `eval-smoke — one-minute smoke evals for prompts and models

Usage:
  eval-smoke <suite.yaml|suite.json> [options]
  eval-smoke init [dir] [--force]

Options:
  --mock              Offline runner with deterministic fake answers
  --json              Machine-readable JSON report
  --tap               Emit TAP version 13 on stdout (one ok/not ok per case)
  --junit <path>      Write JUnit XML report to path (still prints human report unless --json/--tap)
  --html <path>       Write self-contained HTML report to path (offline, no CDN)
  --redact            Scrub secret-looking strings (sk-/ghp_/Bearer) in printed diffs
  --only <pattern>    Run cases whose id contains pattern, or matches /regex/
  --fail-fast         Stop after the first failing case
  --concurrency <n>   Run up to N cases in parallel (default: 1; ignored with --fail-fast)
  --timeout <ms>      Per-case timeout (default: ${DEFAULT_TIMEOUT_MS})
  --model <name>      Override suite model
  --provider <name>   openai | anthropic | mock
  --baseline <path>   Fail if any baseline-passing case now fails or is missing
  --update-baseline <path>  Write current report JSON to path (pretty)
  --github-summary [path]   Append Markdown to GITHUB_STEP_SUMMARY or path
  --force             Overwrite existing suite.yaml when using init
  --no-color          Disable ANSI colors (also respects NO_COLOR)
  -h, --help          Show this help
  -v, --version       Show version

Exit codes:
  0  all cases passed (and baseline clean when --baseline is set)
  1  one or more cases failed, or baseline regression
  2  usage or configuration error

Examples:
  eval-smoke init
  eval-smoke init ./prompts --force
  eval-smoke examples/suite.yaml --mock
  eval-smoke examples/suite.yaml --mock --only greeting
  eval-smoke examples/suite.yaml --mock --only '/^capital/'
  eval-smoke examples/suite.yaml --mock --junit junit.xml
  eval-smoke examples/suite.yaml --mock --tap
  eval-smoke examples/suite.yaml --mock --html report.html
  eval-smoke examples/suite.yaml --json --fail-fast
  eval-smoke examples/suite.yaml --mock --concurrency 4
  eval-smoke examples/suite.yaml --mock --update-baseline baseline.json
  eval-smoke examples/suite.yaml --mock --baseline baseline.json
  eval-smoke examples/suite.yaml --mock --github-summary
  OPENAI_API_KEY=sk-... eval-smoke examples/suite.yaml
`;

export interface CliIo {
  stdout: { write(text: string): void };
  stderr: { write(text: string): void };
  env: NodeJS.ProcessEnv;
  cwd: string;
  isTTY: boolean;
}

const defaultIo = (): CliIo => ({
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
  cwd: process.cwd(),
  isTTY: Boolean(process.stdout.isTTY),
});

function parseTimeout(raw: string | undefined): number {
  if (raw == null) return DEFAULT_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new UsageError("--timeout must be a positive integer (milliseconds)");
  }
  return value;
}

function parseConcurrency(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new UsageError("--concurrency must be a positive integer");
  }
  return value;
}

function parseProvider(raw: string | undefined): ProviderName | undefined {
  if (raw == null) return undefined;
  if (raw === "mock" || raw === "openai" || raw === "anthropic") return raw;
  throw new UsageError("--provider must be openai, anthropic, or mock");
}

/** Match case ids by substring, or by /regex/ flags (same style as matchers). */
export function matchOnly(id: string, pattern: string): boolean {
  const wrapped = pattern.match(/^\/([\s\S]+)\/([gimsuy]*)$/);
  if (wrapped?.[1] != null) {
    const re = compileRegex(pattern);
    re.lastIndex = 0;
    return re.test(id);
  }
  return id.includes(pattern);
}

export function filterSuiteByOnly(suite: Suite, pattern: string): Suite {
  const cases = suite.cases.filter((testCase) => matchOnly(testCase.id, pattern));
  if (cases.length === 0) {
    throw new UsageError(`--only ${JSON.stringify(pattern)} matched 0 cases`);
  }
  return { ...suite, cases };
}

/**
 * Rewrite bare `--github-summary` into `--github-summary=__auto__` so node:util
 * parseArgs (string option) accepts it. `--github-summary=path` and
 * `--github-summary path` stay as-is.
 */
export function normalizeGithubSummaryArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token === "--github-summary") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        out.push(`--github-summary=${GITHUB_SUMMARY_AUTO}`);
      } else {
        out.push("--github-summary", next);
        i += 1;
      }
      continue;
    }
    out.push(token);
  }
  return out;
}

function githubSummaryFlag(raw: string | undefined): string | true | undefined {
  if (raw == null) return undefined;
  if (raw === GITHUB_SUMMARY_AUTO) return true;
  return raw;
}

export async function runCli(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: normalizeGithubSummaryArgv(argv),
      allowPositionals: true,
      strict: true,
      options: {
        mock: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        tap: { type: "boolean", default: false },
        junit: { type: "string" },
        html: { type: "string" },
        redact: { type: "boolean", default: false },
        only: { type: "string" },
        "fail-fast": { type: "boolean", default: false },
        concurrency: { type: "string" },
        timeout: { type: "string" },
        model: { type: "string" },
        provider: { type: "string" },
        baseline: { type: "string" },
        "update-baseline": { type: "string" },
        "github-summary": { type: "string" },
        force: { type: "boolean", default: false },
        "no-color": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const { values, positionals } = parsed;
  const asString = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;
  const asBool = (value: unknown): boolean => value === true;

  if (asBool(values.help)) {
    io.stdout.write(HELP);
    return 0;
  }
  if (asBool(values.version)) {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (positionals[0] === "init") {
    try {
      const target = positionals[1];
      const result = initSuite(target, { force: asBool(values.force), cwd: io.cwd });
      io.stdout.write(`Created ${result.file}\n`);
      io.stdout.write(`Next: eval-smoke ${result.file} --mock\n`);
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr.write(`${message}\n`);
      return error instanceof UsageError ? error.exitCode : 2;
    }
  }

  const suitePath = positionals[0];
  if (!suitePath) {
    io.stderr.write("Missing suite file.\n\n");
    io.stderr.write(HELP);
    return 2;
  }

  try {
    const json = asBool(values.json);
    const only = asString(values.only);
    const junitPath = asString(values.junit);
    const htmlPath = asString(values.html);
    const baselinePath = asString(values.baseline);
    const updateBaselinePath = asString(values["update-baseline"]);
    const githubSummary = githubSummaryFlag(asString(values["github-summary"]));

    let suite = loadSuite(suitePath, io.cwd);
    if (only != null) {
      suite = filterSuiteByOnly(suite, only);
    }
    const report = await runSuite(suite, {
      mock: asBool(values.mock),
      provider: parseProvider(asString(values.provider)),
      model: asString(values.model),
      failFast: asBool(values["fail-fast"]),
      concurrency: parseConcurrency(asString(values.concurrency)),
      timeoutMs: parseTimeout(asString(values.timeout)),
      env: io.env,
    });
    if (junitPath != null) {
      const out = resolve(io.cwd, junitPath);
      writeFileSync(out, formatJUnit(report), "utf8");
    }
    if (htmlPath != null) {
      const out = resolve(io.cwd, htmlPath);
      writeFileSync(out, formatHtmlReport(report), "utf8");
    }
    if (updateBaselinePath != null) {
      const out = resolve(io.cwd, updateBaselinePath);
      writeBaseline(out, report);
      io.stderr.write(`Wrote baseline ${out}\n`);
    }

    let baselineFailed = false;
    if (baselinePath != null) {
      const baseline = loadBaseline(resolve(io.cwd, baselinePath));
      const check = checkBaseline(report, baseline);
      io.stderr.write(check.report);
      if (!check.ok) baselineFailed = true;
    }

    const outSummary =
      githubSummary === undefined
        ? resolveGithubSummaryPath(undefined, io.env, io.cwd)
        : resolveGithubSummaryPath(githubSummary, io.env, io.cwd);
    if (outSummary) {
      try {
        appendGithubSummary(outSummary, formatGithubSummary(report));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        io.stderr.write(`could not write github summary: ${message}\n`);
      }
    }

    const tap = asBool(values.tap);
    const redact = asBool(values.redact);
    const noColor = asBool(values["no-color"]) || Boolean(io.env.NO_COLOR);
    const color = io.isTTY && !json && !tap && !noColor;

    if (tap) {
      const tapOut = formatTap(report);
      io.stdout.write(redact ? redactSecrets(tapOut) : tapOut);
    } else {
      io.stdout.write(formatReport(report, { json, color, redact }));
    }
    if (baselineFailed) return 1;
    return report.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n`);
    return error instanceof UsageError ? error.exitCode : 2;
  }
}
