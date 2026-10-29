export type ProviderName = "mock" | "openai" | "anthropic";

export type StringList = string | string[];

export interface Expect {
  contains?: StringList;
  not_contains?: StringList;
  regex?: StringList;
  max_tokens?: number;
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

export interface CheckResult {
  name: "contains" | "not_contains" | "regex" | "max_tokens";
  ok: boolean;
  expected: string;
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
