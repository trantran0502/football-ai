import type {
  ApiFootballClientConfig,
  ApiFootballFixtureRecord,
  ApiFootballInjuryRecord,
  ApiFootballRawEnvelope,
  ApiFootballStandingRecord,
  ApiFootballTeamFormRecord,
  ApiFootballTeamRef,
  ApiFootballTeamStatisticsRecord,
} from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  canMakeApiFootballRequest,
  recordApiFootballRequest,
} from "@/lib/providers/apiFootball/apiFootballQuota";

const DEFAULT_BASE_URL = "https://v3.football.api-sports.io";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 250;

let testClientOverride: ApiFootballClient | null = null;

export class ApiFootballClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly minRequestIntervalMs: number;
  private lastRequestAt = 0;
  private requestCount = 0;

  constructor(config: ApiFootballClientConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.API_FOOTBALL_KEY ?? "";
    this.baseUrl = config.baseUrl ?? process.env.API_FOOTBALL_BASE_URL ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.minRequestIntervalMs = config.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  async searchTeam(teamName: string): Promise<ApiFootballTeamRef | null> {
    const response = await this.request<Array<Record<string, unknown>>>(
      `/teams?search=${encodeURIComponent(teamName)}`
    );
    if (!response.length) {
      return null;
    }

    const exact = response.find((item) => {
      const team = item.team as Record<string, unknown>;
      const name = String(team.name).toLowerCase();
      const query = teamName.toLowerCase();
      return name === query || name.includes(query);
    });

    const selected = exact ?? response[0];
    const team = selected.team as Record<string, unknown>;
    return {
      id: team.id as number,
      name: team.name as string,
      country: (team.country as string) ?? null,
    };
  }

  async getFixturesByDate(date: string): Promise<ApiFootballFixtureRecord[]> {
    const response = await this.request<Array<Record<string, unknown>>>(
      `/fixtures?date=${date}`
    );
    return response.map((item) => mapFixtureRecord(item));
  }

  async getFixture(input: {
    homeTeamId: number;
    awayTeamId: number;
    matchDate?: string;
  }): Promise<ApiFootballFixtureRecord | null> {
    if (input.matchDate) {
      const response = await this.request<Array<Record<string, unknown>>>(
        `/fixtures?date=${input.matchDate}&team=${input.homeTeamId}`
      );
      const fixtures = response.map((item) => mapFixtureRecord(item));
      return (
        fixtures.find(
          (fixture) =>
            fixture.awayTeamId === input.awayTeamId ||
            fixture.homeTeamId === input.awayTeamId
        ) ??
        fixtures[0] ??
        null
      );
    }

    const h2h = await this.getHeadToHead(input.homeTeamId, input.awayTeamId, 1);
    return h2h[0] ?? null;
  }

  async getTeamForm(teamId: number, last = 10): Promise<ApiFootballTeamFormRecord> {
    const response = await this.request<Array<Record<string, unknown>>>(
      `/fixtures?team=${teamId}&last=${last}`
    );
    return {
      teamId,
      fixtures: response
        .map((item) => mapFixtureRecord(item))
        .filter(
          (fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null
        ),
    };
  }

  async getHeadToHead(
    homeTeamId: number,
    awayTeamId: number,
    last = 10
  ): Promise<ApiFootballFixtureRecord[]> {
    const response = await this.request<Array<Record<string, unknown>>>(
      `/fixtures?h2h=${homeTeamId}-${awayTeamId}&last=${last}`
    );
    return response
      .map((item) => mapFixtureRecord(item))
      .filter(
        (fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null
      );
  }

  async getStandings(
    leagueId: number,
    season: number
  ): Promise<ApiFootballStandingRecord[]> {
    const response = await this.request<Array<Record<string, unknown>>>(
      `/standings?league=${leagueId}&season=${season}`
    );
    const first = response[0]?.league as Record<string, unknown> | undefined;
    const table = (first?.standings as Array<Array<Record<string, unknown>>>)?.[0];
    if (!table) {
      return [];
    }

    return table.map((row) => {
      const all = row.all as Record<string, unknown>;
      const goals = all.goals as Record<string, number>;
      const team = row.team as Record<string, unknown>;
      return {
        rank: row.rank as number,
        team: team.name as string,
        teamId: team.id as number,
        played: all.played as number,
        won: all.win as number,
        draw: all.draw as number,
        lost: all.lose as number,
        goalsFor: goals.for,
        goalsAgainst: goals.against,
        points: row.points as number,
      };
    });
  }

  async getTeamStatistics(input: {
    teamId: number;
    leagueId: number;
    season: number;
  }): Promise<ApiFootballTeamStatisticsRecord | null> {
    const response = await this.request<Array<Record<string, unknown>>>(
      `/teams/statistics?team=${input.teamId}&league=${input.leagueId}&season=${input.season}`
    );
    if (!response.length) {
      return null;
    }

    const payload = response[0];
    const fixtures = payload.fixtures as Record<string, Record<string, number>>;
    const goals = payload.goals as Record<string, Record<string, unknown>>;
    const shots = (payload.shots as Record<string, Record<string, number>>) ?? {};
    const expected = (payload.expected_goals as Record<string, unknown>) ?? {};

    const played = fixtures.played?.total ?? null;
    const wins = fixtures.wins?.total ?? null;
    const draws = fixtures.draws?.total ?? null;
    const losses = fixtures.loses?.total ?? null;
    const goalsFor = readNestedNumber(goals.for?.total);
    const goalsAgainst = readNestedNumber(goals.against?.total);
    const cleanSheets = readNestedNumber(
      (payload.clean_sheet as Record<string, number> | undefined)?.total
    );
    const failedToScore = readNestedNumber(
      (payload.failed_to_score as Record<string, number> | undefined)?.total
    );

    return {
      teamId: input.teamId,
      leagueId: input.leagueId,
      season: input.season,
      form: (payload.form as string) ?? null,
      fixturesPlayed: played,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      cleanSheets,
      failedToScore,
      averageGoalsFor:
        played && goalsFor !== null && played > 0
          ? roundMetric(goalsFor / played)
          : null,
      averageGoalsAgainst:
        played && goalsAgainst !== null && played > 0
          ? roundMetric(goalsAgainst / played)
          : null,
      shotsTotal: shots.total?.total ?? null,
      shotsOnTarget: shots.on?.total ?? null,
      expectedGoals: readNestedNumber(expected.for),
      expectedGoalsAgainst: readNestedNumber(expected.against),
    };
  }

  async getInjuries(input: {
    fixtureId?: number;
    teamId?: number;
    season?: number;
  }): Promise<ApiFootballInjuryRecord[]> {
    const query = input.fixtureId
      ? `fixture=${input.fixtureId}`
      : `team=${input.teamId}&season=${input.season ?? currentSeason()}`;
    const response = await this.request<Array<Record<string, unknown>>>(
      `/injuries?${query}`
    );

    return response.map((item) => {
      const team = item.team as Record<string, unknown>;
      const player = item.player as Record<string, unknown>;
      return {
        teamId: team.id as number,
        playerName: player.name as string,
        type: (player.type as string) ?? null,
        reason: (player.reason as string) ?? null,
      };
    });
  }

  private async request<T>(path: string): Promise<T> {
    if (!this.apiKey) {
      throw new Error("API_FOOTBALL_KEY is not configured.");
    }

    if (!canMakeApiFootballRequest()) {
      throw new Error("API-Football quota exceeded.");
    }

    await this.enforceRateLimit();
    recordApiFootballRequest();

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        this.requestCount += 1;

        const response = await fetch(`${this.baseUrl}${path}`, {
          headers: {
            "x-apisports-key": this.apiKey,
          },
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.status === 429 || response.status >= 500) {
          throw new Error(`API-Football transient error: ${response.status}`);
        }

        if (!response.ok) {
          throw new Error(`API-Football request failed: ${response.status}`);
        }

        const payload = (await response.json()) as ApiFootballRawEnvelope<T>;
        if (payload.errors) {
          const serialized = Array.isArray(payload.errors)
            ? payload.errors.join(", ")
            : JSON.stringify(payload.errors);
          if (serialized && serialized !== "{}") {
            throw new Error(`API-Football error: ${serialized}`);
          }
        }

        return payload.response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries - 1) {
          await sleep(250 * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error("API-Football request failed.");
  }

  private async enforceRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minRequestIntervalMs) {
      await sleep(this.minRequestIntervalMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }
}

export function getApiFootballClient(): ApiFootballClient {
  return testClientOverride ?? new ApiFootballClient();
}

export function setApiFootballClientForTests(client: ApiFootballClient | null): void {
  testClientOverride = client;
}

function mapFixtureRecord(item: Record<string, unknown>): ApiFootballFixtureRecord {
  const fixture = item.fixture as Record<string, unknown>;
  const league = item.league as Record<string, unknown>;
  const teams = item.teams as Record<string, Record<string, unknown>>;
  const goals = item.goals as Record<string, number | null>;
  const score = item.score as Record<string, Record<string, number | null>>;
  const venue = fixture.venue as Record<string, string | null> | undefined;

  return {
    fixtureId: fixture.id as number,
    date: String(fixture.date).split("T")[0],
    league: (league.name as string) ?? null,
    leagueId: (league.id as number) ?? null,
    season: (league.season as number) ?? null,
    homeTeam: teams.home.name as string,
    awayTeam: teams.away.name as string,
    homeTeamId: teams.home.id as number,
    awayTeamId: teams.away.id as number,
    status: (fixture.status as Record<string, string>).short,
    homeGoals: goals.home ?? null,
    awayGoals: goals.away ?? null,
    halfTimeHome: score.halftime?.home ?? null,
    halfTimeAway: score.halftime?.away ?? null,
    venue: venue?.name ?? null,
    neutralVenue: Boolean(fixture.venue && venue?.name === null),
  };
}

function readNestedNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace("%", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function currentSeason(): number {
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export { mapFixtureRecord };
