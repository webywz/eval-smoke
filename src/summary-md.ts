import type { Report } from "./types.js";

/** Concise pass/fail Markdown table for GitHub Actions step summary. */
export function formatGithubSummary(report: Report): string {
  const lines: string[] = [];
  lines.push(`### eval-smoke · ${escape(report.suite ?? "suite")}`);
  lines.push("");
  lines.push(
    `**${report.passed} passed · ${report.failed} failed${
      report.skipped ? ` · ${report.skipped} skipped` : ""
    } · ${report.duration_ms}ms** · \`${report.runner}\` / \`${escape(report.model)}\``,
  );
  lines.push("");
  lines.push("| Case | Result | ms |");
  lines.push("| --- | --- | ---: |");
  for (const c of report.cases) {
    const status = c.skipped ? "skip" : c.ok ? "✅ pass" : "❌ fail";
    lines.push(`| \`${escape(c.id)}\` | ${status} | ${c.duration_ms} |`);
  }
  lines.push("");
  lines.push(report.ok ? "**Suite: PASS**" : "**Suite: FAIL**");
  lines.push("");
  return lines.join("\n");
}

function escape(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
