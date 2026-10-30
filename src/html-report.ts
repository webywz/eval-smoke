import type { CaseResult, CheckResult, Report } from "./types.js";

/** Escape text for safe insertion into HTML text/attr contexts. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(text: string, max = 400): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

function failedChecks(result: CaseResult): CheckResult[] {
  return (result.checks ?? []).filter((check) => !check.ok);
}

function statusLabel(result: CaseResult): string {
  if (result.skipped) return "skip";
  return result.ok ? "pass" : "fail";
}

function statusClass(result: CaseResult): string {
  if (result.skipped) return "skip";
  return result.ok ? "pass" : "fail";
}

function failureDetails(result: CaseResult): string {
  const parts: string[] = [];
  if (result.error) parts.push(result.error);
  for (const check of failedChecks(result)) {
    const detail = check.detail ?? "failed";
    parts.push(`${check.name}: ${detail}`);
    if (check.expected != null && !detail.includes("expected:")) {
      parts.push(`expected: ${truncate(check.expected, 200)}`);
    }
    if (check.actual != null && !detail.includes("actual:")) {
      parts.push(`actual: ${truncate(check.actual, 200)}`);
    }
  }
  if (
    result.output &&
    !result.ok &&
    failedChecks(result).every((c) => c.name !== "equals")
  ) {
    parts.push(`output: ${truncate(result.output)}`);
  }
  if (!parts.length) return "";
  return `<details><summary>details</summary><pre>${escapeHtml(parts.join("\n"))}</pre></details>`;
}

/**
 * Self-contained dark HTML report for an eval-smoke run (inline CSS+JS, no CDN).
 */
export function formatHtmlReport(report: Report): string {
  const suite = escapeHtml(report.suite ?? "suite");
  const version = escapeHtml(report.version);
  const runner = escapeHtml(report.runner);
  const model = escapeHtml(report.model);
  const okClass = report.ok ? "ok" : "bad";

  const rows = report.cases
    .map((result) => {
      const st = statusClass(result);
      const details = failureDetails(result);
      return `<tr class="${st}">
  <td><span class="badge ${st}">${statusLabel(result)}</span></td>
  <td><code>${escapeHtml(result.id)}</code></td>
  <td class="num">${result.duration_ms}ms</td>
  <td class="detail">${details}</td>
</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>eval-smoke · ${suite}</title>
<style>
:root {
  --bg: #0a0a0a;
  --panel: #111111;
  --border: #222222;
  --text: #eeeeee;
  --muted: #888888;
  --pass: #7ee787;
  --fail: #ff7b72;
  --skip: #d2a8ff;
  --font: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: var(--bg); color: var(--text);
  font: 13px/1.45 var(--font);
}
body { padding: 24px 20px 48px; max-width: 960px; margin: 0 auto; }
header.top {
  border: 1px solid var(--border); background: var(--panel);
  padding: 16px 18px; margin-bottom: 16px;
}
header.top h1 { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
header.top .meta { color: var(--muted); font-size: 12px; }
header.top .summary { margin-top: 10px; font-size: 13px; }
header.top.ok .summary { color: var(--pass); }
header.top.bad .summary { color: var(--fail); }
.stats {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px; margin: 0 0 18px;
}
.stat {
  border: 1px solid var(--border); background: var(--panel);
  padding: 10px 12px;
}
.stat .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
.stat .value { margin-top: 4px; font-size: 16px; }
table {
  width: 100%; border-collapse: collapse;
  border: 1px solid var(--border); background: var(--panel);
}
th, td {
  text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border);
  vertical-align: top;
}
th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; }
td.num { text-align: right; color: var(--muted); white-space: nowrap; }
.badge {
  display: inline-block; min-width: 3.2em; text-align: center;
  padding: 1px 6px; border: 1px solid var(--border);
}
.badge.pass { color: var(--pass); border-color: #1e3d28; }
.badge.fail { color: var(--fail); border-color: #5a1d1d; }
.badge.skip { color: var(--skip); border-color: #3a2a55; }
tr.fail { background: #140a0a; }
details { margin-top: 4px; }
summary { cursor: pointer; color: var(--muted); user-select: none; }
pre {
  margin: 6px 0 0; padding: 10px; overflow: auto;
  background: #050505; border: 1px solid var(--border);
  white-space: pre-wrap; word-break: break-word; color: #d8d8d8;
}
.toolbar { margin: 0 0 12px; display: flex; gap: 8px; }
.toolbar button {
  background: var(--panel); color: var(--text); border: 1px solid var(--border);
  padding: 6px 10px; font: inherit; cursor: pointer;
}
.toolbar button:hover { border-color: #444; }
footer {
  margin-top: 28px; color: var(--muted); font-size: 11px;
  border-top: 1px solid var(--border); padding-top: 12px;
}
code { font: inherit; }
@media (max-width: 640px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
</head>
<body>
<header class="top ${okClass}">
  <h1>eval-smoke ${version}</h1>
  <div class="meta">${runner} · ${model} · ${suite} · ${report.cases.length} cases</div>
  <div class="summary">${report.passed} passed · ${report.failed} failed${
    report.skipped ? ` · ${report.skipped} skipped` : ""
  } · ${report.duration_ms}ms</div>
</header>
<section class="stats" aria-label="stats">
  <div class="stat"><div class="label">passed</div><div class="value">${report.passed}</div></div>
  <div class="stat"><div class="label">failed</div><div class="value">${report.failed}</div></div>
  <div class="stat"><div class="label">skipped</div><div class="value">${report.skipped}</div></div>
  <div class="stat"><div class="label">duration</div><div class="value">${report.duration_ms}ms</div></div>
</section>
<div class="toolbar">
  <button type="button" id="expand-all">Expand failures</button>
  <button type="button" id="collapse-all">Collapse</button>
</div>
<table>
<thead><tr><th>Status</th><th>Case</th><th>Duration</th><th>Details</th></tr></thead>
<tbody>
${rows || `<tr><td colspan="4" style="color:var(--muted)">no cases</td></tr>`}
</tbody>
</table>
<footer>Generated by eval-smoke · self-contained · works offline (file://)</footer>
<script>
(function () {
  var expand = document.getElementById("expand-all");
  var collapse = document.getElementById("collapse-all");
  function setAll(open) {
    document.querySelectorAll("details").forEach(function (d) { d.open = open; });
  }
  if (expand) expand.addEventListener("click", function () { setAll(true); });
  if (collapse) collapse.addEventListener("click", function () { setAll(false); });
})();
</script>
</body>
</html>
`;
}
