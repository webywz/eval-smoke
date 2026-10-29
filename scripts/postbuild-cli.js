import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SHEBANG = "#!/usr/bin/env node";
const cliPath = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
if (!existsSync(cliPath)) {
  throw new Error(`postbuild: missing ${cliPath}; run tsc first`);
}
const source = readFileSync(cliPath, "utf8");
const body = source.startsWith("#!") ? source.slice(source.indexOf("\n") + 1) : source;
const next = `${SHEBANG}\n${body}`;
if (next !== source) {
  writeFileSync(cliPath, next);
}
chmodSync(cliPath, 0o755);
