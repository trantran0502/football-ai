/**
 * Tables the application queries via Supabase admin client.
 * Probe columns must exist on each table (avoid assuming every table has `id`).
 */
export interface SupabaseTableSpec {
  name: string;
  probeColumn: string;
  category: "core" | "scheduler" | "admin" | "security" | "learning";
  migrationFile: string;
  description: string;
}

export const SUPABASE_TABLE_REGISTRY: SupabaseTableSpec[] = [
  {
    name: "match_records",
    probeColumn: "id",
    category: "core",
    migrationFile: "001_initial_p0.sql",
    description: "Historical matches; embeds fixture, market snapshot, validation, evidence JSON",
  },
  {
    name: "beta_recommendations",
    probeColumn: "id",
    category: "core",
    migrationFile: "001_initial_p0.sql",
    description: "Beta recommendation records linked to match_records",
  },
  {
    name: "beta_rolling_reports",
    probeColumn: "id",
    category: "core",
    migrationFile: "001_initial_p0.sql",
    description: "Rolling evaluation reports",
  },
  {
    name: "recommendation_learning",
    probeColumn: "id",
    category: "learning",
    migrationFile: "008_recommendation_learning.sql",
    description: "Post-verification learning rows (AI/evidence learning persistence)",
  },
  {
    name: "team_profiles",
    probeColumn: "id",
    category: "core",
    migrationFile: "005_team_profiles.sql",
    description: "Team statistical profiles",
  },
  {
    name: "execution_logs",
    probeColumn: "id",
    category: "scheduler",
    migrationFile: "003_scheduler.sql",
    description: "Scheduler run history (replaces legacy scheduler_runs spec)",
  },
  {
    name: "scheduler_state",
    probeColumn: "state_key",
    category: "scheduler",
    migrationFile: "003_scheduler.sql",
    description: "Scheduler locks and runtime state",
  },
  {
    name: "admin_daily_summaries",
    probeColumn: "summary_date",
    category: "admin",
    migrationFile: "002_admin_dashboard.sql",
    description: "Admin dashboard daily aggregates",
  },
  {
    name: "admin_system_snapshots",
    probeColumn: "snapshot_key",
    category: "admin",
    migrationFile: "002_admin_dashboard.sql",
    description: "Admin system metric snapshots",
  },
  {
    name: "admin_error_logs",
    probeColumn: "id",
    category: "admin",
    migrationFile: "002_admin_dashboard.sql",
    description: "Structured admin error logs",
  },
  {
    name: "security_rate_limit_buckets",
    probeColumn: "bucket_key",
    category: "security",
    migrationFile: "004_security_rate_limits.sql",
    description: "Supabase-backed API rate limit counters",
  },
];

/**
 * Logical entities from the recovery spec mapped to actual persistence.
 * Separate tables are NOT used when data lives in JSON columns.
 */
export const LOGICAL_ENTITY_PERSISTENCE: Array<{
  logicalName: string;
  physicalTable: string;
  physicalColumn: string;
  notes: string;
}> = [
  {
    logicalName: "fixture",
    physicalTable: "match_records",
    physicalColumn: "fixture_id + analysis_snapshot",
    notes: "fixture_id column; full fixture context in analysis_snapshot JSON",
  },
  {
    logicalName: "market_snapshot",
    physicalTable: "match_records",
    physicalColumn: "market_selections + analysis_snapshot.marketAnalysis",
    notes: "Raw odds text + normalized markets in JSON",
  },
  {
    logicalName: "recommendation",
    physicalTable: "beta_recommendations",
    physicalColumn: "candidate + match_record_id FK",
    notes: "Also mirrored in match_records.candidates / analysis_snapshot",
  },
  {
    logicalName: "validation_result",
    physicalTable: "match_records",
    physicalColumn: "verification_result",
    notes: "Post-match validation JSON on match_records",
  },
  {
    logicalName: "evidence_report",
    physicalTable: "match_records",
    physicalColumn: "analysis_snapshot / candidates evidence fields",
    notes: "Evidence engine output embedded in analysis snapshot",
  },
  {
    logicalName: "ai_learning_report",
    physicalTable: "recommendation_learning",
    physicalColumn: "provider_diagnostics + recommendation JSON",
    notes: "Analysis-only AI learning suggestions stay in-memory; verified learning persists here",
  },
  {
    logicalName: "historical_fundamentals",
    physicalTable: "match_records",
    physicalColumn: "analysis_snapshot (dataMode=historical_fundamentals)",
    notes: "Backtest snapshots only; excluded from market ROI learning",
  },
  {
    logicalName: "scheduler_runs",
    physicalTable: "execution_logs",
    physicalColumn: "job_name + started_at + context",
    notes: "Legacy spec name; code uses execution_logs",
  },
];

export const MIGRATION_FILES_ORDERED = [
  "001_initial_p0.sql",
  "002_admin_dashboard.sql",
  "003_scheduler.sql",
  "004_security_rate_limits.sql",
  "005_team_profiles.sql",
  "006_team_profile_season_metadata.sql",
  "007_historical_match_backfill.sql",
  "008_recommendation_learning.sql",
  "009_schema_recovery_verify.sql",
] as const;
