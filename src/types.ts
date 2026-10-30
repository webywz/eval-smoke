export type ProviderName = "mock" | "openai" | "anthropic";

export type StringList = string | string[];

/** JSON expectation: `true` = must parse; object/array = deep-equal after parse. */
export type JsonExpect = true | Record<string, unknown> | unknown[];

export interface Expect {
  contains?: StringList;
  not_contains?: StringList;
  /** Pass if ANY needle is found (case-insensitive). */
  contains_any?: StringList;
  /** Pass if ALL needles are found (case-insensitive). */
  contains_all?: StringList;
  /** Pass if output starts with any needle (case-insensitive). */
  starts_with?: StringList;
  /** Pass if output ends with any needle (case-insensitive). */
  ends_with?: StringList;
  regex?: StringList;
  /** Exact string match (Unicode NFC, LF newlines). Trailing newline stripped on both sides. */
  equals?: string;
  /** Output must be valid JSON; optionally deep-equal a structure. */
  json?: JsonExpect;
  max_tokens?: number;
  min_tokens?: number;
}

export interface Case {
  id: string;
  prompt: string;
  system?: string;
  model?: string;
  expect: Expect;
}

export interface Suite {
  name?: string;
  model?: string;
  provider?: ProviderName;
  system?: string;
  cases: Case[];
}

export interface CompleteRequest {
  prompt: string;
  system?: string;
  model: string;
  maxTokens?: number;
  signal: AbortSignal;
}

export type CompleteFn = (request: CompleteRequest) => Promise<string>;

export type CheckName =
  | "contains"
  | "not_contains"
  | "contains_any"
  | "contains_all"
  | "starts_with"
  | "ends_with"
  | "regex"
  | "equals"
  | "json"
  | "max_tokens"
  | "min_tokens";

export interface CheckResult {
  name: CheckName;
  ok: boolean;
  expected: string;
  /** Compact actual value for reports / diffs. */
  actual?: string;
  detail?: string;
}

export interface CaseResult {
  id: string;
  ok: boolean;
  skipped?: boolean;
  duration_ms: number;
  output?: string;
  error?: string;
  checks?: CheckResult[];
}

export interface Report {
  ok: boolean;
  version: string;
  runner: ProviderName;
  model: string;
  suite?: string;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  cases: CaseResult[];
}

export interface RunOptions {
  mock?: boolean;
  provider?: ProviderName;
  model?: string;
  failFast?: boolean;
  timeoutMs?: number;
  /** Run up to N cases at once (default 1). Ignored when failFast is set. */
  concurrency?: number;
  complete?: CompleteFn;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}

export class UsageError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}
