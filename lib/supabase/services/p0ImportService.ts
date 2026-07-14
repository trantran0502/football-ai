import { normalizeHistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { BetaRecommendationRecord } from "@/lib/beta/types";
import type { RollingEvaluationReport } from "@/lib/beta/types";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  createEmptyP0ImportResult,
  createEmptyP0ImportSectionResult,
  isP0ExportBundle,
  summarizeP0ImportResult,
  type P0ExportBundle,
  type P0ImportResult,
  type P0ImportSectionResult,
} from "@/lib/migration/p0ExportTypes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  assertSupabaseData,
  throwIfSupabaseError,
} from "@/lib/supabase/errors";
import type { Database } from "@/lib/supabase/database.types";
import {
  betaRecommendationDomainToRow,
} from "@/lib/supabase/mappers/betaRecommendationMapper";
import {
  betaRollingReportDomainToRow,
} from "@/lib/supabase/mappers/betaRollingReportMapper";
import {
  matchRecordDomainToRow,
} from "@/lib/supabase/mappers/matchRecordMapper";

type MatchRecordInsertRow =
  Database["public"]["Tables"]["match_records"]["Insert"];
type BetaRecommendationInsertRow =
  Database["public"]["Tables"]["beta_recommendations"]["Insert"];
type BetaRollingReportInsertRow =
  Database["public"]["Tables"]["beta_rolling_reports"]["Insert"];

function pushError(section: P0ImportSectionResult, message: string): void {
  section.failed += 1;
  section.errors.push(message);
}

async function fetchExistingIds(table: "match_records" | "beta_recommendations"): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from(table).select("id");
  throwIfSupabaseError(result.error, result.status ?? null);
  const rows = (result.data ?? []) as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
}

async function fetchExistingRollingReportKeys(): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("beta_rolling_reports")
    .select("model_version, evaluated_at");
  throwIfSupabaseError(result.error, result.status ?? null);
  const rows = (result.data ?? []) as Array<{
    model_version: string;
    evaluated_at: string;
  }>;
  return new Set(
    rows.map((row) => `${row.model_version}::${row.evaluated_at}`)
  );
}

async function importMatchRecords(
  records: HistoricalMatchRecord[],
  existingIds: Set<string>,
  availableMatchIds: Set<string>
): Promise<P0ImportSectionResult> {
  const section = createEmptyP0ImportSectionResult();
  const supabase = getSupabaseAdmin();

  for (const rawRecord of records) {
    const record = normalizeHistoricalMatchRecord(rawRecord);

    if (!record.id?.trim()) {
      pushError(section, "match_records: missing id");
      continue;
    }

    if (existingIds.has(record.id) || availableMatchIds.has(record.id)) {
      section.skipped += 1;
      continue;
    }

    try {
      const row = matchRecordDomainToRow(record, {
        source: "import",
      }) as MatchRecordInsertRow;
      const result = await supabase
        .from("match_records")
        .insert([row as never])
        .select("id")
        .single();

      throwIfSupabaseError(result.error, result.status ?? null);
      const data = assertSupabaseData(result) as { id: string };
      existingIds.add(data.id);
      availableMatchIds.add(data.id);
      section.imported += 1;
    } catch (error) {
      pushError(
        section,
        `match_records ${record.id}: ${
          error instanceof Error ? error.message : "insert failed"
        }`
      );
    }
  }

  return section;
}

async function importBetaRecommendations(
  records: BetaRecommendationRecord[],
  existingIds: Set<string>,
  availableMatchIds: Set<string>
): Promise<P0ImportSectionResult> {
  const section = createEmptyP0ImportSectionResult();
  const supabase = getSupabaseAdmin();

  for (const record of records) {
    if (!record.id?.trim()) {
      pushError(section, "beta_recommendations: missing id");
      continue;
    }

    if (existingIds.has(record.id)) {
      section.skipped += 1;
      continue;
    }

    if (!availableMatchIds.has(record.matchRecordId)) {
      pushError(
        section,
        `beta_recommendations ${record.id}: missing match_record_id ${record.matchRecordId}`
      );
      continue;
    }

    try {
      const row = betaRecommendationDomainToRow(record, {
        source: "import",
      }) as BetaRecommendationInsertRow;
      const result = await supabase
        .from("beta_recommendations")
        .insert([row as never])
        .select("id")
        .single();

      throwIfSupabaseError(result.error, result.status ?? null);
      const data = assertSupabaseData(result) as { id: string };
      existingIds.add(data.id);
      section.imported += 1;
    } catch (error) {
      pushError(
        section,
        `beta_recommendations ${record.id}: ${
          error instanceof Error ? error.message : "insert failed"
        }`
      );
    }
  }

  return section;
}

async function importRollingReports(
  reports: RollingEvaluationReport[],
  existingKeys: Set<string>
): Promise<P0ImportSectionResult> {
  const section = createEmptyP0ImportSectionResult();
  const supabase = getSupabaseAdmin();

  for (const report of reports) {
    const key = `${report.modelVersion}::${report.evaluatedAt}`;
    if (existingKeys.has(key)) {
      section.skipped += 1;
      continue;
    }

    try {
      const row = betaRollingReportDomainToRow(report, {
        source: "import",
      }) as BetaRollingReportInsertRow;
      const result = await supabase
        .from("beta_rolling_reports")
        .insert([row as never])
        .select("model_version, evaluated_at")
        .single();

      throwIfSupabaseError(result.error, result.status ?? null);
      const data = assertSupabaseData(result) as {
        model_version: string;
        evaluated_at: string;
      };
      existingKeys.add(`${data.model_version}::${data.evaluated_at}`);
      section.imported += 1;
    } catch (error) {
      pushError(
        section,
        `beta_rolling_reports ${report.modelVersion}@${report.evaluatedAt}: ${
          error instanceof Error ? error.message : "insert failed"
        }`
      );
    }
  }

  return section;
}

export async function importP0BundleToSupabase(
  bundleInput: P0ExportBundle | unknown
): Promise<P0ImportResult> {
  if (!isP0ExportBundle(bundleInput)) {
    throw new Error("Invalid P0 export bundle.");
  }

  const bundle = bundleInput;
  const result = createEmptyP0ImportResult();

  const existingMatchIds = await fetchExistingIds("match_records");
  const availableMatchIds = new Set(existingMatchIds);

  result.matchRecords = await importMatchRecords(
    bundle.data.matchRecords,
    existingMatchIds,
    availableMatchIds
  );

  const existingBetaIds = await fetchExistingIds("beta_recommendations");
  result.betaRecommendations = await importBetaRecommendations(
    bundle.data.betaRecommendations,
    existingBetaIds,
    availableMatchIds
  );

  const existingRollingKeys = await fetchExistingRollingReportKeys();
  result.betaRollingReports = await importRollingReports(
    bundle.data.betaRollingReports,
    existingRollingKeys
  );

  result.totals = summarizeP0ImportResult(result);
  return result;
}
