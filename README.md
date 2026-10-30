# eval-smoke

[![npm](https://img.shields.io/npm/v/@webywz/eval-smoke?style=flat-square&color=111111&labelColor=eeeeee)](https://www.npmjs.com/package/@webywz/eval-smoke)
[![node](https://img.shields.io/node/v/@webywz/eval-smoke?style=flat-square&color=111111&labelColor=eeeeee)](https://www.npmjs.com/package/@webywz/eval-smoke)
[![license](https://img.shields.io/npm/l/@webywz/eval-smoke?style=flat-square&color=111111&labelColor=eeeeee)](./LICENSE)

> **One-minute smoke evals for prompts and models.**
>
> **一分钟烟雾测试：在发版前拦住 prompt / 模型回归。**

YAML or JSON in. Pass/fail out. Exit `1` on regression. JUnit, TAP, HTML, and latency budgets for CI.

YAML 或 JSON 进，通过/失败出。回归时退出码 `1`。JUnit、TAP、HTML、延迟预算对接 CI。

---

## English

### Demo

```bash
npm i -g @webywz/eval-smoke
eval-smoke init
eval-smoke suite.yaml --mock
```

```text
eval-smoke 0.8.0  ·  mock  ·  gpt-4o-mini  ·  smoke  ·  4 cases

  pass  greeting               0ms
  pass  capital-france         0ms
  pass  arithmetic             0ms
  pass  refuse-injection       0ms

4 passed  0 failed  1ms
```

`--mock` is offline and deterministic. CI and contributors do not need API keys.

### Features

| | |
| --- | --- |
| **Tiny suite** | A handful of cases — not a full harness |
| **Matchers** | `equals`, `contains`, `contains_any` / `contains_all`, `starts_with` / `ends_with`, `not_contains`, `regex`, `json`, `min_tokens` / `max_tokens`, `max_latency_ms`, `max_cost_usd` |
| **init** | `eval-smoke init` scaffolds a mock-friendly `suite.yaml` |
| **Filter** | `--only` by id substring or `/regex/` |
| **CI** | `--junit`, `--tap`, `--sarif`, `--html`, `--github-summary`, exit codes, `--fail-fast`, `--concurrency`; suite `budget_usd` |
| **Baseline** | `--baseline` / `--update-baseline` catch pass→fail regressions |
| **Providers** | Mock offline; live OpenAI / Anthropic when keyed; suite/CLI `ollama` / `openai-compat` + `base_url` / `--base-url` |

### Install

```bash
npm i -g @webywz/eval-smoke
# or one-off:
npx @webywz/eval-smoke suite.yaml --mock
```

Node 18+.

### Quick start

```bash
eval-smoke init
eval-smoke suite.yaml --mock
eval-smoke suite.yaml --mock --only greeting
eval-smoke suite.yaml --mock --junit junit.xml
eval-smoke suite.yaml --mock --tap
eval-smoke suite.yaml --mock --html report.html
eval-smoke examples/suite.yaml --mock --json
eval-smoke examples/suite.yaml --mock --concurrency 4
eval-smoke examples/suite.yaml --mock --update-baseline baseline.json
eval-smoke examples/suite.yaml --mock --baseline baseline.json
eval-smoke examples/suite.yaml --mock --github-summary
OPENAI_API_KEY=sk-... eval-smoke examples/suite.yaml
ANTHROPIC_API_KEY=sk-ant-... eval-smoke examples/suite.yaml --model claude-3-5-haiku-20241022
eval-smoke suite.yaml --provider ollama --base-url http://127.0.0.1:11434/v1
```

### `eval-smoke init`

```bash
eval-smoke init           # writes ./suite.yaml
eval-smoke init ./prompts # writes ./prompts/suite.yaml
eval-smoke init --force   # overwrite
```

Creates a small mock-friendly suite (greeting, capital, arithmetic, refusal). Refuses to overwrite unless `--force`.

### Suite format

YAML or JSON — a list of cases, or an object with `cases`:

```yaml
name: demo
model: gpt-4o-mini
# provider: openai          # optional: openai | anthropic | mock | ollama | openai-compat
# base_url: http://127.0.0.1:11434/v1   # for ollama / openai-compat
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
      # max_latency_ms: 5000
      # max_cost_usd: 0.01

  - id: json-city
    prompt: Reply with JSON {"city":"Paris"} only.
    expect:
      json:
        city: Paris
```

| Field | Notes |
| --- | --- |
| `id` / `prompt` | Required |
| `expect.contains` | Substring, case-insensitive; string or list |
| `expect.contains_any` | Pass if **any** needle is found (OR) |
| `expect.contains_all` | Pass if **all** needles are found (AND) |
| `expect.starts_with` / `ends_with` | Prefix / suffix; string or list (OR) |
| `expect.not_contains` | Must be absent |
| `expect.regex` | `/pattern/i`, `(?i)pattern`, or raw |
| `expect.equals` | Exact after NFC + LF normalize |
| `expect.json` | `true` = parseable; object/array = deep-equal |
| `expect.min_tokens` / `max_tokens` | Approx via `ceil(chars / 4)` |
| `expect.max_latency_ms` | Fail if measured case `duration_ms` exceeds budget |
| `expect.max_cost_usd` | Fail if estimated case cost (USD, built-in unit-price table) exceeds budget |
| `budget_usd` (suite) | Fail suite if sum of estimated case costs exceeds USD budget |
| `system` / `model` | Suite or case |
| `provider` | `openai`, `anthropic`, `mock`, `ollama`, or `openai-compat` |
| `base_url` | Local / OpenAI-compatible chat base (Ollama default `http://127.0.0.1:11434/v1`) |

At least one matcher per case. Failures print expected/actual (and a first-diff for `equals`).

### CLI

```
eval-smoke <suite.yaml|suite.json> [options]
eval-smoke init [dir] [--force]
```

| Flag | Meaning |
| --- | --- |
| `--mock` | Offline deterministic runner |
| `--json` | Machine-readable JSON report |
| `--tap` | Emit TAP version 13 on stdout (one ok/not ok per case) |
| `--junit <path>` | Write JUnit XML (still prints human report unless `--json`/`--tap`) |
| `--sarif <path>` | Write SARIF 2.1.0 for failed cases (GitHub Code Scanning) |
| `--html <path>` | Write self-contained HTML report (offline, no CDN) |
| `--redact` | Scrub secret-looking strings (`sk-`/`ghp_`/`Bearer`) in printed diffs |
| `--baseline <path>` | Exit `1` if a baseline-passing case now fails or is missing |
| `--update-baseline <path>` | Write current report JSON (pretty) to path |
| `--github-summary [path]` | Append pass/fail Markdown to `$GITHUB_STEP_SUMMARY` or path |
| `--only <pattern>` | Cases whose id contains pattern, or matches `/regex/` |
| `--fail-fast` | Stop after first failure |
| `--concurrency <n>` | Parallel cases (default 1; ignored with `--fail-fast`) |
| `--timeout <ms>` | Per-case timeout (default 30000) |
| `--model <name>` | Override suite model |
| `--provider <name>` | `openai` \| `anthropic` \| `mock` \| `ollama` \| `openai-compat` |
| `--base-url <url>` | Override suite/env base URL for ollama / openai-compat / openai |
| `--force` | Overwrite for `init` |
| `--no-color` | Disable ANSI (`NO_COLOR` respected) |

| Exit | Meaning |
| --- | --- |
| `0` | All passed |
| `1` | One or more failed |
| `2` | Usage / config error (missing file, bad YAML, no key, `--only` matched nothing) |

### Runners

**Mock** never calls the network. Canned replies keep the example suite green in CI:

| Prompt contains | Mock reply |
| --- | --- |
| `hello` | `Hello` |
| `capital of France` | `Paris` |
| `2 + 2` | `4` |
| `ignore previous` / `PWNED` | a refusal without `PWNED` |

**Live OpenAI** with `OPENAI_API_KEY` (optional `OPENAI_BASE_URL`). **Live Anthropic** with `ANTHROPIC_API_KEY`, or when the model name starts with `claude`.

### Library

```ts
import { loadSuite, runSuite, formatJUnit, formatTap, initSuite } from "@webywz/eval-smoke";

initSuite(".", { force: false });
const suite = loadSuite("suite.yaml");
const report = await runSuite(suite, { mock: true, concurrency: 4 });
console.log(formatJUnit(report));
// or: console.log(formatTap(report));
if (!report.ok) process.exit(1);
```

### CI snippet

```yaml
- run: npx @webywz/eval-smoke@0.8.0 prompts/smoke.yaml --mock --junit junit.xml
# or: npx @webywz/eval-smoke@0.8.0 prompts/smoke.yaml --mock --tap
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: junit
    path: junit.xml
```

### Links

| | |
| --- | --- |
| npm | [npmjs.com/package/@webywz/eval-smoke](https://www.npmjs.com/package/@webywz/eval-smoke) |
| Issues | [github.com/webywz/eval-smoke/issues](https://github.com/webywz/eval-smoke/issues) |
| License | [MIT](./LICENSE) © webywz |

---


### Local inference (0.9 / 0.10)

Suite fields **and** CLI for local / OpenAI-compatible servers:

```yaml
provider: ollama          # or openai-compat
base_url: http://127.0.0.1:11434/v1
model: llama3.2
```

```bash
eval-smoke suite.yaml --provider ollama --base-url http://127.0.0.1:11434/v1
eval-smoke suite.yaml --provider openai-compat --base-url http://127.0.0.1:8080/v1
```

- `ollama` — defaults `base_url` to `http://127.0.0.1:11434/v1` (no API key required)
- `openai-compat` — requires `base_url`, `--base-url`, or `OPENAI_BASE_URL`; OpenAI chat completions shape
- CLI `--provider` / `--help` list `ollama` \| `openai-compat`; `--base-url` overrides suite/env


## 中文

### 本地推理（0.9 / 0.10）

套件可设 `provider: ollama|openai-compat` 与 `base_url`；CLI 同步支持 `--provider ollama|openai-compat` 与 `--base-url`（Ollama 默认 `http://127.0.0.1:11434/v1`；`openai-compat` 需 `base_url` / `--base-url` / `OPENAI_BASE_URL`）。


### 演示

```bash
npm i -g @webywz/eval-smoke
eval-smoke init
eval-smoke suite.yaml --mock
```

`--mock` 离线、确定。CI 与贡献者不需要 API key。

### 功能

| | |
| --- | --- |
| **轻量套件** | 少量用例，不是完整评测框架 |
| **匹配器** | `equals`、`contains`、`contains_any` / `contains_all`、`starts_with` / `ends_with`、`not_contains`、`regex`、`json`、token 上下限、`max_latency_ms`、`max_cost_usd` |
| **init** | `eval-smoke init` 生成可 mock 的 `suite.yaml` |
| **过滤** | `--only`：id 子串或 `/regex/` |
| **CI** | `--junit`、`--tap`、`--sarif`、`--html`、`--github-summary`、退出码、`--fail-fast`、`--concurrency`；套件 `budget_usd` |
| **基线** | `--baseline` / `--update-baseline` 拦住 pass→fail 回归 |
| **提供商** | Mock 离线；有 key 时走 OpenAI / Anthropic；套件/CLI 支持 `ollama` / `openai-compat` + `base_url` / `--base-url` |

### 安装

```bash
npm i -g @webywz/eval-smoke
# 或一次性：
npx @webywz/eval-smoke suite.yaml --mock
```

需要 Node 18+。

### 快速开始

```bash
eval-smoke init
eval-smoke suite.yaml --mock
eval-smoke suite.yaml --mock --only greeting
eval-smoke suite.yaml --mock --junit junit.xml
eval-smoke suite.yaml --mock --tap
eval-smoke suite.yaml --mock --html report.html
eval-smoke examples/suite.yaml --mock --json
eval-smoke examples/suite.yaml --mock --concurrency 4
eval-smoke examples/suite.yaml --mock --update-baseline baseline.json
eval-smoke examples/suite.yaml --mock --baseline baseline.json
eval-smoke examples/suite.yaml --mock --github-summary
OPENAI_API_KEY=sk-... eval-smoke examples/suite.yaml
ANTHROPIC_API_KEY=sk-ant-... eval-smoke examples/suite.yaml --model claude-3-5-haiku-20241022
eval-smoke suite.yaml --provider ollama --base-url http://127.0.0.1:11434/v1
```

### `eval-smoke init`

```bash
eval-smoke init           # 写入 ./suite.yaml
eval-smoke init ./prompts # 写入 ./prompts/suite.yaml
eval-smoke init --force   # 覆盖已有文件
```

生成小型 mock 友好套件（问候、首都、算术、拒答）。不加 `--force` 不会覆盖已有文件。

### 套件格式

YAML 或 JSON —— 用例列表，或带 `cases` 的对象：

```yaml
name: demo
model: gpt-4o-mini
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
      # max_latency_ms: 5000
```

| 字段 | 说明 |
| --- | --- |
| `id` / `prompt` | 必填 |
| `expect.contains` | 子串，忽略大小写；字符串或列表 |
| `expect.contains_any` | **任一**针命中即过（OR） |
| `expect.contains_all` | **全部**针都要命中（AND） |
| `expect.starts_with` / `ends_with` | 前缀 / 后缀；字符串或列表（OR） |
| `expect.not_contains` | 不得出现 |
| `expect.regex` | `/pattern/i`、`(?i)pattern` 或裸模式 |
| `expect.equals` | NFC + LF 规范化后精确匹配 |
| `expect.json` | `true` = 可解析；对象/数组 = 深相等 |
| `expect.min_tokens` / `max_tokens` | 约 `ceil(chars / 4)` |
| `expect.max_latency_ms` | 实测 `duration_ms` 超过预算则失败 |
| `expect.max_cost_usd` | 估算费用（USD，内置单价表）超过预算则失败 |
| `budget_usd`（套件） | 全套估算费用之和超过 USD 预算则失败 |
| `system` / `model` | 套件级或用例级 |
| `provider` | `openai` / `anthropic` / `mock` / `ollama` / `openai-compat` |
| `base_url` | 本地 / OpenAI 兼容 chat 基址（Ollama 默认 `http://127.0.0.1:11434/v1`） |

每个用例至少要有一个匹配器。失败时打印期望/实际（`equals` 还有首差位置）。

### 命令行要点

| 参数 | 含义 |
| --- | --- |
| `--mock` | 离线确定性运行 |
| `--json` | JSON 报告 |
| `--tap` | 向 stdout 输出 TAP version 13（每用例一行 ok/not ok） |
| `--junit <path>` | 写出 JUnit XML（仍打印人类可读报告，除非同时 `--json`/`--tap`） |
| `--sarif <path>` | 将失败用例写成 SARIF 2.1.0（GitHub Code Scanning） |
| `--html <path>` | 写入自包含 HTML 报告（离线、无 CDN） |
| `--redact` | 打印 diff 时擦除疑似密钥（`sk-`/`ghp_`/`Bearer`） |
| `--baseline <path>` | 基线里曾通过的用例若失败或缺失则退出 `1` |
| `--update-baseline <path>` | 把当前报告 JSON（pretty）写入路径 |
| `--github-summary [path]` | 追加通过/失败 Markdown 到 `$GITHUB_STEP_SUMMARY` 或指定路径 |
| `--only <pattern>` | 按 id 子串或 `/regex/` 过滤 |
| `--fail-fast` | 首个失败即停 |
| `--concurrency <n>` | 并行用例数（默认 1） |
| `--timeout <ms>` | 单用例超时（默认 30000） |
| `--model` / `--provider` | 覆盖模型 / 提供商（`openai`/`anthropic`/`mock`/`ollama`/`openai-compat`） |
| `--base-url <url>` | 覆盖套件/环境 base URL（ollama / openai-compat / openai） |
| `--force` | `init` 时覆盖 |

| 退出码 | 含义 |
| --- | --- |
| `0` | 全部通过 |
| `1` | 有失败 |
| `2` | 用法/配置错误（缺文件、坏 YAML、无 key、`--only` 无匹配） |

### 运行器

**Mock** 永不联网。内置 canned 回复保证示例套件在 CI 里绿。

**Live OpenAI**：`OPENAI_API_KEY`（可选 `OPENAI_BASE_URL`）。**Live Anthropic**：`ANTHROPIC_API_KEY`，或模型名以 `claude` 开头。

### 库用法

```ts
import { loadSuite, runSuite, formatJUnit, formatTap, initSuite } from "@webywz/eval-smoke";

initSuite(".", { force: false });
const suite = loadSuite("suite.yaml");
const report = await runSuite(suite, { mock: true, concurrency: 4 });
console.log(formatJUnit(report));
if (!report.ok) process.exit(1);
```

### 链接

| | |
| --- | --- |
| npm | [npmjs.com/package/@webywz/eval-smoke](https://www.npmjs.com/package/@webywz/eval-smoke) |
| Issues | [github.com/webywz/eval-smoke/issues](https://github.com/webywz/eval-smoke/issues) |
| License | [MIT](./LICENSE) © webywz |
