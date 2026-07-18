import { loadEnvConfig } from "@next/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assertSupabaseCount } from "@/lib/supabase/errors";
import { getSupabaseEnv } from "@/lib/supabase/env";

function resolveProjectUrlHost(): string {
  const { url } = getSupabaseEnv();
  return new URL(url).host;
}

function formatCause(cause: unknown): string {
  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}`;
  }
  return String(cause);
}

function formatFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const lines = [
    `error.name: ${error.name}`,
    `error.message: ${error.message}`,
    `error.stack: ${error.stack ?? "(no stack)"}`,
  ];

  if (error.cause !== undefined) {
    lines.push(`cause: ${formatCause(error.cause)}`);
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("match_records")
    .select("*", { count: "exact", head: true });

  const totalRecords = assertSupabaseCount(result);
  const projectHost = resolveProjectUrlHost();

  console.log("Connected");
  console.log(`Project URL host: ${projectHost}`);
  console.log(`Total records: ${totalRecords}`);
}

void main().catch((error) => {
  console.error(formatFailure(error));
  process.exit(1);
});
