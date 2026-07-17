import type { HistoricalMatchRecord, MatchResult } from "@/lib/database/matchSchema";
import type { MarketSelection } from "@/types/match";

export interface SystemValidationFixtureSpec {
  id: string;
  label: string;
  league: string;
  leagueId: number;
  verifiedAt: string;
  tags: string[];
}

function selection(
  partial: Pick<MarketSelection, "marketType" | "side" | "odds"> &
    Partial<MarketSelection>
): MarketSelection {
  return {
    marketFamily: partial.marketFamily ?? "moneyline",
    title: partial.title ?? "Market",
    period: partial.period ?? "full",
    rawLine: partial.rawLine ?? null,
    line: partial.line ?? null,
    modifier: partial.modifier ?? null,
    handicap: partial.handicap ?? partial.line ?? null,
    ...partial,
  };
}

function emptyValidationBucket() {
  return {
    sampleSize: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    halfWins: 0,
    halfLoses: 0,
    hitRate: 0,
    roi: 0,
    averageOdds: 0,
    averageConfidence: 0,
    totalProfit: 0,
  };
}

function verificationResult(verifiedAt: string): HistoricalMatchRecord["verificationResult"] {
  return {
    verifiedAt,
    backtest: {
      entries: [],
      statistics: {
        totalMatches: 0,
        totalBets: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        halfWins: 0,
        halfLoses: 0,
        winRate: 0,
        roi: 0,
        totalProfit: 0,
        averageOdds: 0,
        averageConfidence: 0,
      },
    },
    ruleValidation: {
      validatedAt: verifiedAt,
      mode: "dryRun",
      rules: [],
    },
    recommendationValidation: {
      entries: [],
      report: {
        totalMatches: 0,
        totalRecommendations: 0,
        hitRate: 0,
        roi: 0,
        byMarket: {
          Moneyline: emptyValidationBucket(),
          Handicap: emptyValidationBucket(),
          OverUnder: emptyValidationBucket(),
          BTTS: emptyValidationBucket(),
        },
        byRule: {},
        byFeature: {},
        confidenceDistribution: {
          pass: 0,
          low: 0,
          medium: 0,
          high: 0,
        },
        recommendationsToDisable: [],
        recommendationsToIncreaseWeight: [],
      },
    },
  };
}

function buildRecord(input: {
  id: string;
  league: string;
  leagueId: number;
  verifiedAt: string;
  homeTeam: string;
  awayTeam: string;
  marketSelections: MarketSelection[];
  result: MatchResult;
}): HistoricalMatchRecord {
  return {
    id: input.id,
    date: input.verifiedAt.slice(0, 10),
    matchDate: input.verifiedAt.slice(0, 10),
    league: input.league,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    rawOdds: "multi",
    leagueId: input.leagueId,
    marketSelections: input.marketSelections,
    result: input.result,
    analysisSnapshot: null,
    candidates: [],
    status: "VERIFIED",
    verificationResult: verificationResult(input.verifiedAt),
    createdAt: input.verifiedAt,
    updatedAt: input.verifiedAt,
  };
}

