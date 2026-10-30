import type { CaseResult, CheckResult, Report } from "./types.js";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function msToSeconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3);
}

function failureBody(result: CaseResult): string {
  const parts: string[] = [];
  if (result.error) parts.push(result.error);
  for (const check of (result.checks ?? []).filter((c) => !c.ok)) {
    parts.push(formatCheckFailure(check));
  }
  if (parts.length === 0) parts.push("failed");
  return parts.join("\n");
}

function formatCheckFailure(check: CheckResult): string {
  const lines = [`[${check.name}] ${check.detail ?? "failed"}`];
  if (check.expected != null) lines.push(`expected: ${check.expected}`);
  if (check.actual != null) lines.push(`actual: ${check.actual}`);
  return lines.join("\n");
}

function failureMessage(result: CaseResult): string {
  if (result.error) return result.error;
  const failed = (result.checks ?? []).filter((c) => !c.ok);
  if (failed.length === 0) return "failed";
  return failed.map((c) => c.detail ?? `${c.name} failed`).join("; ");
}

function formatCase(result: CaseResult, classname: string): string {
  const attrs = [
    `name="${escapeXml(result.id)}"`,
    `classname="${escapeXml(classname)}"`,
    `time="${msToSeconds(result.duration_ms)}"`,
  ].join(" ");

  if (result.skipped) {
    return `    <testcase ${attrs}>\n      <skipped message="${escapeXml(result.error ?? "skipped")}"/>\n    </testcase>`;
  }
  if (result.ok) {
    return `    <testcase ${attrs}/>`;
  }
  const message = escapeXml(failureMessage(result));
  const body = escapeXml(failureBody(result));
  return `    <testcase ${attrs}>\n      <failure message="${message}">${body}</failure>\n    </testcase>`;
}

/** Hand-written JUnit XML for CI (Jenkins, GitHub Actions, etc.). */
export function formatJUnit(report: Report): string {
  const suiteName = report.suite?.trim() || "eval-smoke";
  const classname = suiteName;
  const tests = report.cases.length;
  const failures = report.failed;
  const skipped = report.skipped;
  const time = msToSeconds(report.duration_ms);
  const cases = report.cases.map((result) => formatCase(result, classname)).join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites name="${escapeXml(suiteName)}" tests="${tests}" failures="${failures}" skipped="${skipped}" time="${time}">`,
    `  <testsuite name="${escapeXml(suiteName)}" tests="${tests}" failures="${failures}" skipped="${skipped}" time="${time}"` +
      ` hostname="eval-smoke" timestamp="${new Date().toISOString()}">`,
    cases,
    `  </testsuite>`,
    `</testsuites>`,
    ``,
  ].join("\n");
}
