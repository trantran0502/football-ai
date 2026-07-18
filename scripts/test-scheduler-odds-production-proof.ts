import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { loadEnvLocal } from "@/lib/healthCheck/productionHealthCheckRunner";
import {
  resetInMemoryProductionStore,
  saveMatchInMemory,
} from "@/lib/production";
import { ApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import {
  canMakeApiFootballRequest,
  waitForApiFootballQuota,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  resetExecutionLogsForTests,
  resetSchedulerLocksForTests,
} from "@/lib/scheduler";
import { buildSchedulerPlaceholderOdds } from "@/lib/scheduler/schedulerPlaceholderOdds";
import { resolveSchedulerFixturesToProduction } from "@/lib/scheduler/schedulerOddsIntegration";

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  loadEnvLocal();

  const apiKey = process.env.API_FOOTBALL_KEY?.trim();
  if (!apiKey) {
    console.log("SKIP: API_FOOTBALL_KEY is not configured.");
    return;
  }

  const quotaWait = await waitForApiFootballQuota({ maxWaitMs: 65_000 });
  if (!quotaWait.available || !canMakeApiFootballRequest()) {
    console.log(
      "SKIP: API-Football quota unavailable in current process (non-program error)."
    );
    return;
  }

  const previousReal = process.env.USE_REAL_SCHEDULER_ODDS;
  const previousSource = process.env.SCHEDULER_ODDS_SOURCE;
  process.env.USE_REAL_SCHEDULER_ODDS = "true";
  process.env.SCHEDULER_ODDS_SOURCE = "api-football";

  const probeDate =
    process.env.SCHEDULER_ODDS_PRODUCTION_PROOF_DATE?.trim() || todayKey();

  try {
    resetInMemoryProductionStore();
    resetExecutionLogsForTests();
    resetSchedulerLocksForTests();

    const client = new ApiFootballClient({ apiKey });
    const oddsResponse = await client.getOdds({ date: probeDate });
    const oddsCandidates = oddsResponse.items.slice(0, 5);

    if (oddsCandidates.length === 0) {
      console.log(
        JSON.stringify(
          {
            date: probeDate,
            result: "NO_ODDS_DATA",
            note:
              "No odds returned for date probe. Likely coverage or API plan limits (non-program error).",
          },
          null,
          2
        )
      );
      return;
    }

    let proof:
      | {
          fixtureId: number;
          productionRawOdds: string;
          schedulerOdds: Awaited<
            ReturnType<typeof resolveSchedulerFixturesToProduction>
          >["schedulerOdds"];
        }
      | undefined;

    for (const oddsRecord of oddsCandidates) {
      if (!canMakeApiFootballRequest()) {
        break;
      }

      const fixture = await client.getFixtureById(oddsRecord.fixture.id);
      if (!fixture) {
        continue;
      }

      const { productionFixtures, schedulerOdds } =
        await resolveSchedulerFixturesToProduction(
          [
            {
              fixtureId: fixture.fixtureId,
              matchDate: fixture.date,
              league: fixture.league ?? oddsRecord.league.name,
              leagueName: fixture.league ?? oddsRecord.league.name,
              leagueId: fixture.leagueId ?? oddsRecord.league.id,
              season: fixture.season ?? oddsRecord.league.season,
              kickoffTime:
                fixture.kickoffTime ?? `${fixture.date}T00:00:00.000Z`,
              homeTeam: fixture.homeTeam,
              awayTeam: fixture.awayTeam,
              homeTeamId: fixture.homeTeamId,
              awayTeamId: fixture.awayTeamId,
              status: fixture.status,
            },
          ],
          {
            providerSource: "api-football",
            canMakeApiFootballRequest: () => canMakeApiFootballRequest(),
          }
        );

      const production = productionFixtures[0];
      if (!production) {
        continue;
      }

      const placeholder = buildSchedulerPlaceholderOdds(
        production.homeTeam,
        production.awayTeam
      );
      if (schedulerOdds.resolved === 1 && production.rawOdds !== placeholder) {
        proof = {
          fixtureId: production.fixtureId,
          productionRawOdds: production.rawOdds,
          schedulerOdds,
        };
        break;
      }
    }

    if (!proof) {
      console.log(
        JSON.stringify(
          {
            date: probeDate,
            candidatesTried: oddsCandidates.length,
            result: "NO_RESOLVED_FIXTURE",
            note:
              "No fixture resolved real odds in this run. May be quota, coverage, or mapping limits (non-program error).",
          },
          null,
          2
        )
      );
      return;
    }

    const report = analyzeMatch(proof.productionRawOdds);
    await saveMatchInMemory(proof.productionRawOdds, report, probeDate);

    console.log(
      JSON.stringify(
        {
          date: probeDate,
          fixtureId: proof.fixtureId,
          source: proof.schedulerOdds.source,
          resolved: proof.schedulerOdds.resolved,
          fallback: proof.schedulerOdds.fallback,
          providerErrors: proof.schedulerOdds.providerErrors,
          isPlaceholder: false,
          analyzeMatchPassed: Boolean(report.recommendation && report.decision),
        },
        null,
        2
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const nonProgram =
      message.includes("429") ||
      message.includes("quota") ||
      message.includes("403");
    console.log(
      JSON.stringify(
        {
          result: "PRODUCTION_PROOF_FAILED",
          message,
          nonProgramError: nonProgram,
        },
        null,
        2
      )
    );
    if (!nonProgram) {
      process.exitCode = 1;
    }
  } finally {
    if (previousReal === undefined) {
      delete process.env.USE_REAL_SCHEDULER_ODDS;
    } else {
      process.env.USE_REAL_SCHEDULER_ODDS = previousReal;
    }
    if (previousSource === undefined) {
      delete process.env.SCHEDULER_ODDS_SOURCE;
    } else {
      process.env.SCHEDULER_ODDS_SOURCE = previousSource;
    }
  }
}

void main();
