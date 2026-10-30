import type { CaseResult, CheckResult, Report } from "./types.js";

/** Escape a TAP description (no # that would start a directive). */
function tapDesc(text: string): string {
  return text.replace(/#/g, "\\#").replace(/\r?\n/g, " ");
}

function failureMessage(result: CaseResult): string {
  if (result.error) return result.error;
  const failed = (result.checks ?? []).filter((c) => !c.ok);
  if (failed.length === 0) return "failed";
  return failed.map((c) => c.detail ?? `${c.name} failed`).join("; ");
}

function yamlScalar(text: string): string {
  // Prefer literal block for multiline; otherwise JSON-quote for safety.
  if (!text.includes("\n") && !text.includes(":") && !/^[\s-]/.test(text)) {
    return text;
  }
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return `|\n${lines.map((line) => `      ${line}`).join("\n")}`;
}

function formatDiagnostics(result: CaseResult): string[] {
  const lines: string[] = ["  ---"];
  lines.push(`  message: ${yamlScalar(failureMessage(result))}`);
  const failed = (result.checks ?? []).filter((c) => !c.ok);
  if (failed.length) {
    lines.push("  checks:");
    for (const check of failed) {
      lines.push(...formatCheckYaml(check));
    }
  }
  if (result.duration_ms != null) {
    lines.push(`  duration_ms: ${result.duration_ms}`);
  }
  lines.push("  ...");
  return lines;
}

function formatCheckYaml(check: CheckResult): string[] {
  const out = [`    - name: ${check.name}`];
  if (check.detail) out.push(`      detail: ${yamlScalar(check.detail)}`);
  if (check.expected != null) out.push(`      expected: ${yamlScalar(check.expected)}`);
  if (check.actual != null) out.push(`      actual: ${yamlScalar(check.actual)}`);
  return out;
}

function formatCase(result: CaseResult, index: number): string[] {
  const n = index + 1;
  const desc = tapDesc(result.id);
  if (result.skipped) {
    const reason = result.error ? ` # SKIP ${tapDesc(result.error)}` : " # SKIP";
    return [`ok ${n} - ${desc}${reason}`];
  }
  if (result.ok) {
    return [`ok ${n} - ${desc}`];
  }
  return [`not ok ${n} - ${desc}`, ...formatDiagnostics(result)];
}

/** TAP version 13 report — one ok/not ok per case (CI-friendly). */
export function formatTap(report: Report): string {
  const lines = ["TAP version 13", `1..${report.cases.length}`];
  report.cases.forEach((result, index) => {
    lines.push(...formatCase(result, index));
  });
  lines.push("");
  return lines.join("\n");
}
