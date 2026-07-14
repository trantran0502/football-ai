import {
  areSameFixture,
  dedupeMatchRecords,
  hasHomeAwayDirectionConflict,
  hasScoreConflict,
} from "@/lib/hybrid/matchComparison";
import type {
  HybridCitation,
  HybridConflict,
  HybridField,
  HybridMatchRecord,
  HybridOriginSource,
  HybridSourceValue,
} from "@/lib/hybrid/hybridTypes";

const AGREEMENT_BOOST = 0.12;
const CONFLICT_PENALTY = 0.25;
const SINGLE_SOURCE_BASE: Record<Exclude<HybridOriginSource, "hybrid" | "supabase">, number> = {
  apiFootball: 0.85,
  googleSearch: 0.65,
};

export function mergeHybridField<T>(
  field: string,
  api: HybridSourceValue<T> | null,
  google: HybridSourceValue<T> | null
): HybridField<T> {
  if (!api && !google) {
    return emptyHybridField<T>();
  }

  if (api && !google) {
    return {
      value: api.value,
      source: api.source,
      fetchedAt: api.fetchedAt,
      confidence: api.confidence,
      citations: api.citations,
      conflicts: [],
    };
  }

  if (!api && google) {
    return {
      value: google.value,
      source: google.source,
      fetchedAt: google.fetchedAt,
      confidence: google.confidence,
      citations: google.citations,
      conflicts: [],
    };
  }

  const apiValue = api!.value;
  const googleValue = google!.value;

  if (deepEqual(apiValue, googleValue)) {
    return {
      value: apiValue,
      source: "hybrid",
      fetchedAt: latestTimestamp(api!.fetchedAt, google!.fetchedAt),
      confidence: clampConfidence(
        Math.max(api!.confidence, google!.confidence) + AGREEMENT_BOOST
      ),
      citations: mergeCitations(api!.citations, google!.citations),
      conflicts: [],
    };
  }

  const conflicts: HybridConflict[] = [
    {
      field,
      message: `${field} values differ between API-Football and Google Search; no source is assumed correct.`,
      sources: ["apiFootball", "googleSearch"],
      apiValue,
      googleValue,
    },
  ];

  return {
    value: null,
    source: "hybrid",
    fetchedAt: latestTimestamp(api!.fetchedAt, google!.fetchedAt),
    confidence: clampConfidence(
      Math.min(api!.confidence, google!.confidence) - CONFLICT_PENALTY
    ),
    citations: mergeCitations(api!.citations, google!.citations),
    conflicts,
  };
}

