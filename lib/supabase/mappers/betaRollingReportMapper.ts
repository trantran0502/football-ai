import type { RollingEvaluationReport } from "@/lib/beta/types";
import type {
  BetaRollingReportInsert,
  BetaRollingReportRow,
} from "@/lib/supabase/database.types";

export interface RollingReportRecord extends RollingEvaluationReport {
  id: string;
  source: string;
  schemaVersion: number;
  createdAt: string;
}

export function betaRollingReportRowToDomain(
  row: BetaRollingReportRow
): RollingReportRecord {
  return {
    ...row.report,
    id: row.id,
    source: row.source,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
  };
}

export function betaRollingReportDomainToRow(
  report: RollingEvaluationReport,
  options?: { source?: string; schemaVersion?: number }
): BetaRollingReportInsert {
  return {
    model_version: report.modelVersion,
    evaluated_at: report.evaluatedAt,
    window_size: report.windowSize,
    report,
    source: options?.source ?? "app",
    schema_version: options?.schemaVersion ?? 1,
  };
}
