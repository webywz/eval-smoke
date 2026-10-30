import type { CaseResult, Report } from "./types.js";

export interface SarifLog {
  $schema: string;
  version: "2.1.0";
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri?: string;
        rules: Array<{ id: string; shortDescription: { text: string } }>;
      };
    };
    results: Array<{
      ruleId: string;
      level: "error" | "warning" | "note";
      message: { text: string };
      properties?: Record<string, unknown>;
    }>;
  }>;
}

function failureMessage(result: CaseResult): string {
  if (result.error) return result.error;
  const failed = (result.checks ?? []).filter((c) => !c.ok);
  if (failed.length === 0) return "failed";
  return failed.map((c) => c.detail ?? `${c.name} failed`).join("; ");
}

function oneLine(text: string, max = 240): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

/** SARIF 2.1.0 for failed (non-skipped) cases — GitHub Code Scanning upload. */
export function renderSarif(report: Report): SarifLog {
  const failed = report.cases.filter((c) => !c.ok && !c.skipped);
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "eval-smoke",
            version: report.version,
            informationUri: "https://github.com/webywz/eval-smoke",
            rules: [
              {
                id: "case-failed",
                shortDescription: { text: "Eval smoke case failed a matcher or errored" },
              },
            ],
          },
        },
        results: failed.map((result) => ({
          ruleId: "case-failed",
          level: "error" as const,
          message: { text: oneLine(`${result.id}: ${failureMessage(result)}`) },
          properties: {
            caseId: result.id,
            duration_ms: result.duration_ms,
            ...(result.cost_usd != null ? { cost_usd: result.cost_usd } : {}),
          },
        })),
      },
    ],
  };
}

export function formatSarif(report: Report): string {
  return `${JSON.stringify(renderSarif(report), null, 2)}\n`;
}
