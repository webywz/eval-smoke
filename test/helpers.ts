import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { CliIo } from "../src/run-cli.ts";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const fixtures = join(repoRoot, "test", "fixtures");

export function captureIo(env: NodeJS.ProcessEnv = {}): {
  io: CliIo;
  stdout: () => string;
  stderr: () => string;
} {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: {
        write(text: string) {
          stdout += text;
        },
      },
      stderr: {
        write(text: string) {
          stderr += text;
        },
      },
      env: { ...process.env, NO_COLOR: "1", ...env },
      cwd: repoRoot,
      isTTY: false,
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
