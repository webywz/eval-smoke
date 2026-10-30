/**
 * Scrub secret-looking substrings in printed diffs / reports.
 * Patterns inspired by common API token prefixes (sk-, ghp_, Bearer).
 */
const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bghp_[A-Za-z0-9_]{8,}\b/g,
  /\bgho_[A-Za-z0-9_]{8,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-+=\/]{8,}/gi,
  /\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g,
];

const REDACTED = "[REDACTED]";

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, REDACTED);
  }
  return out;
}
