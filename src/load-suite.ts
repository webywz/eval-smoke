import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { asList, compileRegex, hasMatchers } from "./matchers.js";
import {
  UsageError,
  type Case,
  type Expect,
  type JsonExpect,
  type ProviderName,
  type Suite,
} from "./types.js";

const PROVIDERS = new Set<ProviderName>(["mock", "openai", "anthropic", "ollama", "openai-compat"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new UsageError(`${label} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value == null) return undefined;
  return asString(value, label);
}

function parseStringList(value: unknown, label: string): string | string[] | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    if (value === "") throw new UsageError(`${label} must not be empty`);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) throw new UsageError(`${label} must not be an empty list`);
    return value.map((item, index) => asString(item, `${label}[${index}]`));
  }
  throw new UsageError(`${label} must be a string or list of strings`);
}

function parsePositiveInt(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new UsageError(`${label} must be a positive integer`);
  }
  return value;
}

function parsePositiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new UsageError(`${label} must be a positive number`);
  }
  return value;
}

function parseJsonExpect(value: unknown, caseId: string): JsonExpect | undefined {
  if (value == null) return undefined;
  if (value === true) return true;
  if (value === false) {
    throw new UsageError(`Case "${caseId}" expect.json cannot be false (use true or a JSON value)`);
  }
  if (Array.isArray(value) || isRecord(value)) {
    return value as JsonExpect;
  }
  // Allow JSON-encoded strings for convenience in YAML
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed === true) return true;
      if (Array.isArray(parsed) || isRecord(parsed)) return parsed as JsonExpect;
    } catch {
      // fall through
    }
    throw new UsageError(
      `Case "${caseId}" expect.json must be true, an object, an array, or a JSON string of those`,
    );
  }
  throw new UsageError(`Case "${caseId}" expect.json must be true, an object, or an array`);
}

function parseExpect(raw: unknown, caseId: string): Expect {
  if (!isRecord(raw)) {
    throw new UsageError(`Case "${caseId}" is missing a valid expect object`);
  }

  const expect: Expect = {
    contains: parseStringList(raw.contains, `Case "${caseId}" expect.contains`),
    not_contains: parseStringList(raw.not_contains, `Case "${caseId}" expect.not_contains`),
    contains_any: parseStringList(raw.contains_any, `Case "${caseId}" expect.contains_any`),
    contains_all: parseStringList(raw.contains_all, `Case "${caseId}" expect.contains_all`),
    starts_with: parseStringList(raw.starts_with, `Case "${caseId}" expect.starts_with`),
    ends_with: parseStringList(raw.ends_with, `Case "${caseId}" expect.ends_with`),
    regex: parseStringList(raw.regex, `Case "${caseId}" expect.regex`),
  };

  if (raw.equals != null) {
    expect.equals = asString(raw.equals, `Case "${caseId}" expect.equals`);
  }

  const json = parseJsonExpect(raw.json, caseId);
  if (json !== undefined) expect.json = json;

  if (raw.max_tokens != null) {
    expect.max_tokens = parsePositiveInt(raw.max_tokens, `Case "${caseId}" expect.max_tokens`);
  }
  if (raw.min_tokens != null) {
    expect.min_tokens = parsePositiveInt(raw.min_tokens, `Case "${caseId}" expect.min_tokens`);
  }
  if (raw.max_latency_ms != null) {
    expect.max_latency_ms = parsePositiveInt(
      raw.max_latency_ms,
      `Case "${caseId}" expect.max_latency_ms`,
    );
  }
  if (raw.max_cost_usd != null) {
    expect.max_cost_usd = parsePositiveNumber(
      raw.max_cost_usd,
      `Case "${caseId}" expect.max_cost_usd`,
    );
  }

  if (
    expect.min_tokens != null &&
    expect.max_tokens != null &&
    expect.min_tokens > expect.max_tokens
  ) {
    throw new UsageError(
      `Case "${caseId}" expect.min_tokens (${expect.min_tokens}) cannot exceed max_tokens (${expect.max_tokens})`,
    );
  }

  if (!hasMatchers(expect)) {
    throw new UsageError(
      `Case "${caseId}" expect needs at least one of contains, not_contains, contains_any, contains_all, starts_with, ends_with, regex, equals, json, min_tokens, max_tokens, max_latency_ms, max_cost_usd`,
    );
  }

  for (const rawRegex of asList(expect.regex)) {
    try {
      compileRegex(rawRegex);
    } catch {
      throw new UsageError(`Case "${caseId}" has an invalid regex: ${rawRegex}`);
    }
  }

  return expect;
}

function parseCase(raw: unknown, index: number): Case {
  if (!isRecord(raw)) {
    throw new UsageError(`Case at index ${index} must be an object`);
  }
  const id = asString(raw.id, `Case at index ${index} id`);
  return {
    id,
    prompt: asString(raw.prompt, `Case "${id}" prompt`),
    system: optionalString(raw.system, `Case "${id}" system`),
    model: optionalString(raw.model, `Case "${id}" model`),
    expect: parseExpect(raw.expect, id),
  };
}

function parseProvider(value: unknown): ProviderName | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string" || !PROVIDERS.has(value as ProviderName)) {
    throw new UsageError(`provider must be one of ${[...PROVIDERS].join(", ")}`);
  }
  return value as ProviderName;
}

export function parseSuite(raw: unknown): Suite {
  let name: string | undefined;
  let model: string | undefined;
  let provider: ProviderName | undefined;
  let base_url: string | undefined;
  let system: string | undefined;
  let budget_usd: number | undefined;
  let caseList: unknown[];

  if (Array.isArray(raw)) {
    caseList = raw;
  } else if (isRecord(raw)) {
    name = optionalString(raw.name, "suite name");
    model = optionalString(raw.model, "suite model");
    provider = parseProvider(raw.provider);
    base_url = optionalString(raw.base_url, "suite base_url");
    system = optionalString(raw.system, "suite system");
    if (raw.budget_usd != null) {
      budget_usd = parsePositiveNumber(raw.budget_usd, "suite budget_usd");
    }
    if (raw.cases == null && "id" in raw && "prompt" in raw) {
      caseList = [raw];
    } else if (!Array.isArray(raw.cases)) {
      throw new UsageError("Suite must be a list of cases or an object with a cases array");
    } else {
      caseList = raw.cases;
    }
  } else {
    throw new UsageError("Suite must be a YAML/JSON list or object");
  }

  if (caseList.length === 0) {
    throw new UsageError("Suite has no cases");
  }

  const cases = caseList.map((item, index) => parseCase(item, index));
  const seen = new Set<string>();
  for (const testCase of cases) {
    if (seen.has(testCase.id)) {
      throw new UsageError(`Duplicate case id "${testCase.id}"`);
    }
    seen.add(testCase.id);
  }

  return { name, model, provider, base_url, system, budget_usd, cases };
}

function parseDocument(text: string, source: string): unknown {
  const body = text.replace(/^\uFEFF/, "");
  const ext = extname(source).toLowerCase();
  try {
    if (ext === ".json") return JSON.parse(body) as unknown;
    if (ext === ".yaml" || ext === ".yml") return parseYaml(body);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UsageError(`Failed to parse ${source}: ${reason}`);
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    try {
      return parseYaml(body);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new UsageError(`Failed to parse ${source}: ${reason}`);
    }
  }
}

export function loadSuite(path: string, cwd = process.cwd()): Suite {
  const file = resolve(cwd, path);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new UsageError(`Suite file not found: ${file}`);
  }
  return parseSuite(parseDocument(text, file));
}
