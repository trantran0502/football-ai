import type { GoogleSearchMatchRequest } from "@/lib/providers/googleSearch/googleSearchTypes";

const MATCH_RECORD_SCHEMA = {
  type: "object",
  properties: {
    matchDate: { type: "string" },
    homeTeam: { type: "string" },
    awayTeam: { type: "string" },
    homeGoals: { type: "number", nullable: true },
    awayGoals: { type: "number", nullable: true },
    competition: { type: "string" },
    competitionType: {
      type: "string",
      enum: ["league", "cup", "friendly", "other"],
    },
    venue: { type: "string", enum: ["home", "away", "neutral"] },
    neutralVenue: { type: "boolean" },
    includesExtraTime: { type: "boolean" },
    includesPenalties: { type: "boolean" },
    sourceUrl: { type: "string" },
  },
  required: [
    "matchDate",
    "homeTeam",
    "awayTeam",
    "competition",
    "competitionType",
    "venue",
    "neutralVenue",
    "includesExtraTime",
    "includesPenalties",
  ],
};

const METRICS_SCHEMA = {
  type: "object",
  properties: {
    goalsFor: { type: "number", nullable: true },
    goalsAgainst: { type: "number", nullable: true },
    xg: { type: "number", nullable: true },
    xga: { type: "number", nullable: true },
    shots: { type: "number", nullable: true },
    shotsOnTarget: { type: "number", nullable: true },
    possession: { type: "number", nullable: true },
    cleanSheets: { type: "number", nullable: true },
    failedToScore: { type: "number", nullable: true },
  },
};

export const GEMINI_FOOTBALL_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    recentFormLast10Official: { type: "array", items: MATCH_RECORD_SCHEMA },
    recentFormLast5Home: { type: "array", items: MATCH_RECORD_SCHEMA },
    recentFormLast5Away: { type: "array", items: MATCH_RECORD_SCHEMA },
    includesFriendlies: { type: "boolean" },
    includesExtraTime: { type: "boolean" },
    includesPenalties: { type: "boolean" },
    h2hLast5Official: { type: "array", items: MATCH_RECORD_SCHEMA },
    standings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          teamName: { type: "string" },
          rank: { type: "number", nullable: true },
          played: { type: "number", nullable: true },
          points: { type: "number", nullable: true },
          goalsFor: { type: "number", nullable: true },
          goalsAgainst: { type: "number", nullable: true },
          sourceUrl: { type: "string" },
        },
        required: ["teamName"],
      },
    },
    homeMetrics: { ...METRICS_SCHEMA, nullable: true },
    awayMetrics: { ...METRICS_SCHEMA, nullable: true },
    injuries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          teamName: { type: "string" },
          playerName: { type: "string" },
          reason: { type: "string" },
          status: { type: "string" },
          sourceUrl: { type: "string" },
        },
        required: ["teamName", "playerName"],
      },
    },
    suspensions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          teamName: { type: "string" },
          playerName: { type: "string" },
          reason: { type: "string" },
          status: { type: "string" },
          sourceUrl: { type: "string" },
        },
        required: ["teamName", "playerName"],
      },
    },
    matchStatus: {
      type: "object",
      nullable: true,
      properties: {
        importance: { type: "string", nullable: true },
        mustWin: { type: "boolean", nullable: true },
        alreadyQualified: { type: "boolean", nullable: true },
        alreadyEliminated: { type: "boolean", nullable: true },
        weather: { type: "string", nullable: true },
        longTravelAway: { type: "boolean", nullable: true },
        congestedSchedule: { type: "boolean", nullable: true },
        coachNews: { type: "string", nullable: true },
        officialNews: { type: "string", nullable: true },
        rotation: { type: "string", nullable: true },
      },
    },
  },
  required: [
    "recentFormLast10Official",
    "recentFormLast5Home",
    "recentFormLast5Away",
    "includesFriendlies",
    "includesExtraTime",
    "includesPenalties",
    "h2hLast5Official",
    "standings",
    "injuries",
    "suspensions",
  ],
};

export function buildGeminiGroundingPrompt(request: GoogleSearchMatchRequest): string {
  const league = request.leagueName ? `League: ${request.leagueName}.` : "";
  const date = request.matchDate ? `Match date: ${request.matchDate}.` : "";

  return [
    "You are a football data researcher. Use Google Search grounding to collect publicly available match intelligence.",
    `Focus on ${request.homeTeam} (home) vs ${request.awayTeam} (away). ${league} ${date}`,
    "Return ONLY valid JSON matching the provided schema. Do not include markdown.",
    "Requirements:",
    "- recentFormLast10Official: last 10 official competitive matches per team combined list, sorted by date desc",
    "- recentFormLast5Home: last 5 home matches for the home team only",
    "- recentFormLast5Away: last 5 away matches for the away team only",
    "- Exclude friendlies unless explicitly marked with competitionType=friendly and includesFriendlies=true",
    "- h2hLast5Official: last 5 official head-to-head meetings with home/away direction and competition name",
    "- standings: current league table rows relevant to both teams",
    "- homeMetrics / awayMetrics: goals for/against, xG/xGA if public, shots, shots on target, possession, clean sheets, failed to score",
    "- injuries and suspensions for both teams",
    "- matchStatus: importance, mustWin, qualification state, weather, travel, congested schedule, coach news, official news, rotation",
    "- Include sourceUrl on records when available from grounding sources",
    "- Use null for unknown numeric values; do not invent statistics",
  ].join("\n");
}

export function buildGeminiSearchQuery(request: GoogleSearchMatchRequest): string {
  const date = request.matchDate ? ` ${request.matchDate}` : "";
  const league = request.leagueName ? ` ${request.leagueName}` : "";
  return `${request.homeTeam} vs ${request.awayTeam}${date}${league} recent form head to head injuries standings weather`;
}
