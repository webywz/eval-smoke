# eval-smoke

One-minute smoke evals for prompts and models.

Full eval harnesses are heavy. `eval-smoke` is the tiny local suite you run before a ship: a handful of cases, pass/fail, exit code 1 on regression. YAML or JSON in, a CI-friendly report out.

```bash
npm i -g @webywz/eval-smoke
eval-smoke examples/suite.yaml --mock
```

```
eval-smoke 0.1.1  ·  mock  ·  gpt-4o-mini  ·  demo  ·  4 cases

  pass  greeting               0ms
  pass  capital-france         0ms
  pass  arithmetic             0ms
  pass  refuse-injection       0ms

4 passed  0 failed  1ms
```

`--mock` is offline and deterministic. Contributors and CI do not need API keys.

## Install

```bash
npm i -g @webywz/eval-smoke
# or, from a project:
npx @webywz/eval-smoke suite.yaml --mock
```

Requires Node 18+.

## 60-second start

1. Copy the example suite, or write three cases you actually care about.
2. Run mock mode until the runner and matchers look right.
3. Point the same file at a live model when you are ready.

```bash
eval-smoke examples/suite.yaml --mock
eval-smoke examples/suite.yaml --mock --json
OPENAI_API_KEY=sk-... eval-smoke examples/suite.yaml
ANTHROPIC_API_KEY=sk-ant-... eval-smoke examples/suite.yaml --model claude-3-5-haiku-20241022
```

## Suite format

A suite is a YAML or JSON list of cases, or an object with a `cases` array.

```yaml
name: demo
model: gpt-4o-mini
# provider: openai          # optional: openai | anthropic | mock
# system: You are concise.
cases:
  - id: greeting
    prompt: Reply with exactly the word Hello.
    expect:
      contains: Hello
      not_contains: Goodbye
      regex: "(?i)^hello\\b"
      max_tokens: 32
```

A bare list is also valid:

```yaml
- id: capital-france
  prompt: What is the capital of France? Answer with the city name only.
  expect:
    contains: Paris
```

| Field | Where | Notes |
| --- | --- | --- |
| `id` | case | Required, unique. |
| `prompt` | case | Required. |
| `expect.contains` | case | Substring, case-insensitive. String or list; all must match. |
| `expect.not_contains` | case | Substring must be absent. String or list. |
| `expect.regex` | case | JavaScript regex. `/pattern/i`, `(?i)pattern`, or a raw pattern. |
| `expect.max_tokens` | case | Approximate cap using `ceil(chars / 4)`. |
| `system` | suite or case | Optional system prompt for live providers. |
| `model` | suite or case | Live default: `gpt-4o-mini` or `claude-3-5-haiku-20241022`. |
| `provider` | suite | `openai`, `anthropic`, or `mock`. |

At least one matcher is required on every case.

## CLI

```
eval-smoke <suite.yaml|suite.json> [options]

  --mock              Offline runner with deterministic fake answers
  --json              Machine-readable JSON report
  --fail-fast         Stop after the first failing case
  --timeout <ms>      Per-case timeout (default: 30000)
  --model <name>      Override suite model
  --provider <name>   openai | anthropic | mock
  -h, --help
  -v, --version
```

| Exit | Meaning |
| --- | --- |
| 0 | Every case passed |
| 1 | One or more cases failed |
| 2 | Usage or configuration error (missing file, bad YAML, no API key) |

## Runners

**Mock** (`--mock` or `--provider mock`) never calls a network. It returns canned replies matched from the prompt so the example suite stays green in CI:

| Prompt contains | Mock reply |
| --- | --- |
| `hello` | `Hello` |
| `capital of France` | `Paris` |
| `2 + 2` | `4` |
| `ignore previous` / `PWNED` | a refusal that does not contain `PWNED` |

Anything else returns `[mock] No canned reply for this prompt.` — useful as a deliberate fail.

**Live OpenAI** when `OPENAI_API_KEY` is set. Optional `OPENAI_BASE_URL` for compatible servers.

**Live Anthropic** when `ANTHROPIC_API_KEY` is set, or when the model name starts with `claude`.

If no key is set and you did not pass `--mock`, the CLI exits 2 with a short hint.

## JSON report

```bash
eval-smoke examples/suite.yaml --mock --json
```

```json
{
  "ok": true,
  "version": "0.1.1",
  "runner": "mock",
  "model": "gpt-4o-mini",
  "suite": "demo",
  "passed": 4,
  "failed": 0,
  "skipped": 0,
  "duration_ms": 1,
  "cases": [
    {
      "id": "greeting",
      "ok": true,
      "duration_ms": 1,
      "output": "Hello",
      "checks": [{ "name": "contains", "ok": true, "expected": "Hello" }]
    }
  ]
}
```

## Programmatic API

```ts
import { loadSuite, runSuite } from "@webywz/eval-smoke";

const suite = loadSuite("examples/suite.yaml");
const report = await runSuite(suite, { mock: true });
if (!report.ok) process.exit(1);
```

`runSuite` also accepts a custom `complete` function, which is how the tests inject fakes without keys.

## CI

GitHub Actions in this repo runs `npm test`, `npm run build`, and `eval-smoke examples/suite.yaml --mock` on Node 18/20/22. Drop this into another project:

```yaml
- run: npx @webywz/eval-smoke@0.1.1 prompts/smoke.yaml --mock
```

## License

MIT
