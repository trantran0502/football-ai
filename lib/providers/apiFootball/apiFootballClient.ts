import type {
  ApiFootballClientConfig,
  ApiFootballFixtureRecord,
  ApiFootballGetTeamFormOptions,
  ApiFootballPlanSeasonRestriction,
  ApiFootballInjuryRecord,
  ApiFootballRawEnvelope,
  ApiFootballStandingRecord,
  ApiFootballTeamFormRecord,
  ApiFootballTeamRef,
  ApiFootballTeamStatisticsRecord,
} from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  buildApiFootballOddsPath,
  validateApiFootballOddsQuery,
} from "@/lib/providers/apiFootball/apiFootballOddsQuery";
import type {
  ApiFootballOddsPageEnvelope,
  ApiFootballOddsPaging,
  ApiFootballOddsRecord,
  ApiFootballOddsResponse,
} from "@/lib/providers/apiFootball/apiFootballOddsTypes";
import {
  buildApiFootballCacheKey,
  getApiFootballCacheStore,
} from "@/lib/providers/apiFootball/apiFootballCache";
import type { OddsQuery } from "@/lib/providers/providerTypes";
import {
  canMakeApiFootballRequest,
  recordApiFootballRequest,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  parseApiFootballPlanLastParameterRestriction,
  parseApiFootballPlanSeasonRestriction,
  parsePlanLastParameterRestrictionFromText,
  parsePlanSeasonRestrictionFromText,
  type ApiFootballPlanSeasonRange,
} from "@/lib/providers/apiFootball/apiFootballPlanErrors";
import {
  isApiFootballAccountSuspendedError,
  throwIfApiFootballAccountSuspended,
} from "@/lib/providers/apiFootball/apiFootballAccountErrors";

const DEFAULT_BASE_URL = "https://v3.football.api-sports.io";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 250;
const MAX_ODDS_PAGES = 100;