function standardFourMarkets(
  overrides: Partial<{
    moneyline: MarketSelection[];
    ah: MarketSelection[];
    ou: MarketSelection[];
    btts: MarketSelection[];
  }> = {}
): MarketSelection[] {
  const moneyline = overrides.moneyline ?? [
    selection({ marketType: "moneyline", marketFamily: "moneyline", side: "home", odds: 1.85, impliedProbability: 0.54 }),
    selection({ marketType: "moneyline", marketFamily: "moneyline", side: "draw", odds: 3.4, impliedProbability: 0.29 }),
    selection({ marketType: "moneyline", marketFamily: "moneyline", side: "away", odds: 4.2, impliedProbability: 0.24 }),
  ];
  const ah = overrides.ah ?? [
    selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "home", odds: 0.92, line: -0.5, rawLine: "-0.5", modifier: "plain", impliedProbability: 0.521 }),
    selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "away", odds: 0.94, line: 0.5, rawLine: "+0.5", modifier: "plain", impliedProbability: 0.515 }),
  ];
  const ou = overrides.ou ?? [
    selection({ marketType: "totalGoals", marketFamily: "asianOverUnder", side: "over", odds: 0.9, line: 2.5, rawLine: "2.5", modifier: "plain", impliedProbability: 0.526 }),
    selection({ marketType: "totalGoals", marketFamily: "asianOverUnder", side: "under", odds: 0.92, line: 2.5, rawLine: "2.5", modifier: "plain", impliedProbability: 0.515 }),
  ];
  const btts = overrides.btts ?? [
    selection({ marketType: "btts", marketFamily: "btts", side: "yes", odds: 0.88, impliedProbability: 0.532 }),
    selection({ marketType: "btts", marketFamily: "btts", side: "no", odds: 0.9, impliedProbability: 0.526 }),
  ];
  return [...moneyline, ...ah, ...ou, ...btts];
}

export const SYSTEM_VALIDATION_FIXTURE_SPECS: SystemValidationFixtureSpec[] = [
  { id: "sv-fix-01", label: "Balanced low water home WIN", league: "Premier League", leagueId: 39, verifiedAt: "2026-01-10T10:00:00.000Z", tags: ["AH", "LOW", "Balanced", "WIN", "positive-roi"] },
  { id: "sv-fix-02", label: "AH line zero PUSH", league: "Premier League", leagueId: 39, verifiedAt: "2026-01-10T11:00:00.000Z", tags: ["AH", "PUSH", "NORMAL"] },
  { id: "sv-fix-03", label: "Away high water value LOSE", league: "La Liga", leagueId: 140, verifiedAt: "2026-01-11T10:00:00.000Z", tags: ["AH", "HIGH", "Underdog", "LOSE", "negative-roi"] },
  { id: "sv-fix-04", label: "Extreme favorite 1X2", league: "La Liga", leagueId: 140, verifiedAt: "2026-01-11T11:00:00.000Z", tags: ["1X2", "Extreme", "Favorite"] },
  { id: "sv-fix-05", label: "Trap candidate AH", league: "Premier League", leagueId: 39, verifiedAt: "2026-01-12T10:00:00.000Z", tags: ["AH", "Trap Candidate", "LOW"] },
  { id: "sv-fix-06", label: "High overround BTTS LOSE", league: "La Liga", leagueId: 140, verifiedAt: "2026-01-12T11:00:00.000Z", tags: ["BTTS", "High Overround", "LOSE", "negative-roi"] },
  { id: "sv-fix-07", label: "Low overround balanced OU WIN", league: "Premier League", leagueId: 39, verifiedAt: "2026-01-13T10:00:00.000Z", tags: ["O/U", "Low Overround", "Balanced", "WIN", "positive-roi"] },
  { id: "sv-fix-08", label: "Balanced underdog 1X2", league: "La Liga", leagueId: 140, verifiedAt: "2026-01-13T11:00:00.000Z", tags: ["1X2", "Balanced", "Underdog"] },
  { id: "sv-fix-09", label: "Neutral no pattern match", league: "Premier League", leagueId: 39, verifiedAt: "2026-01-14T10:00:00.000Z", tags: ["no-pattern", "NORMAL"] },
  { id: "sv-fix-10", label: "Extreme underdog value", league: "La Liga", leagueId: 140, verifiedAt: "2026-01-14T11:00:00.000Z", tags: ["1X2", "Extreme", "Underdog"] },
  { id: "sv-fix-11", label: "Odds gap favorite bias", league: "Premier League", leagueId: 39, verifiedAt: "2026-01-15T10:00:00.000Z", tags: ["AH", "Favorite", "OddsGap"] },
  { id: "sv-fix-12", label: "Home low water favorite", league: "La Liga", leagueId: 140, verifiedAt: "2026-01-15T11:00:00.000Z", tags: ["AH", "LOW", "Favorite"] },
];

