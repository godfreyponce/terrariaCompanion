import { readFileSync } from "node:fs";

export function loadEnvFile(file: string): void {
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}
