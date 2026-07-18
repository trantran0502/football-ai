import { loadEnvConfig } from "@next/env";
import pg from "pg";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!dbUrl) {
    console.log(JSON.stringify({ error: "SUPABASE_DB_URL not configured" }));
    return;
  }

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const tables = await client.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `);

    const counts: Record<string, number> = {};
    for (const row of tables.rows) {
      const table = row.table_name as string;
      const countRes = await client.query(`select count(*)::text as c from public."${table}"`);
      counts[table] = Number(countRes.rows[0]?.c ?? 0);
    }

    const matchColumns = await client.query(`
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'match_records'
      order by ordinal_position
    `);

    const indexes = await client.query(`
      select tablename, indexname, indexdef
      from pg_indexes
      where schemaname = 'public'
      order by tablename, indexname
    `);

    const fks = await client.query(`
      select tc.table_name, kcu.column_name, ccu.table_name as foreign_table, ccu.column_name as foreign_column, rc.delete_rule
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
      join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
      join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
    `);

    const rls = await client.query(`
      select schemaname, tablename, rowsecurity
      from pg_tables
      where schemaname = 'public'
      order by tablename
    `);

    const policies = await client.query(`
      select schemaname, tablename, policyname, cmd, roles
      from pg_policies
      where schemaname = 'public'
      order by tablename, policyname
    `);

    console.log(
      JSON.stringify(
        {
          tableCounts: counts,
          matchRecordsColumns: matchColumns.rows,
          foreignKeys: fks.rows,
          rlsEnabled: rls.rows,
          rlsPolicies: policies.rows,
          indexCount: indexes.rows.length,
          indexesSample: indexes.rows.slice(0, 20),
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