interface ApiFootballOddsRawEnvelope<T> extends ApiFootballRawEnvelope<T> {
  paging?: ApiFootballOddsPaging;
}

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

  async getTeamById(teamId: number): Promise<ApiFootballTeamRef | null> {
    const response = await this.request<Array<Record<string, unknown>>>(
      `/teams?id=${teamId}`
    );
    if (!response.length) {
      return null;
    }

    const team = response[0].team as Record<string, unknown>;
    return {
      id: team.id as number,
      name: team.name as string,
      country: (team.country as string) ?? null,
    };
  }

  async getFixturesByTeamSeason(
    teamId: number,
    season: number
  ): Promise<ApiFootballFixtureRecord[]> {
    const response = await this.request<Array<Record<string, unknown>>>(
      `/fixtures?team=${teamId}&season=${season}`
    );
    return response.map((item) => mapFixtureRecord(item));
  }

  async getFixturesByDate(date: string): Promise<ApiFootballFixtureRecord[]> {
    const response = await this.request<Array<Record<string, unknown>>>(
      `/fixtures?date=${date}`
    );
    return response.map((item) => mapFixtureRecord(item));
  }

  async getFixtureById(fixtureId: number): Promise<ApiFootballFixtureRecord | null> {
    const response = await this.request<Array<Record<string, unknown>>>(
      `/fixtures?id=${fixtureId}`
    );
    if (!response.length) {
      return null;
    }
    return mapFixtureRecord(response[0]);
  }

  async getFixturesByIds(fixtureIds: number[]): Promise<ApiFootballFixtureRecord[]> {
    const uniqueIds = [...new Set(fixtureIds.filter((id) => Number.isInteger(id) && id > 0))];
    if (uniqueIds.length === 0) {
      return [];
    }

    const fixtures: ApiFootballFixtureRecord[] = [];
    for (let index = 0; index < uniqueIds.length; index += 20) {
      const chunk = uniqueIds.slice(index, index + 20);
      const response = await this.request<Array<Record<string, unknown>>>(
        `/fixtures?ids=${chunk.join("-")}`
      );
      fixtures.push(...response.map((item) => mapFixtureRecord(item)));
    }

    return fixtures;
  }

  async getOdds(query: OddsQuery): Promise<ApiFootballOddsResponse> {
    validateApiFootballOddsQuery(query);

    const cacheStore = getApiFootballCacheStore();
    const items: ApiFootballOddsRecord[] = [];
    let currentPage = 1;
    let totalPages = 1;
    let pagesFetched = 0;

    while (currentPage <= totalPages && pagesFetched < MAX_ODDS_PAGES) {
      const cacheKey = buildApiFootballCacheKey("odds", {
        fixtureId: query.fixtureId,
        date: query.date,
        leagueId: query.leagueId,
        season: query.season,
        bookmakerId: query.bookmakerId,
        page: currentPage,
      });
      const cached = cacheStore.getSync<ApiFootballOddsPageEnvelope<ApiFootballOddsRecord[]>>(
        cacheKey
      );

      let page: ApiFootballOddsPageEnvelope<ApiFootballOddsRecord[]>;
      try {
        page =
          cached ??
          (await this.requestOddsPage(buildApiFootballOddsPath(query, currentPage)));
      } catch (error) {
        if (pagesFetched > 0 && isApiFootballOddsPagingLimitError(error)) {
          break;
        }
        throw error;
      }

      if (!cached) {
        cacheStore.set(cacheKey, "odds", page);
      }

      items.push(...page.response);
      pagesFetched += 1;

      const paging = page.paging;
      if (!paging || !Number.isInteger(paging.total) || paging.total <= 0) {
        break;
      }

      totalPages = paging.total;
      if (!Number.isInteger(paging.current) || paging.current >= paging.total) {
        break;
      }

      currentPage = paging.current + 1;
    }

    return {
      items,
      paging: {
        current: Math.min(currentPage, totalPages),
        total: totalPages,
      },
      pagesFetched,
    };
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

  async getTeamForm(
    teamId: number,
    last = 10,
    options: ApiFootballGetTeamFormOptions = {}
  ): Promise<ApiFootballTeamFormRecord> {
    const useLast = options.useLast ?? true;
    const requestPath = buildTeamFormRequestPath(teamId, last, {
      ...options,
      useLast,
    });
    const result = await this.requestAllowingPlanSeasonError<Array<Record<string, unknown>>>(
      requestPath
    );
    const fixtures = result.response
      .map((item) => mapFixtureRecord(item))
      .filter(
        (fixture) => fixture.homeGoals !== null && fixture.awayGoals !== null
      );
    const limitedFixtures = useLast
      ? fixtures
      : sortFixturesDesc(fixtures).slice(0, last);

    return {
      teamId,
      fixtures: limitedFixtures,
      meta: {
        requestPath,
        rawResponseCount: result.response.length,
        planRestriction: result.planRestriction,
        planLastParameterRestricted: result.planLastParameterRestricted,
      },
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
    const requestPath = `/teams/statistics?team=${input.teamId}&league=${input.leagueId}&season=${input.season}`;
    const result = await this.requestAllowingPlanSeasonError<Array<Record<string, unknown>>>(
      requestPath
    );
    if (result.planRestriction || !result.response.length) {
      return null;
    }

    const payload = result.response[0];
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

  private async requestOddsPage(
    path: string
  ): Promise<ApiFootballOddsPageEnvelope<ApiFootballOddsRecord[]>> {
    const envelope = await this.requestEnvelope<Array<Record<string, unknown>>>(path);
    return {
      response: envelope.response.map((item) => mapOddsRecord(item)),
      paging: envelope.paging,
    };
  }

  private async request<T>(path: string): Promise<T> {
    const envelope = await this.requestEnvelope<T>(path);
    return envelope.response;
  }

  private async requestEnvelope<T>(path: string): Promise<{
    response: T;
    paging: ApiFootballOddsPaging | null;
  }> {
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

        const payload = (await response.json()) as ApiFootballOddsRawEnvelope<T>;
        throwIfApiFootballAccountSuspended(payload.errors);
        if (payload.errors) {
          const serialized = Array.isArray(payload.errors)
            ? payload.errors.join(", ")
            : JSON.stringify(payload.errors);
          if (serialized && serialized !== "{}") {
            throw new Error(`API-Football error: ${serialized}`);
          }
        }

        return {
          response: payload.response,
          paging: normalizeApiFootballOddsPaging(payload.paging),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (isApiFootballAccountSuspendedError(lastError)) {
          throw lastError;
        }
        if (attempt < this.maxRetries - 1) {
          await sleep(250 * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error("API-Football request failed.");
  }

  private async requestAllowingPlanSeasonError<T>(path: string): Promise<{
    response: T;
    planRestriction: ApiFootballPlanSeasonRestriction | null;
    planLastParameterRestricted: { message: string } | null;
  }> {
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
        throwIfApiFootballAccountSuspended(payload.errors);
        const planRestriction = resolvePlanSeasonRestriction(payload.errors);
        if (planRestriction) {
          return {
            response: (payload.response ?? []) as T,
            planRestriction,
            planLastParameterRestricted: null,
          };
        }

        const planLastRestriction = resolvePlanLastParameterRestriction(payload.errors);
        if (planLastRestriction) {
          return {
            response: [] as T,
            planRestriction: null,
            planLastParameterRestricted: planLastRestriction,
          };
        }

        if (payload.errors) {
          const serialized = Array.isArray(payload.errors)
            ? payload.errors.join(", ")
            : JSON.stringify(payload.errors);
          const lastRestriction = parsePlanLastParameterRestrictionFromText(serialized);
          if (lastRestriction) {
            return {
              response: [] as T,
              planRestriction: null,
              planLastParameterRestricted: lastRestriction,
            };
          }
          if (serialized && serialized !== "{}") {
            throw new Error(`API-Football error: ${serialized}`);
          }
        }

        return {
          response: payload.response,
          planRestriction: null,
          planLastParameterRestricted: null,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (isApiFootballAccountSuspendedError(lastError)) {
          throw lastError;
        }
        const lastRestriction = parsePlanLastParameterRestrictionFromText(lastError.message);
        if (lastRestriction) {
          return {
            response: [] as T,
            planRestriction: null,
            planLastParameterRestricted: lastRestriction,
          };
        }
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

function resolvePlanSeasonRestriction(
  errors: unknown
): ApiFootballPlanSeasonRange | null {
  const direct = parseApiFootballPlanSeasonRestriction(errors);
  if (direct) {
    return direct;
  }

  if (!errors) {
    return null;
  }

  const serialized = Array.isArray(errors)
    ? errors.join(", ")
    : typeof errors === "string"
      ? errors
      : JSON.stringify(errors);

  return (
    parseApiFootballPlanSeasonRestriction(serialized) ??
    parsePlanSeasonRestrictionFromText(serialized)
  );
}

function mapOddsRecord(item: Record<string, unknown>): ApiFootballOddsRecord {
  const league = item.league as Record<string, unknown>;
  const fixture = item.fixture as Record<string, unknown>;
  const bookmakers = (item.bookmakers as Array<Record<string, unknown>>) ?? [];

  return {
    league: {
      id: league.id as number,
      name: league.name as string,
      country: (league.country as string) ?? null,
      logo: (league.logo as string) ?? null,
      flag: (league.flag as string) ?? null,
      season: league.season as number,
    },
    fixture: {
      id: fixture.id as number,
      timezone: (fixture.timezone as string) ?? null,
      date: String(fixture.date),
      timestamp: (fixture.timestamp as number) ?? null,
    },
    update: String(item.update ?? ""),
    bookmakers: bookmakers.map((bookmaker) => ({
      id: bookmaker.id as number,
      name: bookmaker.name as string,
      bets: ((bookmaker.bets as Array<Record<string, unknown>>) ?? []).map((bet) => ({
        id: bet.id as number,
        name: bet.name as string,
        values: ((bet.values as Array<Record<string, unknown>>) ?? []).map((value) => ({
          value: String(value.value ?? ""),
          odd: String(value.odd ?? ""),
        })),
      })),
    })),
  };
}

function normalizeApiFootballOddsPaging(
  paging: ApiFootballOddsPaging | undefined
): ApiFootballOddsPaging | null {
  if (!paging) {
    return null;
  }
  const current = Number(paging.current);
  const total = Number(paging.total);
  if (!Number.isInteger(current) || !Number.isInteger(total) || current <= 0 || total <= 0) {
    return null;
  }
  return { current, total };
}

function isApiFootballOddsPagingLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /page parameter/i.test(message);
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
    kickoffTime: typeof fixture.date === "string" ? fixture.date : null,
    league: (league.name as string) ?? null,
    leagueId: (league.id as number) ?? null,
    season: (league.season as number) ?? null,
    homeTeam: teams.home.name as string,
    awayTeam: teams.away.name as string,
    homeTeamId: teams.home.id as number,
    awayTeamId: teams.away.id as number,
    status: (fixture.status as Record<string, string>).short,
    homeGoals: goals.home ?? score.fulltime?.home ?? null,
    awayGoals: goals.away ?? score.fulltime?.away ?? null,
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

export function getApiFootballCurrentSeason(now = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function resolvePlanLastParameterRestriction(
  errors: unknown
): { message: string } | null {
  const direct = parseApiFootballPlanLastParameterRestriction(errors);
  if (direct) {
    return direct;
  }

  if (!errors) {
    return null;
  }

  const serialized = Array.isArray(errors)
    ? errors.join(", ")
    : typeof errors === "string"
      ? errors
      : JSON.stringify(errors);

  return (
    parseApiFootballPlanLastParameterRestriction(serialized) ??
    parsePlanLastParameterRestrictionFromText(serialized)
  );
}

function sortFixturesDesc(
  fixtures: ApiFootballFixtureRecord[]
): ApiFootballFixtureRecord[] {
  return [...fixtures].sort((left, right) => {
    const leftTime = left.kickoffTime ?? left.date;
    const rightTime = right.kickoffTime ?? right.date;
    return rightTime.localeCompare(leftTime);
  });
}

function buildTeamFormRequestPath(
  teamId: number,
  last: number,
  options: ApiFootballGetTeamFormOptions
): string {
  const params = new URLSearchParams();
  params.set("team", String(teamId));
  if (options.useLast !== false) {
    params.set("last", String(last));
  }
  if (options.leagueId !== undefined) {
    params.set("league", String(options.leagueId));
  }
  if (options.season !== undefined) {
    params.set("season", String(options.season));
  }
  if (options.status) {
    params.set("status", options.status);
  }
  return `/fixtures?${params.toString()}`;
}

function currentSeason(): number {
  return getApiFootballCurrentSeason();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export { mapFixtureRecord };
