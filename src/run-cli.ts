import { parseArgs } from "node:util";
import { loadSuite } from "./load-suite.js";
import { formatReport } from "./report.js";
import { DEFAULT_TIMEOUT_MS, runSuite } from "./run.js";
import { UsageError, type ProviderName } from "./types.js";
import { VERSION } from "./version.js";

export const HELP = `eval-smoke — one-minute smoke evals for prompts and models

Usage:
  eval-smoke <suite.yaml|suite.json> [options]

Options:
  --mock              Offline runner with deterministic fake answers
  --json              Machine-readable JSON report
  --fail-fast         Stop after the first failing case
  --timeout <ms>      Per-case timeout (default: ${DEFAULT_TIMEOUT_MS})
  --model <name>      Override suite model
  --provider <name>   openai | anthropic | mock
  -h, --help          Show this help
  -v, --version       Show version

Exit codes:
  0  all cases passed
  1  one or more cases failed
  2  usage or configuration error

Examples:
  eval-smoke examples/suite.yaml --mock
  eval-smoke examples/suite.yaml --json --fail-fast
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

function parseProvider(raw: string | undefined): ProviderName | undefined {
  if (raw == null) return undefined;
  if (raw === "mock" || raw === "openai" || raw === "anthropic") return raw;
  throw new UsageError("--provider must be openai, anthropic, or mock");
}

export async function runCli(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        mock: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        "fail-fast": { type: "boolean", default: false },
        timeout: { type: "string" },
        model: { type: "string" },
        provider: { type: "string" },
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

  const suitePath = positionals[0];
  if (!suitePath) {
    io.stderr.write("Missing suite file.\n\n");
    io.stderr.write(HELP);
    return 2;
  }

  try {
    const json = asBool(values.json);
    const suite = loadSuite(suitePath, io.cwd);
    const report = await runSuite(suite, {
      mock: asBool(values.mock),
      provider: parseProvider(asString(values.provider)),
      model: asString(values.model),
      failFast: asBool(values["fail-fast"]),
      timeoutMs: parseTimeout(asString(values.timeout)),
      env: io.env,
    });
    const color = io.isTTY && !json && !io.env.NO_COLOR;
    io.stdout.write(formatReport(report, { json, color }));
    return report.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n`);
    return error instanceof UsageError ? error.exitCode : 2;
  }
}
