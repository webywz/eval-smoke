import { readFileSync, writeFileSync } from "node:fs";
import type { Report } from "./types.js";
import { UsageError } from "./types.js";

export interface BaselineCase {
  id: string;
  ok: boolean;
}

export interface BaselineFile {
  cases: BaselineCase[];
}

/** Minimal shape: case id → ok. Accepts a full Report or a slim baseline. */
export function loadBaseline(path: string): Map<string, boolean> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (code === "ENOENT") throw new UsageError(`baseline not found: ${path}`);
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError(`baseline is not valid JSON: ${path}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new UsageError(`baseline must be a JSON object: ${path}`);
  }
  const cases = (parsed as { cases?: unknown }).cases;
  if (!Array.isArray(cases)) {
    throw new UsageError(`baseline missing cases[]: ${path}`);
  }
  const map = new Map<string, boolean>();
  for (const entry of cases) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as { id?: unknown }).id;
    const ok = (entry as { ok?: unknown }).ok;
    if (typeof id !== "string" || !id) continue;
    if (typeof ok !== "boolean") continue;
    map.set(id, ok);
  }
  return map;
}

export interface BaselineCheck {
  ok: boolean;
  regressions: string[];
  /** Human-readable lines */
  report: string;
}

/**
 * Fail if any case that passed in baseline now fails, or a baseline case is missing
 * from the current run. New cases are OK. Skipped current cases that passed in
 * baseline count as missing/regression.
 */
export function checkBaseline(report: Report, baseline: Map<string, boolean>): BaselineCheck {
  const byId = new Map(report.cases.map((c) => [c.id, c]));
  const regressions: string[] = [];

  for (const [id, wasOk] of baseline) {
    if (!wasOk) continue; // only guard formerly-passing cases
    const current = byId.get(id);
    if (!current) {
      regressions.push(`${id}: missing from current run (passed in baseline)`);
      continue;
    }
    if (current.skipped) {
      regressions.push(`${id}: skipped now (passed in baseline)`);
      continue;
    }
    if (!current.ok) {
      regressions.push(`${id}: was pass, now fail`);
    }
  }

  const lines = ["baseline check:"];
  if (regressions.length === 0) {
    lines.push("  ok — no regressions vs baseline");
  } else {
    lines.push(`  ${regressions.length} regression(s):`);
    for (const line of regressions) {
      lines.push(`  - ${line}`);
    }
  }
  lines.push("");

  return { ok: regressions.length === 0, regressions, report: lines.join("\n") };
}

/** Pretty-print current report JSON for --update-baseline. */
export function writeBaseline(path: string, report: Report): void {
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
