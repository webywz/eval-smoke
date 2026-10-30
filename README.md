# eval-smoke

One-minute smoke evals for prompts and models.

Full eval harnesses are heavy. `eval-smoke` is the tiny local suite you run before a ship: a handful of cases, pass/fail, exit code 1 on regression. YAML or JSON in, a CI-friendly report out — including optional JUnit XML.

```bash
npm i -g @webywz/eval-smoke
eval-smoke init
eval-smoke suite.yaml --mock
```

```
eval-smoke 0.3.0  ·  mock  ·  gpt-4o-mini  ·  smoke  ·  4 cases

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

1. Scaffold a suite with `eval-smoke init`, or copy the example.
2. Run mock mode until the runner and matchers look right.
3. Point the same file at a live model when you are ready.

```bash
eval-smoke init
eval-smoke suite.yaml --mock
eval-smoke suite.yaml --mock --only greeting
eval-smoke suite.yaml --mock --junit junit.xml
eval-smoke examples/suite.yaml --mock --json
eval-smoke examples/suite.yaml --mock --concurrency 4
OPENAI_API_KEY=sk-... eval-smoke examples/suite.yaml
ANTHROPIC_API_KEY=sk-ant-... eval-smoke examples/suite.yaml --model claude-3-5-haiku-20241022
```

## `eval-smoke init`

```bash
eval-smoke init           # writes ./suite.yaml
eval-smoke init ./prompts # writes ./prompts/suite.yaml
eval-smoke init --force   # overwrite an existing suite.yaml
```

Creates a small mock-friendly suite (greeting, capital, arithmetic, refusal). Refuses to overwrite unless you pass `--force`.

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
      equals: Hello
      contains: Hello
      not_contains: Goodbye
      regex: "(?i)^hello\\b"
      min_tokens: 1
      max_tokens: 32

  - id: json-city
    prompt: Reply with JSON {"city":"Paris"} only.
    expect:
      json:
        city: Paris
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
| `expect.equals` | case | Exact match after NFC + LF normalize; one trailing newline ignored. |
| `expect.json` | case | `true` = must parse as JSON; object/array = deep-equal after parse. |
| `expect.min_tokens` | case | Approximate floor using `ceil(chars / 4)`. |
| `expect.max_tokens` | case | Approximate cap using `ceil(chars / 4)`. |
| `system` | suite or case | Optional system prompt for live providers. |
| `model` | suite or case | Live default: `gpt-4o-mini` or `claude-3-5-haiku-20241022`. |
| `provider` | suite | `openai`, `anthropic`, or `mock`. |

At least one matcher is required on every case. Failed checks print expected/actual (and a first-diff pointer for `equals`).

## CLI

```
eval-smoke <suite.yaml|suite.json> [options]
eval-smoke init [dir] [--force]

  --mock              Offline runner with deterministic fake answers
  --json              Machine-readable JSON report
  --junit <path>      Write JUnit XML to path (still prints human report unless --json)
  --only <pattern>    Run cases whose id contains pattern, or matches /regex/
  --fail-fast         Stop after the first failing case
  --concurrency <n>   Run up to N cases in parallel (default: 1; ignored with --fail-fast)
  --timeout <ms>      Per-case timeout (default: 30000)
  --model <name>      Override suite model
  --provider <name>   openai | anthropic | mock
  --force             Overwrite existing suite.yaml for init
  --no-color          Disable ANSI colors (also respects NO_COLOR)
  -h, --help
  -v, --version
```

| Exit | Meaning |
| --- | --- |
| 0 | Every case passed |
| 1 | One or more cases failed |
| 2 | Usage or configuration error (missing file, bad YAML, no API key, `--only` matched nothing) |

### `--only`

Filter cases by `id` before running:

```bash
eval-smoke suite.yaml --mock --only greeting          # substring
eval-smoke suite.yaml --mock --only '/^capital/'       # /regex/ (same style as matchers)
eval-smoke suite.yaml --mock --only '/hello/i'
```

Exits `2` if zero cases match.

### `--junit`

After a run, write a JUnit XML report for CI while still printing the human (or `--json`) report to stdout:

```bash
eval-smoke suite.yaml --mock --junit reports/junit.xml
```

Failures include matcher detail (`expected` / `actual` / `detail`). Skipped cases (e.g. `--fail-fast`) become `<skipped/>`.

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
  "version": "0.3.0",
  "runner": "mock",
  "model": "gpt-4o-mini",
  "suite": "demo",
  "passed": 5,
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

Failed checks may include `actual` plus a multi-line `detail` (first-diff for `equals`).

## Programmatic API

```ts
import { loadSuite, runSuite, formatJUnit, initSuite } from "@webywz/eval-smoke";

initSuite(".", { force: false });
const suite = loadSuite("suite.yaml");
const report = await runSuite(suite, { mock: true, concurrency: 4 });
console.log(formatJUnit(report));
if (!report.ok) process.exit(1);
```

`runSuite` also accepts a custom `complete` function, which is how the tests inject fakes without keys.

## CI

GitHub Actions in this repo runs `npm test`, `npm run build`, and `eval-smoke examples/suite.yaml --mock` on Node 18/20/22. Drop this into another project:

```yaml
- run: npx @webywz/eval-smoke@0.3.0 prompts/smoke.yaml --mock --junit junit.xml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: junit
    path: junit.xml
```

## License

MIT