export function buildSystemValidationFixtures(): HistoricalMatchRecord[] {
  return [
    buildRecord({
      id: "sv-fix-01",
      league: "Premier League",
      leagueId: 39,
      verifiedAt: "2026-01-10T10:00:00.000Z",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      marketSelections: standardFourMarkets({
        ou: [
          selection({ marketType: "totalGoals", marketFamily: "asianOverUnder", side: "over", odds: 0.79, line: 2.5, rawLine: "2.5", modifier: "plain", impliedProbability: 0.549 }),
          selection({ marketType: "totalGoals", marketFamily: "asianOverUnder", side: "under", odds: 0.81, line: 2.5, rawLine: "2.5", modifier: "plain", impliedProbability: 0.543 }),
        ],
        ah: [
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "home", odds: 0.79, line: -0.5, rawLine: "-0.5", modifier: "plain", impliedProbability: 0.558 }),
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "away", odds: 0.81, line: 0.5, rawLine: "+0.5", modifier: "plain", impliedProbability: 0.549 }),
        ],
      }),
      result: { fullTimeHomeGoals: 2, fullTimeAwayGoals: 1, halfTimeHomeGoals: 1, halfTimeAwayGoals: 0, winner: "home", totalGoals: 3, bothTeamsScored: true },
    }),
    buildRecord({
      id: "sv-fix-02",
      league: "Premier League",
      leagueId: 39,
      verifiedAt: "2026-01-10T11:00:00.000Z",
      homeTeam: "Liverpool",
      awayTeam: "Tottenham",
      marketSelections: standardFourMarkets({
        ah: [
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "home", odds: 0.92, line: 0, rawLine: "0", modifier: "plain", impliedProbability: 0.521 }),
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "away", odds: 0.92, line: 0, rawLine: "0", modifier: "plain", impliedProbability: 0.521 }),
        ],
      }),
      result: { fullTimeHomeGoals: 1, fullTimeAwayGoals: 1, halfTimeHomeGoals: 0, halfTimeAwayGoals: 1, winner: "draw", totalGoals: 2, bothTeamsScored: true },
    }),
    buildRecord({
      id: "sv-fix-03",
      league: "La Liga",
      leagueId: 140,
      verifiedAt: "2026-01-11T10:00:00.000Z",
      homeTeam: "Real Madrid",
      awayTeam: "Sevilla",
      marketSelections: standardFourMarkets({
        ah: [
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "home", odds: 0.92, line: -0.5, rawLine: "-0.5", modifier: "plain", impliedProbability: 0.521 }),
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "away", odds: 0.99, line: 0.5, rawLine: "+0.5", modifier: "plain", impliedProbability: 0.502 }),
        ],
        moneyline: [
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "home", odds: 1.55, impliedProbability: 0.58 }),
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "draw", odds: 3.6, impliedProbability: 0.25 }),
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "away", odds: 4.5, impliedProbability: 0.17 }),
        ],
      }),
      result: { fullTimeHomeGoals: 3, fullTimeAwayGoals: 0, halfTimeHomeGoals: 2, halfTimeAwayGoals: 0, winner: "home", totalGoals: 3, bothTeamsScored: false },
    }),
    buildRecord({
      id: "sv-fix-04",
      league: "La Liga",
      leagueId: 140,
      verifiedAt: "2026-01-11T11:00:00.000Z",
      homeTeam: "Barcelona",
      awayTeam: "Getafe",
      marketSelections: standardFourMarkets({
        moneyline: [
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "home", odds: 1.35, impliedProbability: 0.74 }),
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "draw", odds: 4.8, impliedProbability: 0.12 }),
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "away", odds: 8.5, impliedProbability: 0.08 }),
        ],
      }),
      result: { fullTimeHomeGoals: 2, fullTimeAwayGoals: 0, halfTimeHomeGoals: 1, halfTimeAwayGoals: 0, winner: "home", totalGoals: 2, bothTeamsScored: false },
    }),
    buildRecord({
      id: "sv-fix-05",
      league: "Premier League",
      leagueId: 39,
      verifiedAt: "2026-01-12T10:00:00.000Z",
      homeTeam: "Manchester City",
      awayTeam: "Newcastle",
      marketSelections: standardFourMarkets({
        ou: [
          selection({ marketType: "totalGoals", marketFamily: "asianOverUnder", side: "over", odds: 0.79, line: 2.5, rawLine: "2.5", modifier: "plain", impliedProbability: 0.62 }),
          selection({ marketType: "totalGoals", marketFamily: "asianOverUnder", side: "under", odds: 0.98, line: 2.5, rawLine: "2.5", modifier: "plain", impliedProbability: 0.48 }),
        ],
        ah: [
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "home", odds: 0.79, line: -0.5, rawLine: "-0.5", modifier: "plain", impliedProbability: 0.62 }),
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "away", odds: 0.98, line: 0.5, rawLine: "+0.5", modifier: "plain", impliedProbability: 0.48 }),
        ],
      }),
      result: { fullTimeHomeGoals: 1, fullTimeAwayGoals: 2, halfTimeHomeGoals: 0, halfTimeAwayGoals: 1, winner: "away", totalGoals: 3, bothTeamsScored: true },
    }),
    buildRecord({
      id: "sv-fix-06",
      league: "La Liga",
      leagueId: 140,
      verifiedAt: "2026-01-12T11:00:00.000Z",
      homeTeam: "Valencia",
      awayTeam: "Villarreal",
      marketSelections: standardFourMarkets({
        btts: [
          selection({ marketType: "btts", marketFamily: "btts", side: "yes", odds: 0.88, impliedProbability: 0.65 }),
          selection({ marketType: "btts", marketFamily: "btts", side: "no", odds: 0.88, impliedProbability: 0.65 }),
        ],
      }),
      result: { fullTimeHomeGoals: 0, fullTimeAwayGoals: 0, halfTimeHomeGoals: 0, halfTimeAwayGoals: 0, winner: "draw", totalGoals: 0, bothTeamsScored: false },
    }),
    buildRecord({
      id: "sv-fix-07",
      league: "Premier League",
      leagueId: 39,
      verifiedAt: "2026-01-13T10:00:00.000Z",
      homeTeam: "Brighton",
      awayTeam: "West Ham",
      marketSelections: standardFourMarkets({
        ou: [
          selection({ marketType: "totalGoals", marketFamily: "asianOverUnder", side: "over", odds: 0.92, line: 2.5, rawLine: "2.5", modifier: "plain", impliedProbability: 0.515 }),
          selection({ marketType: "totalGoals", marketFamily: "asianOverUnder", side: "under", odds: 0.92, line: 2.5, rawLine: "2.5", modifier: "plain", impliedProbability: 0.515 }),
        ],
      }),
      result: { fullTimeHomeGoals: 3, fullTimeAwayGoals: 2, halfTimeHomeGoals: 1, halfTimeAwayGoals: 1, winner: "home", totalGoals: 5, bothTeamsScored: true },
    }),
    buildRecord({
      id: "sv-fix-08",
      league: "La Liga",
      leagueId: 140,
      verifiedAt: "2026-01-13T11:00:00.000Z",
      homeTeam: "Athletic Bilbao",
      awayTeam: "Osasuna",
      marketSelections: standardFourMarkets({
        moneyline: [
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "home", odds: 1.95, impliedProbability: 0.48 }),
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "draw", odds: 3.15, impliedProbability: 0.32 }),
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "away", odds: 3.4, impliedProbability: 0.28 }),
        ],
      }),
      result: { fullTimeHomeGoals: 1, fullTimeAwayGoals: 1, halfTimeHomeGoals: 0, halfTimeAwayGoals: 1, winner: "draw", totalGoals: 2, bothTeamsScored: true },
    }),
    buildRecord({
      id: "sv-fix-09",
      league: "Premier League",
      leagueId: 39,
      verifiedAt: "2026-01-14T10:00:00.000Z",
      homeTeam: "Aston Villa",
      awayTeam: "Everton",
      marketSelections: standardFourMarkets({
        ah: [
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "home", odds: 0.92, line: -0.5, rawLine: "-0.5", modifier: "plain", impliedProbability: 0.521 }),
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "away", odds: 0.94, line: 0.5, rawLine: "+0.5", modifier: "plain", impliedProbability: 0.515 }),
        ],
        moneyline: [
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "home", odds: 2.2, impliedProbability: 0.4 }),
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "draw", odds: 3.2, impliedProbability: 0.32 }),
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "away", odds: 3.5, impliedProbability: 0.28 }),
        ],
      }),
      result: { fullTimeHomeGoals: 1, fullTimeAwayGoals: 0, halfTimeHomeGoals: 1, halfTimeAwayGoals: 0, winner: "home", totalGoals: 1, bothTeamsScored: false },
    }),
    buildRecord({
      id: "sv-fix-10",
      league: "La Liga",
      leagueId: 140,
      verifiedAt: "2026-01-14T11:00:00.000Z",
      homeTeam: "Atletico Madrid",
      awayTeam: "Alaves",
      marketSelections: standardFourMarkets({
        moneyline: [
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "home", odds: 1.35, impliedProbability: 0.74 }),
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "draw", odds: 4.8, impliedProbability: 0.12 }),
          selection({ marketType: "moneyline", marketFamily: "moneyline", side: "away", odds: 8.5, impliedProbability: 0.08 }),
        ],
      }),
      result: { fullTimeHomeGoals: 0, fullTimeAwayGoals: 1, halfTimeHomeGoals: 0, halfTimeAwayGoals: 0, winner: "away", totalGoals: 1, bothTeamsScored: false },
    }),
    buildRecord({
      id: "sv-fix-11",
      league: "Premier League",
      leagueId: 39,
      verifiedAt: "2026-01-15T10:00:00.000Z",
      homeTeam: "Manchester United",
      awayTeam: "Fulham",
      marketSelections: standardFourMarkets({
        ah: [
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "home", odds: 0.79, line: -0.5, rawLine: "-0.5", modifier: "plain", impliedProbability: 0.62 }),
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "away", odds: 0.98, line: 0.5, rawLine: "+0.5", modifier: "plain", impliedProbability: 0.48 }),
        ],
      }),
      result: { fullTimeHomeGoals: 2, fullTimeAwayGoals: 1, halfTimeHomeGoals: 1, halfTimeAwayGoals: 0, winner: "home", totalGoals: 3, bothTeamsScored: true },
    }),
    buildRecord({
      id: "sv-fix-12",
      league: "La Liga",
      leagueId: 140,
      verifiedAt: "2026-01-15T11:00:00.000Z",
      homeTeam: "Real Sociedad",
      awayTeam: "Mallorca",
      marketSelections: standardFourMarkets({
        ah: [
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "home", odds: 0.79, line: -0.5, rawLine: "-0.5", modifier: "plain", impliedProbability: 0.62 }),
          selection({ marketType: "handicap", marketFamily: "asianHandicap", side: "away", odds: 0.98, line: 0.5, rawLine: "+0.5", modifier: "plain", impliedProbability: 0.48 }),
        ],
      }),
      result: { fullTimeHomeGoals: 1, fullTimeAwayGoals: 0, halfTimeHomeGoals: 0, halfTimeAwayGoals: 0, winner: "home", totalGoals: 1, bothTeamsScored: false },
    }),
  ];
}
