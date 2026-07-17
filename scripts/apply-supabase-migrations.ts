import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { loadEnvLocal } from "@/lib/healthCheck/productionHealthCheckRunner";
import { MIGRATION_FILES_ORDERED } from "@/lib/supabase/schemaRegistry";

/**
 * Applies Supabase SQL migrations when SUPABASE_DB_URL is configured.
 * Requires: npm install pg (devDependency)
 *
 * Rollback: migrations are additive only; rollback is manual DROP TABLE if needed.
 */
async function main(): Promise<void> {
  loadEnvLocal();

  const dbUrl =
    process.env.SUPABASE_DB_URL?.trim() ??
    process.env.DATABASE_URL?.trim() ??
    "";

  if (!dbUrl) {
    console.error("MANUAL ACTION REQUIRED");
    console.error("Missing SUPABASE_DB_URL or DATABASE_URL.");
    console.error("Get the Postgres connection string from Supabase Dashboard → Project Settings → Database.");
    console.error("Then run migrations manually in SQL Editor, in order:");
    for (const file of MIGRATION_FILES_ORDERED) {
      console.error(`  supabase/migrations/${file}`);
    }
    process.exit(1);
  }

  let pg: typeof import("pg");
  try {
    pg = await import("pg");
  } catch {
    console.error("MANUAL ACTION REQUIRED");
    console.error("Install pg devDependency: npm install --save-dev pg @types/pg");
    console.error("Or paste SQL files from supabase/migrations/ into Supabase SQL Editor.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  const files = MIGRATION_FILES_ORDERED.filter((name) => {
    try {
      readFileSync(resolve(migrationsDir, name), "utf8");
      return true;
    } catch {
      return false;
    }
  });

  console.log(`Applying ${files.length} migration file(s)...`);

  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    console.log(`→ ${file}`);
    await client.query(sql);
  }

  await client.end();
  console.log("Migrations applied successfully.");
}

main().catch((error) => {
  console.error("Migration apply failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
