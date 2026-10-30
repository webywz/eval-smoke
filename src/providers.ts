import { UsageError, type CompleteFn, type CompleteRequest, type ProviderName } from "./types.js";

const MOCK_FIXTURES: Array<{ match: RegExp; reply: string }> = [
  { match: /\bhello\b/i, reply: "Hello" },
  { match: /capital of france/i, reply: "Paris" },
  { match: /2\s*\+\s*2/, reply: "4" },
  {
    match: /ignore (all )?previous|pwned/i,
    reply: "I cannot ignore my instructions. How can I help you?",
  },
];

export const DEFAULT_MODELS: Record<Exclude<ProviderName, "mock">, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-20241022",
  ollama: "llama3.2",
  "openai-compat": "gpt-4o-mini",
};

export function mockComplete(request: CompleteRequest): Promise<string> {
  if (request.signal.aborted) {
    return Promise.reject(signalError(request.signal));
  }
  const hit = MOCK_FIXTURES.find((fixture) => fixture.match.test(request.prompt));
  return Promise.resolve(hit?.reply ?? `[mock] No canned reply for this prompt.`);
}

function signalError(signal: AbortSignal): Error {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  if (signal.reason instanceof Error) return signal.reason;
  return err;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

export function createOpenAIComplete(
  apiKey: string,
  fetchFn: typeof fetch,
  baseUrl = "https://api.openai.com/v1",
): CompleteFn {
  return async (request) => {
    const response = await fetchFn(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: request.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages: [
          ...(request.system ? [{ role: "system", content: request.system }] : []),
          { role: "user", content: request.prompt },
        ],
        max_tokens: request.maxTokens ?? 256,
        temperature: 0,
      }),
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${summarizeError(data)}`);
    }
    const choices = data.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error("OpenAI response was missing choices");
    }
    const message = asRecord(asRecord(choices[0])?.message);
    const content = message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenAI response was missing message content");
    }
    return content;
  };
}

export function createAnthropicComplete(
  apiKey: string,
  fetchFn: typeof fetch,
  baseUrl = "https://api.anthropic.com/v1",
): CompleteFn {
  return async (request) => {
    const response = await fetchFn(`${baseUrl.replace(/\/$/, "")}/messages`, {
      method: "POST",
      signal: request.signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 256,
        temperature: 0,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
      }),
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(`Anthropic ${response.status}: ${summarizeError(data)}`);
    }
    const content = data.content;
    if (!Array.isArray(content)) {
      throw new Error("Anthropic response was missing content");
    }
    const text = content
      .map((part) => asRecord(part))
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part?.text as string)
      .join("");
    if (!text) {
      throw new Error("Anthropic response had no text content");
    }
    return text;
  };
}

function summarizeError(data: Record<string, unknown>): string {
  const err = asRecord(data.error);
  const message = err?.message ?? data.message ?? data.raw;
  if (typeof message === "string" && message.trim()) {
    return message.slice(0, 240);
  }
  return "request failed";
}

export function resolveProvider(options: {
  mock?: boolean;
  provider?: ProviderName;
  suiteProvider?: ProviderName;
  model?: string;
  env?: NodeJS.ProcessEnv;
}): ProviderName {
  if (options.mock) return "mock";
  if (options.provider) return options.provider;
  if (options.suiteProvider) return options.suiteProvider;
  const model = options.model ?? "";
  if (model.startsWith("claude")) return "anthropic";
  const env = options.env ?? process.env;
  if (env.OPENAI_API_KEY) return "openai";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  throw new UsageError(
    "No API key set. Pass --mock for an offline run, or set OPENAI_API_KEY / ANTHROPIC_API_KEY.",
  );
}

export function resolveModel(
  provider: ProviderName,
  requested?: string,
  suiteDefault?: string,
): string {
  if (requested) return requested;
  if (suiteDefault) return suiteDefault;
  if (provider === "mock") return "mock";
  return DEFAULT_MODELS[provider];
}

export function createComplete(
  provider: ProviderName,
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch,
  baseUrl?: string,
): CompleteFn {
  if (provider === "mock") return mockComplete;
  if (provider === "openai") {
    const key = env.OPENAI_API_KEY;
    if (!key) throw new UsageError("OPENAI_API_KEY is not set");
    return createOpenAIComplete(key, fetchFn, baseUrl ?? env.OPENAI_BASE_URL);
  }
  if (provider === "ollama") {
    const base =
      baseUrl ??
      env.OLLAMA_BASE_URL ??
      env.OPENAI_BASE_URL ??
      "http://127.0.0.1:11434/v1";
    const key = env.OLLAMA_API_KEY ?? env.OPENAI_API_KEY ?? "ollama";
    return createOpenAIComplete(key, fetchFn, base);
  }
  if (provider === "openai-compat") {
    const base = baseUrl ?? env.OPENAI_BASE_URL;
    if (!base) {
      throw new UsageError(
        "openai-compat requires suite base_url or OPENAI_BASE_URL (OpenAI-compatible chat endpoint)",
      );
    }
    const key = env.OPENAI_API_KEY ?? "no-key";
    return createOpenAIComplete(key, fetchFn, base);
  }
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new UsageError("ANTHROPIC_API_KEY is not set");
  return createAnthropicComplete(key, fetchFn, baseUrl ?? env.ANTHROPIC_BASE_URL);
}
