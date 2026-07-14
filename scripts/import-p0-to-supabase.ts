import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasSupabaseEnv } from "../lib/supabase/env";
import { isP0ExportBundle } from "../lib/migration/p0ExportTypes";
import { importP0BundleToSupabase } from "../lib/supabase/services/p0ImportService";

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  let contents: string;
  try {
    contents = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: npx tsx scripts/import-p0-to-supabase.ts <export.json>");
  }

  if (!hasSupabaseEnv()) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const absolutePath = resolve(process.cwd(), filePath);
  const raw = readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!isP0ExportBundle(parsed)) {
    throw new Error("Invalid P0 export JSON format.");
  }

  const result = await importP0BundleToSupabase(parsed);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
