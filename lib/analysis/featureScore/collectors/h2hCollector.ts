import { clampConfidence, clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import { getFeatureWeight } from "@/lib/analysis/featureScore/featureWeights";
import { registerFeatureCollector } from "@/lib/analysis/featureScore/featureScoreEngine";
import { createRegistryH2HProvider } from "@/lib/providers/registry/createRegistryProviders";
import {
  type H2HMatchRecord,
  type H2HProvider,
  type H2HSnapshot,
} from "@/lib/analysis/featureScore/providers/h2hProvider";
import type {
  FeatureScore,
  FeatureScoreCategory,
  FeatureScoreContext,
} from "@/lib/analysis/featureScore/types";

export const H2H_FEATURE_IDS = {
  homeWinRate: "h2h.home_win_rate",
  awayWinRate: "h2h.away_win_rate",
  drawRate: "h2h.draw_rate",
  goalDifference: "h2h.goal_difference",
  averageGoals: "h2h.average_goals",
  bttsRate: "h2h.btts_rate",
  over25Rate: "h2h.over_25_rate",
  venueRelevant: "h2h.venue_relevant",
  recentMomentum: "h2h.recent_momentum",
} as const;

export type H2HFeatureId = (typeof H2H_FEATURE_IDS)[keyof typeof H2H_FEATURE_IDS];

export interface H2HFeatureMetadata {
  label: string;
  value: number | null;
  sampleSize: number;
  dataFreshnessDays: number | null;
  venueFilteredSampleSize: number | null;
}

const NEUTRAL_RATE = 0.5;
const THREE_YEARS_DAYS = 365 * 3;
const MAX_H2H_CONFIDENCE = 0.65;

type Outcome = "W" | "D" | "L";

interface ParsedH2HMatch {
  record: H2HMatchRecord;
  outcomeForCurrentHome: Outcome;
  goalsForCurrentHome: number;
  goalsForCurrentAway: number;
  totalGoals: number;
  btts: boolean;
  over25: boolean;
  venueRelevant: boolean;
}

let registered = false;
let defaultProvider: H2HProvider = createRegistryH2HProvider();

export function registerH2HCollector(): void {
  if (registered) {
    return;
  }
  registerFeatureCollector(collectH2HFeatures);
  registered = true;
}

export function resetH2HCollectorRegistrationForTests(): void {
  registered = false;
}

export function isH2HCollectorRegistered(): boolean {
  return registered;
}

export function resetH2HProviderForTests(): void {
  defaultProvider = createRegistryH2HProvider();
}

export function setH2HProviderForTests(provider: H2HProvider): void {
  defaultProvider = provider;
}

function resolveProvider(context: FeatureScoreContext): H2HProvider {
  const injected = context.metadata?.h2hProvider;
  if (injected && typeof injected === "object" && "getH2HHistory" in injected) {
    return injected as H2HProvider;
  }
  return defaultProvider;
}

function resolveTeams(context: FeatureScoreContext): {
  homeTeam: string | null;
  awayTeam: string | null;
  matchDate: string | undefined;
} {
  const homeTeam = context.metadata?.homeTeam;
  const awayTeam = context.metadata?.awayTeam;
  const matchDate = context.metadata?.matchDate;

  return {
    homeTeam: typeof homeTeam === "string" && homeTeam.trim() ? homeTeam.trim() : null,
    awayTeam: typeof awayTeam === "string" && awayTeam.trim() ? awayTeam.trim() : null,
    matchDate: typeof matchDate === "string" && matchDate.trim() ? matchDate.trim() : undefined,
  };
}

function normalizeTeamName(value: string): string {
  return value.trim().toLowerCase();
}

function teamsEqual(left: string, right: string): boolean {
  return normalizeTeamName(left) === normalizeTeamName(right);
}

function matchAgeDays(matchDate: string, referenceDate: string): number {
  const end = new Date(referenceDate).getTime();
  const start = new Date(matchDate).getTime();
  if (!Number.isFinite(end) || !Number.isFinite(start)) {
    return 0;
  }
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function parseH2HMatch(
  record: H2HMatchRecord,
  currentHome: string,
  currentAway: string
): ParsedH2HMatch | null {
  if (record.homeGoals === null || record.awayGoals === null) {
    return null;
  }

  let goalsForCurrentHome: number;
  let goalsForCurrentAway: number;
  let venueRelevant = false;

  if (teamsEqual(record.homeTeam, currentHome) && teamsEqual(record.awayTeam, currentAway)) {
    goalsForCurrentHome = record.homeGoals;
    goalsForCurrentAway = record.awayGoals;
    venueRelevant = !record.neutralVenue;
  } else if (
    teamsEqual(record.homeTeam, currentAway) &&
    teamsEqual(record.awayTeam, currentHome)
  ) {
    goalsForCurrentHome = record.awayGoals;
    goalsForCurrentAway = record.homeGoals;
    venueRelevant = false;
  } else {
    return null;
  }

  let outcomeForCurrentHome: Outcome = "D";
  if (goalsForCurrentHome > goalsForCurrentAway) {
    outcomeForCurrentHome = "W";
  } else if (goalsForCurrentHome < goalsForCurrentAway) {
    outcomeForCurrentHome = "L";
  }

  const totalGoals = goalsForCurrentHome + goalsForCurrentAway;

  return {
    record,
    outcomeForCurrentHome,
    goalsForCurrentHome,
    goalsForCurrentAway,
    totalGoals,
    btts: goalsForCurrentHome > 0 && goalsForCurrentAway > 0,
    over25: totalGoals > 2,
    venueRelevant,
  };
}

function parseMatches(
  snapshot: H2HSnapshot,
  currentHome: string,
  currentAway: string,
  referenceDate: string
): ParsedH2HMatch[] {
  return snapshot.matches
    .map((record) => parseH2HMatch(record, currentHome, currentAway))
    .filter((item): item is ParsedH2HMatch => item !== null)
    .sort(
      (left, right) =>
        new Date(right.record.matchDate).getTime() -
        new Date(left.record.matchDate).getTime()
    );
}

function sampleSizeCap(sampleSize: number): number {
  if (sampleSize < 3) {
    return 0.3;
  }
  if (sampleSize < 5) {
    return 0.5;
  }
  return MAX_H2H_CONFIDENCE;
}

function stalenessFactor(
  snapshot: H2HSnapshot,
  parsed: ParsedH2HMatch[],
  referenceDate: string
): number {
  let factor = 1;

  if (
    snapshot.dataFreshnessDays !== null &&
    snapshot.dataFreshnessDays > THREE_YEARS_DAYS
  ) {
    factor *= 0.7;
  }

  const hasOldMatch = parsed.some(
    (item) => matchAgeDays(item.record.matchDate, referenceDate) > THREE_YEARS_DAYS
  );
  if (hasOldMatch) {
    factor *= 0.75;
  }

  return factor;
}

function resolveH2HConfidence(
  snapshot: H2HSnapshot,
  parsed: ParsedH2HMatch[],
  referenceDate: string,
  effectiveSampleSize: number,
  fieldsAvailable: number,
  fieldsRequired: number
): number {
  const cap = sampleSizeCap(snapshot.sampleSize);
  const completeness =
    fieldsRequired > 0 ? fieldsAvailable / fieldsRequired : 0;
  const stale = stalenessFactor(snapshot, parsed, referenceDate);
  const scaled = (0.18 + completeness * (cap - 0.12)) * stale;
  return clampConfidence(Math.min(MAX_H2H_CONFIDENCE, Math.min(cap, scaled)));
}

function rateFromOutcomes(
  parsed: ParsedH2HMatch[],
  pick: (outcome: Outcome) => boolean
): number | null {
  if (parsed.length === 0) {
    return null;
  }
  const count = parsed.filter((item) => pick(item.outcomeForCurrentHome)).length;
  return Math.round((count / parsed.length) * 1000) / 1000;
}

function buildMetadata(
  label: string,
  value: number | null,
  snapshot: H2HSnapshot,
  venueFilteredSampleSize: number | null = null
): H2HFeatureMetadata {
  return {
    label,
    value,
    sampleSize: snapshot.sampleSize,
    dataFreshnessDays: snapshot.dataFreshnessDays,
    venueFilteredSampleSize,
  };
}

function buildFeature(
  id: H2HFeatureId,
  label: string,
  category: FeatureScoreCategory,
  score: number,
  reason: string,
  metadata: H2HFeatureMetadata,
  confidence: number
): FeatureScore {
  return {
    id,
    category,
    score: clampScore(score),
    weight: getFeatureWeight("h2h"),
    confidence: clampConfidence(Math.min(MAX_H2H_CONFIDENCE, confidence)),
    reason,
    metadata: { ...metadata },
  };
}

function scoreFromRate(rate: number | null, invert = false): number | null {
  if (rate === null) {
    return null;
  }
  const centered = rate - NEUTRAL_RATE;
  return clampScore((invert ? -centered : centered) * 200);
}

function scoreHomeWinRate(
  snapshot: H2HSnapshot,
  parsed: ParsedH2HMatch[],
  referenceDate: string
): FeatureScore | null {
  const rate = rateFromOutcomes(parsed, (outcome) => outcome === "W");
  const score = scoreFromRate(rate);
  if (rate === null || score === null || parsed.length === 0) {
    return null;
  }

  return buildFeature(
    H2H_FEATURE_IDS.homeWinRate,
    "Home H2H Win Rate",
    "moneyline",
    score,
    `近 ${parsed.length} 次交手中，主隊 H2H 勝率 ${(rate * 100).toFixed(1)}%。`,
    buildMetadata("Home H2H Win Rate", rate, snapshot),
    resolveH2HConfidence(snapshot, parsed, referenceDate, parsed.length, 1, 1)
  );
}

function scoreAwayWinRate(
  snapshot: H2HSnapshot,
  parsed: ParsedH2HMatch[],
  referenceDate: string
): FeatureScore | null {
  const rate = rateFromOutcomes(parsed, (outcome) => outcome === "L");
  const score = scoreFromRate(rate, true);
  if (rate === null || score === null || parsed.length === 0) {
    return null;
  }

  return buildFeature(
    H2H_FEATURE_IDS.awayWinRate,
    "Away H2H Win Rate",
    "moneyline",
    score,
    `近 ${parsed.length} 次交手中，客隊 H2H 勝率 ${(rate * 100).toFixed(1)}%（客隊越強，主隊得分越低）。`,
    buildMetadata("Away H2H Win Rate", rate, snapshot),
    resolveH2HConfidence(snapshot, parsed, referenceDate, parsed.length, 1, 1)
  );
}

function scoreDrawRate(
  snapshot: H2HSnapshot,
  parsed: ParsedH2HMatch[],
  referenceDate: string
): FeatureScore | null {
  const rate = rateFromOutcomes(parsed, (outcome) => outcome === "D");
  if (rate === null || parsed.length === 0) {
    return null;
  }

  const score = clampScore((0.3 - rate) * 120);
  return buildFeature(
    H2H_FEATURE_IDS.drawRate,
    "H2H Draw Rate",
    "moneyline",
    score,
    `H2H 和局率 ${(rate * 100).toFixed(1)}%（和局偏高代表歷史交手較難分出優劣）。`,
    buildMetadata("H2H Draw Rate", rate, snapshot),
    resolveH2HConfidence(snapshot, parsed, referenceDate, parsed.length, 1, 1)
  );
}

function scoreGoalDifference(
  snapshot: H2HSnapshot,
  parsed: ParsedH2HMatch[],
  referenceDate: string
): FeatureScore | null {
  if (parsed.length === 0) {
    return null;
  }

  const avgDiff =
    parsed.reduce(
      (sum, item) => sum + (item.goalsForCurrentHome - item.goalsForCurrentAway),
      0
    ) / parsed.length;
  const rounded = Math.round(avgDiff * 1000) / 1000;

  return buildFeature(
    H2H_FEATURE_IDS.goalDifference,
    "H2H Goal Difference",
    "totalGoals",
    clampScore(rounded * 35),
    `H2H 場均淨勝球 ${rounded.toFixed(2)}（以當前主隊視角）。`,
    buildMetadata("H2H Goal Difference", rounded, snapshot),
    resolveH2HConfidence(snapshot, parsed, referenceDate, parsed.length, 1, 1)
  );
}

function scoreAverageGoals(
  snapshot: H2HSnapshot,
  parsed: ParsedH2HMatch[],
  referenceDate: string
): FeatureScore | null {
  if (parsed.length === 0) {
    return null;
  }

  const avgTotal =
    parsed.reduce((sum, item) => sum + item.totalGoals, 0) / parsed.length;
  const rounded = Math.round(avgTotal * 1000) / 1000;

  return buildFeature(
    H2H_FEATURE_IDS.averageGoals,
    "H2H Average Goals",
    "totalGoals",
    clampScore((rounded - 2.5) * 35),
    `H2H 場均總進球 ${rounded.toFixed(2)}。`,
    buildMetadata("H2H Average Goals", rounded, snapshot),
    resolveH2HConfidence(snapshot, parsed, referenceDate, parsed.length, 1, 1)
  );
}

function scoreBttsRate(
  snapshot: H2HSnapshot,
  parsed: ParsedH2HMatch[],
  referenceDate: string
): FeatureScore | null {
  if (parsed.length === 0) {
    return null;
  }

  const rate =
    parsed.filter((item) => item.btts).length / parsed.length;
  const rounded = Math.round(rate * 1000) / 1000;
  const score = scoreFromRate(rounded);
  if (score === null) {
    return null;
  }

  return buildFeature(
    H2H_FEATURE_IDS.bttsRate,
    "H2H BTTS Rate",
    "btts",
    score,
    `H2H BTTS 比率 ${(rounded * 100).toFixed(1)}%。`,
    buildMetadata("H2H BTTS Rate", rounded, snapshot),
    resolveH2HConfidence(snapshot, parsed, referenceDate, parsed.length, 1, 1)
  );
}

function scoreOver25Rate(
  snapshot: H2HSnapshot,
  parsed: ParsedH2HMatch[],
  referenceDate: string
): FeatureScore | null {
  if (parsed.length === 0) {
    return null;
  }

  const rate =
    parsed.filter((item) => item.over25).length / parsed.length;
  const rounded = Math.round(rate * 1000) / 1000;
  const score = scoreFromRate(rounded);
  if (score === null) {
    return null;
  }

  return buildFeature(
    H2H_FEATURE_IDS.over25Rate,
    "H2H Over 2.5 Rate",
    "totalGoals",
    score,
    `H2H Over 2.5 比率 ${(rounded * 100).toFixed(1)}%。`,
    buildMetadata("H2H Over 2.5 Rate", rounded, snapshot),
    resolveH2HConfidence(snapshot, parsed, referenceDate, parsed.length, 1, 1)
  );
}

function scoreVenueRelevant(
  snapshot: H2HSnapshot,
  parsed: ParsedH2HMatch[],
  referenceDate: string
): FeatureScore | null {
  const venueMatches = parsed.filter((item) => item.venueRelevant);
  if (venueMatches.length === 0) {
    return null;
  }

  const rate = rateFromOutcomes(venueMatches, (outcome) => outcome === "W");
  const score = scoreFromRate(rate);
  if (rate === null || score === null) {
    return null;
  }

  return buildFeature(
    H2H_FEATURE_IDS.venueRelevant,
    "Venue-Relevant H2H",
    "moneyline",
    score,
    `排除中立場後，主場相關 H2H 樣本 ${venueMatches.length} 場，主隊勝率 ${(rate * 100).toFixed(1)}%。`,
    buildMetadata("Venue-Relevant H2H", rate, snapshot, venueMatches.length),
    resolveH2HConfidence(
      snapshot,
      parsed,
      referenceDate,
      venueMatches.length,
      venueMatches.length,
      Math.max(parsed.length, 1)
    )
  );
}

function scoreRecentMomentum(
  snapshot: H2HSnapshot,
  parsed: ParsedH2HMatch[],
  referenceDate: string
): FeatureScore | null {
  if (parsed.length < 2) {
    return null;
  }

  const recent = parsed.slice(0, Math.min(2, parsed.length));
  const older = parsed.slice(Math.min(2, parsed.length));
  const recentWinRate =
    recent.filter((item) => item.outcomeForCurrentHome === "W").length /
    recent.length;

  const olderWinRate =
    older.length > 0
      ? older.filter((item) => item.outcomeForCurrentHome === "W").length /
        older.length
      : recentWinRate;

  const momentum = Math.round((recentWinRate - olderWinRate) * 1000) / 1000;

  return buildFeature(
    H2H_FEATURE_IDS.recentMomentum,
    "Recent H2H Momentum",
    "moneyline",
    clampScore(momentum * 120),
    `最近 ${recent.length} 場 H2H 勝率 ${(recentWinRate * 100).toFixed(1)}%，較早前 ${(olderWinRate * 100).toFixed(1)}%。`,
    buildMetadata("Recent H2H Momentum", momentum, snapshot),
    resolveH2HConfidence(snapshot, parsed, referenceDate, parsed.length, 2, 2)
  );
}

function compact(features: Array<FeatureScore | null>): FeatureScore[] {
  return features.filter((feature): feature is FeatureScore => feature !== null);
}

export function collectH2HFeatures(context: FeatureScoreContext): FeatureScore[] {
  const { homeTeam, awayTeam, matchDate } = resolveTeams(context);
  if (!homeTeam || !awayTeam) {
    return [];
  }

  const provider = resolveProvider(context);
  const snapshot = provider.getH2HHistory({ homeTeam, awayTeam, matchDate });
  if (snapshot.sampleSize === 0 || snapshot.matches.length === 0) {
    return [];
  }

  const referenceDate = matchDate ?? new Date().toISOString().slice(0, 10);
  const parsed = parseMatches(snapshot, homeTeam, awayTeam, referenceDate);
  if (parsed.length === 0) {
    return [];
  }

  return compact([
    scoreHomeWinRate(snapshot, parsed, referenceDate),
    scoreAwayWinRate(snapshot, parsed, referenceDate),
    scoreDrawRate(snapshot, parsed, referenceDate),
    scoreGoalDifference(snapshot, parsed, referenceDate),
    scoreAverageGoals(snapshot, parsed, referenceDate),
    scoreBttsRate(snapshot, parsed, referenceDate),
    scoreOver25Rate(snapshot, parsed, referenceDate),
    scoreVenueRelevant(snapshot, parsed, referenceDate),
    scoreRecentMomentum(snapshot, parsed, referenceDate),
  ]);
}
