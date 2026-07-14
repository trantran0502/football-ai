/**
 * Report match_records with impliedProbability > 1 via deployed Vercel API.
 * Does NOT modify data.
 *
 * Run: npm run check:supabase-odds
 * Optional: npx tsx scripts/check-supabase-implied-probability.ts [apiUrl]
 */

const DEFAULT_API_URL =
  "https://football-ai-ten.vercel.app/api/data/match-records";

interface PollutionHit {
  recordId: string;
  fieldPath: string;
  value: number;
}

interface MatchRecordPayload {
  id: string;
  marketSelections?: unknown;
  analysisSnapshot?: {
    features?: unknown;
  } | null;
  candidates?: unknown;
}

interface ApiListResponse {
  ok: boolean;
  data: MatchRecordPayload[] | null;
  message?: string | null;
}

function walkForImpliedProbability(
  value: unknown,
  path: string,
  hits: PollutionHit[],
  recordId: string
): void {
  if (value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkForImpliedProbability(item, `${path}[${index}]`, hits, recordId);
    });
    return;
  }

  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (
        key === "impliedProbability" &&
        typeof nested === "number" &&
        nested > 1
      ) {
        hits.push({ recordId, fieldPath: nextPath, value: nested });
      } else {
        walkForImpliedProbability(nested, nextPath, hits, recordId);
      }
    }
  }
}

function inspectRecord(record: MatchRecordPayload, hits: PollutionHit[]): void {
  walkForImpliedProbability(
    record.marketSelections,
    "marketSelections",
    hits,
    record.id
  );
  walkForImpliedProbability(
    record.analysisSnapshot?.features,
    "analysisSnapshot.features",
    hits,
    record.id
  );
  walkForImpliedProbability(record.candidates, "candidates", hits, record.id);
}

async function fetchMatchRecords(apiUrl: string): Promise<MatchRecordPayload[]> {
  const response = await fetch(apiUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const bodyText = await response.text();
  let payload: ApiListResponse;
  try {
    payload = JSON.parse(bodyText) as ApiListResponse;
  } catch {
    console.error(
      JSON.stringify(
        {
          apiUrl,
          httpStatus: response.status,
          responseBody: bodyText.slice(0, 2000),
          parseError: "Response is not valid JSON.",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  if (!response.ok || !payload.ok || !Array.isArray(payload.data)) {
    console.error(
      JSON.stringify(
        {
          apiUrl,
          httpStatus: response.status,
          responseBody: payload,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  return payload.data;
}

async function main(): Promise<void> {
  const apiUrl = process.argv[2]?.trim() || DEFAULT_API_URL;
  console.log(JSON.stringify({ apiUrl }, null, 2));

  const records = await fetchMatchRecords(apiUrl);
  const hits: PollutionHit[] = [];
  const affectedRecordIds = new Set<string>();

  for (const record of records) {
    inspectRecord(record, hits);
  }

  const uniqueHits = hits.filter(
    (hit, index, array) =>
      array.findIndex(
        (item) =>
          item.recordId === hit.recordId && item.fieldPath === hit.fieldPath
      ) === index
  );

  for (const hit of uniqueHits) {
    affectedRecordIds.add(hit.recordId);
  }

  console.log(
    JSON.stringify(
      {
        totalMatchRecords: records.length,
        pollutedRecordCount: affectedRecordIds.size,
        pollutedFieldCount: uniqueHits.length,
        affectedRecordIds: [...affectedRecordIds],
        hits: uniqueHits,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});

export {};