export function mergeMatchRecordLists(
  field: string,
  apiRecords: HybridMatchRecord[],
  googleRecords: HybridMatchRecord[],
  apiMeta: Omit<HybridSourceValue<HybridMatchRecord[]>, "value"> | null,
  googleMeta: Omit<HybridSourceValue<HybridMatchRecord[]>, "value"> | null
): HybridField<HybridMatchRecord[]> {
  const conflicts: HybridConflict[] = [];
  const merged: HybridMatchRecord[] = [];
  const consumedGoogle = new Set<number>();

  for (const apiRecord of dedupeMatchRecords(apiRecords)) {
    const googleIndex = googleRecords.findIndex((googleRecord, index) => {
      if (consumedGoogle.has(index)) {
        return false;
      }
      return areSameFixture(apiRecord, googleRecord, 1);
    });

    if (googleIndex === -1) {
      merged.push(apiRecord);
      continue;
    }

    consumedGoogle.add(googleIndex);
    const googleRecord = googleRecords[googleIndex];

    if (hasHomeAwayDirectionConflict(apiRecord, googleRecord)) {
      conflicts.push({
        field,
        message: `${field} fixture ${apiRecord.matchDate} has reversed home/away direction between sources.`,
        sources: ["apiFootball", "googleSearch"],
        apiValue: apiRecord,
        googleValue: googleRecord,
      });
      merged.push(apiRecord);
      continue;
    }

    if (hasScoreConflict(apiRecord, googleRecord)) {
      conflicts.push({
        field,
        message: `${field} fixture ${apiRecord.matchDate} has conflicting scores; neither source is assumed correct for that score.`,
        sources: ["apiFootball", "googleSearch"],
        apiValue: apiRecord,
        googleValue: googleRecord,
      });
      merged.push({
        ...apiRecord,
        homeGoals: null,
        awayGoals: null,
      });
      continue;
    }

    merged.push(apiRecord);
  }

  for (let index = 0; index < googleRecords.length; index += 1) {
    if (consumedGoogle.has(index)) {
      continue;
    }
    merged.push(googleRecords[index]);
  }

  const deduped = dedupeMatchRecords(merged);
  const hasApi = apiRecords.length > 0;
  const hasGoogle = googleRecords.length > 0;

  if (!hasApi && !hasGoogle) {
    return emptyHybridField<HybridMatchRecord[]>();
  }

  if (hasApi && !hasGoogle) {
    return {
      value: deduped,
      source: "apiFootball",
      fetchedAt: apiMeta?.fetchedAt ?? new Date().toISOString(),
      confidence: apiMeta?.confidence ?? SINGLE_SOURCE_BASE.apiFootball,
      citations: apiMeta?.citations ?? [],
      conflicts,
    };
  }

  if (!hasApi && hasGoogle) {
    return {
      value: deduped,
      source: "googleSearch",
      fetchedAt: googleMeta?.fetchedAt ?? new Date().toISOString(),
      confidence: googleMeta?.confidence ?? SINGLE_SOURCE_BASE.googleSearch,
      citations: googleMeta?.citations ?? [],
      conflicts,
    };
  }

  const agreementRatio =
    conflicts.length === 0
      ? 1
      : Math.max(0, 1 - conflicts.length / Math.max(deduped.length, 1));

  return {
    value: deduped,
    source: conflicts.length > 0 ? "hybrid" : "hybrid",
    fetchedAt: latestTimestamp(
      apiMeta?.fetchedAt ?? "",
      googleMeta?.fetchedAt ?? ""
    ),
    confidence: clampConfidence(
      conflicts.length === 0
        ? Math.max(
            apiMeta?.confidence ?? SINGLE_SOURCE_BASE.apiFootball,
            googleMeta?.confidence ?? SINGLE_SOURCE_BASE.googleSearch
          ) + AGREEMENT_BOOST
        : Math.min(
            apiMeta?.confidence ?? SINGLE_SOURCE_BASE.apiFootball,
            googleMeta?.confidence ?? SINGLE_SOURCE_BASE.googleSearch
          ) -
            CONFLICT_PENALTY * (1 - agreementRatio)
    ),
    citations: mergeCitations(apiMeta?.citations ?? [], googleMeta?.citations ?? []),
    conflicts,
  };
}

export function createSourceValue<T>(
  source: Exclude<HybridOriginSource, "hybrid" | "supabase">,
  value: T,
  fetchedAt: string,
  citations: HybridCitation[] = [],
  query?: string
): HybridSourceValue<T> {
  return {
    value,
    source,
    fetchedAt,
    confidence: SINGLE_SOURCE_BASE[source],
    citations,
    query,
  };
}

function emptyHybridField<T>(): HybridField<T> {
  return {
    value: null,
    source: "hybrid",
    fetchedAt: new Date().toISOString(),
    confidence: 0,
    citations: [],
    conflicts: [],
  };
}

function mergeCitations(
  left: HybridCitation[],
  right: HybridCitation[]
): HybridCitation[] {
  const seen = new Set<string>();
  const merged: HybridCitation[] = [];
  for (const citation of [...left, ...right]) {
    if (seen.has(citation.url)) {
      continue;
    }
    seen.add(citation.url);
    merged.push(citation);
  }
  return merged;
}

function latestTimestamp(left: string, right: string): string {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return left > right ? left : right;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
