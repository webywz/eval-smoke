import type { CaseResult, CheckResult, Report } from "./types.js";

const RESET = "\u001b[0m";
const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const DIM = "\u001b[2m";

export interface FormatOptions {
  json?: boolean;
  color?: boolean;
}

function paint(enabled: boolean, color: string, text: string): string {
  return enabled ? `${color}${text}${RESET}` : text;
}

function truncate(text: string, max = 220): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

function failedChecks(result: CaseResult): CheckResult[] {
  return (result.checks ?? []).filter((check) => !check.ok);
}

function formatCase(result: CaseResult, color: boolean): string[] {
  const ms = `${result.duration_ms}ms`;
  if (result.skipped) {
    return [`  ${paint(color, YELLOW, "skip")}  ${result.id.padEnd(22)} ${paint(color, DIM, ms)}`];
  }
  if (result.ok) {
    return [`  ${paint(color, GREEN, "pass")}  ${result.id.padEnd(22)} ${paint(color, DIM, ms)}`];
  }

  const lines = [`  ${paint(color, RED, "fail")}  ${result.id.padEnd(22)} ${paint(color, DIM, ms)}`];
  if (result.error) {
    lines.push(`        ${result.error}`);
  }
  for (const check of failedChecks(result)) {
    lines.push(`        ${check.name}: ${check.detail ?? "failed"}`);
  }
  if (result.output) {
    lines.push(`        output: ${truncate(result.output)}`);
  }
  return lines;
}

export function formatReport(report: Report, options: FormatOptions = {}): string {
  if (options.json) {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  const color = Boolean(options.color);
  const bits = [
    `eval-smoke ${report.version}`,
    report.runner,
    report.model,
    report.suite,
    `${report.cases.length} cases`,
  ].filter(Boolean);
  const lines = [paint(color, DIM, bits.join("  ·  ")), ""];

  for (const result of report.cases) {
    lines.push(...formatCase(result, color));
  }

  const summary = `${report.passed} passed  ${report.failed} failed${
    report.skipped ? `  ${report.skipped} skipped` : ""
  }  ${report.duration_ms}ms`;
  lines.push("");
  lines.push(report.ok ? paint(color, GREEN, summary) : paint(color, RED, summary));
  lines.push("");
  return lines.join("\n");
}
