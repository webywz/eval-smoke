import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const DEFAULT_GITHUB_SUMMARY = "github-step-summary.md";

export function resolveGithubSummaryPath(
  flagPath: string | true | undefined,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string | undefined {
  if (flagPath === undefined) {
    const fromEnv = env.GITHUB_STEP_SUMMARY;
    return fromEnv && fromEnv.trim() ? fromEnv : undefined;
  }
  if (flagPath === true || flagPath === "") {
    const fromEnv = env.GITHUB_STEP_SUMMARY;
    if (fromEnv && fromEnv.trim()) return fromEnv;
    return resolve(cwd, DEFAULT_GITHUB_SUMMARY);
  }
  return resolve(cwd, flagPath);
}

export function appendGithubSummary(path: string, markdown: string): void {
  const body = markdown.endsWith("\n") ? markdown : `${markdown}\n`;
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // ignore
  }
  try {
    appendFileSync(path, body, "utf8");
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (code === "ENOENT") {
      writeFileSync(path, body, "utf8");
      return;
    }
    throw error;
  }
}
