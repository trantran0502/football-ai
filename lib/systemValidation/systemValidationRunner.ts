import { execSync } from "child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { fuseFeatureScores } from "@/lib/analysis/featureScore/fusion/featureFusionEngine";
import type { FeatureScore } from "@/lib/analysis/featureScore/types";
import { generateRecommendations } from "@/lib/recommendation/recommendationEngine";
import {
  hasMarketEngineIntegratedReasons,
  MARKET_ENGINE_INTEGRATION_REASON_PREFIX,
} from "@/lib/recommendation/marketEngineIntegration";
import { runMarketEngine } from "@/lib/recommendation/marketEngine/marketEngine";
import { evaluateMarketOddsRules } from "@/lib/recommendation/marketEngine/marketOddsRules";
import type { MarketAnalysis } from "@/lib/recommendation/marketEngine/marketEngineTypes";
import { MARKET_ENGINE_BASE_SCORE } from "@/lib/recommendation/marketEngine/marketScore";
import {
  listPatternIds,
  MARKET_PATTERN_REGISTRY,
} from "@/lib/recommendation/marketEngine/patterns/patternRegistry";
import {
  listMarketRuleIds,
  MARKET_RULE_REGISTRY,
} from "@/lib/recommendation/marketEngine/rules/ruleRegistry";
import { runMarketRuleEngine } from "@/lib/recommendation/marketEngine/rules/ruleEngine";
import {
  evaluateVerifiedMatchForKnowledge,
} from "@/lib/recommendation/marketKnowledge/marketKnowledgeAccumulator";
import {
  buildMarketKnowledgeFromVerifiedMatches,
  updateMarketKnowledgeFromVerifiedMatches,
} from "@/lib/recommendation/marketKnowledge/marketKnowledgeFromVerified";
import { updateMarketKnowledgeIncrementally } from "@/lib/recommendation/marketKnowledge/incremental/marketKnowledgeIncremental";
import {
  computeSnapshotChecksum,
  createFileMarketKnowledgeRepository,
  createInMemoryMarketKnowledgeRepository,
  rebuildManifest,
} from "@/lib/recommendation/marketKnowledge/persistence";
import { createDefaultSnapshotMetadata } from "@/lib/recommendation/marketKnowledge/persistence/marketKnowledgeVersioning";
import { MARKET_KNOWLEDGE_SNAPSHOT_VERSION } from "@/lib/recommendation/marketKnowledge/marketKnowledgeSnapshot";
import {
  createInMemoryMarketKnowledgeStore,
  resetMarketKnowledgeStoreForTests,
} from "@/lib/recommendation/marketKnowledge/marketKnowledgeStore";
import type {
  HistoricalPattern,
  LeagueStatistics,
  MarketKnowledgeSnapshot,
  MarketStatisticsMap,
  PatternStatistics,
  RuleStatistics,
} from "@/lib/recommendation/marketKnowledge/marketKnowledgeTypes";
import { replayMarketKnowledge } from "@/lib/recommendation/marketKnowledge/replay/marketKnowledgeReplayRunner";
import {
  buildSystemValidationFixtures,
  SYSTEM_VALIDATION_FIXTURE_SPECS,
} from "./systemValidationFixtures";
import {
  printSystemValidationConsoleSummary,
  writeSystemValidationReports,
} from "./systemValidationReport";
import type {
  ConsistencyDiffResult,
  SystemValidationReport,
  SystemValidationRunOptions,
  SystemValidationRunResult,
  ValidationCheckDetail,
  ValidationSectionResult,
  ValidationStatus,
} from "./systemValidationTypes";

const PLACEHOLDER_RULE_IDS = new Set(["SteamMoveRule", "SharpMoneyRule"]);

function emptySection(name: string): ValidationSectionResult {
  return {
    name,
    status: "PASS",
    checksPassed: 0,
    checksFailed: 0,
    warnings: [],
    errors: [],
    details: [],
  };
}

function finalizeSection(section: ValidationSectionResult): ValidationSectionResult {
  section.status = section.checksFailed > 0 ? "FAIL" : "PASS";
  return section;
}

function addCheck(
  section: ValidationSectionResult,
  detail: ValidationCheckDetail
): void {
  section.details.push(detail);
  if (detail.status === "FAIL") {
    section.checksFailed += 1;
    section.errors.push(`${detail.name}: ${detail.message ?? "failed"}`);
  } else {
    section.checksPassed += 1;
  }
}

function pass(section: ValidationSectionResult, name: string, message?: string): void {
  addCheck(section, { name, status: "PASS", message });
}

function fail(
  section: ValidationSectionResult,
  name: string,
  message: string,
  expected?: string,
  actual?: string,
  stack?: string
): void {
  addCheck(section, { name, status: "FAIL", message, expected, actual, stack });
}

function tryResolveGitCommit(): string | null {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

export interface NormalizedKnowledgeStatistics {
  ruleStatistics: Array<Omit<RuleStatistics, "lastUpdated">>;
  patternStatistics: PatternStatistics[];
  marketStatistics: MarketStatisticsMap;
  leagueStatistics: LeagueStatistics[];
  historicalPatterns: HistoricalPattern[];
}

export function normalizeKnowledgeStatistics(
  snapshot: MarketKnowledgeSnapshot
): NormalizedKnowledgeStatistics {
  const stripRule = ({
    lastUpdated: _lastUpdated,
    ...rest
  }: RuleStatistics): Omit<RuleStatistics, "lastUpdated"> => rest;

  return {
    ruleStatistics: snapshot.ruleStatistics.map(stripRule),
    patternStatistics: snapshot.patternStatistics.map((item) => ({ ...item })),
    marketStatistics: snapshot.marketStatistics,
    leagueStatistics: snapshot.leagueStatistics.map((item) => ({ ...item })),
    historicalPatterns: snapshot.historicalPatterns.map((item) => ({ ...item })),
  };
}

export function statisticsChecksum(
  snapshot: MarketKnowledgeSnapshot,
  matchCount: number
): string {
  const normalizedStats = normalizeKnowledgeStatistics(snapshot);
  const metadata = createDefaultSnapshotMetadata({
    source: "MANUAL",
    matchCount,
    firstMatchId: "normalized-first",
    lastMatchId: "normalized-last",
    parentSnapshotId: null,
  });

  const payload = {
    ...snapshot,
    id: "normalized-snapshot",
    generatedAt: "2026-01-15T12:00:00.000Z",
    metadata: undefined,
    ...normalizedStats,
    version: MARKET_KNOWLEDGE_SNAPSHOT_VERSION,
    status: "available" as const,
  } as MarketKnowledgeSnapshot;

  return computeSnapshotChecksum(payload, metadata);
}

export function findFirstStatisticsDiff(
  batch: NormalizedKnowledgeStatistics,
  replay: NormalizedKnowledgeStatistics,
  incremental: NormalizedKnowledgeStatistics
): ConsistencyDiffResult | null {
  const sections: Array<keyof NormalizedKnowledgeStatistics> = [
    "ruleStatistics",
    "patternStatistics",
    "marketStatistics",
    "leagueStatistics",
    "historicalPatterns",
  ];

  for (const section of sections) {
    const batchJson = JSON.stringify(batch[section]);
    const replayJson = JSON.stringify(replay[section]);
    const incrementalJson = JSON.stringify(incremental[section]);
    if (batchJson === replayJson && batchJson === incrementalJson) {
      continue;
    }

    if (section === "ruleStatistics") {
      const ruleIds = new Set([
        ...batch.ruleStatistics.map((item) => item.ruleId),
        ...replay.ruleStatistics.map((item) => item.ruleId),
        ...incremental.ruleStatistics.map((item) => item.ruleId),
      ]);
      for (const ruleId of ruleIds) {
        const batchRule = batch.ruleStatistics.find((item) => item.ruleId === ruleId);
        const replayRule = replay.ruleStatistics.find((item) => item.ruleId === ruleId);
        const incrementalRule = incremental.ruleStatistics.find((item) => item.ruleId === ruleId);
        const fields = [
          "sampleSize",
          "hitCount",
          "missCount",
          "pushCount",
          "hitRate",
          "roi",
        ] as const;
        for (const field of fields) {
          const left = batchRule?.[field];
          const middle = replayRule?.[field];
          const right = incrementalRule?.[field];
          if (left !== middle || left !== right) {
            return {
              path: `ruleStatistics.${ruleId}.${field}`,
              batch: left ?? null,
              replay: middle ?? null,
              incremental: right ?? null,
            };
          }
        }
      }
    }

    return {
      path: section,
      batch: batch[section],
      replay: replay[section],
      incremental: incremental[section],
    };
  }

  return null;
}

function validateBuild(skipBuild: boolean): ValidationSectionResult {
  const section = emptySection("Build");
  if (skipBuild) {
    section.status = "SKIP";
    pass(section, "build skipped", "skipBuild=true");
    return section;
  }

  try {
    execSync("npm run build", { stdio: "pipe", encoding: "utf8" });
    pass(section, "npm run build");
  } catch (error) {
    fail(
      section,
      "npm run build",
      error instanceof Error ? error.message : String(error),
      "exit code 0",
      "non-zero",
      error instanceof Error ? error.stack : undefined
    );
  }

  return finalizeSection(section);
}

function validateUnitTests(skipUnitTests: boolean): ValidationSectionResult & {
  passed: number;
  failed: number;
  skipped: number;
} {
  const section = {
    ...emptySection("Unit Tests"),
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  if (skipUnitTests) {
    section.status = "SKIP";
    pass(section, "unit tests skipped", "skipUnitTests=true");
    return section;
  }

  try {
    execSync("npm test", { stdio: "pipe", encoding: "utf8" });
    pass(section, "npm test");
    section.passed = 1;
  } catch (error) {
    const output =
      (error as { stdout?: string; stderr?: string }).stdout ??
      (error as { stdout?: string; stderr?: string }).stderr ??
      String(error);
    fail(section, "npm test", "npm test failed", "exit code 0", "non-zero", output.slice(0, 4000));
    section.failed = 1;
  }

  return { ...finalizeSection(section), passed: section.passed, failed: section.failed, skipped: section.skipped };
}

function validateMarketEngine(fixtures: HistoricalMatchRecord[]): ValidationSectionResult {
  const section = emptySection("Market Engine");

  for (const fixture of fixtures) {
    const snapshot = runMarketEngine(fixture.marketSelections);
    pass(section, `${fixture.id} market count`, `${snapshot.markets.length} markets`);

    for (const analysis of snapshot.markets) {
      const prefix = `${fixture.id}.${analysis.marketType}`;
      pass(section, `${prefix} exists`);

      if (analysis.marketScore < 0 || analysis.marketScore > 100) {
        fail(section, `${prefix}.marketScore range`, "marketScore out of range", "0-100", String(analysis.marketScore));
      } else {
        pass(section, `${prefix}.marketScore range`);
      }

      if (analysis.confidence < 0 || analysis.confidence > 1) {
        fail(section, `${prefix}.confidence range`, "confidence out of range", "0-1", String(analysis.confidence));
      } else {
        pass(section, `${prefix}.confidence range`);
      }

      if (analysis.baseScore !== MARKET_ENGINE_BASE_SCORE) {
        fail(section, `${prefix}.baseScore`, "baseScore mismatch", "65", String(analysis.baseScore));
      } else {
        pass(section, `${prefix}.baseScore`);
      }

      const ruleAdjustment = analysis.ruleResults
        .filter((rule) => rule.triggered && rule.scoreAdjustment !== 0)
        .reduce((sum, rule) => sum + rule.scoreAdjustment, 0);
      const scoreAfterRules = MARKET_ENGINE_BASE_SCORE + ruleAdjustment;
      const expectedFinal = Math.min(100, Math.max(0, Math.round(scoreAfterRules + analysis.patternAdjustment)));

      if (analysis.finalScore !== expectedFinal) {
        fail(
          section,
          `${prefix}.finalScore`,
          "finalScore calculation mismatch",
          String(expectedFinal),
          String(analysis.finalScore)
        );
      } else {
        pass(section, `${prefix}.finalScore`);
      }

      if (!analysis.ruleResults.length) {
        fail(section, `${prefix}.ruleResults`, "missing ruleResults");
      } else {
        pass(section, `${prefix}.ruleResults`);
      }

      if (!analysis.auditLog.length) {
        fail(section, `${prefix}.auditLog`, "missing auditLog");
      } else {
        pass(section, `${prefix}.auditLog`);
      }

      if (!analysis.scoreBreakdown.length) {
        fail(section, `${prefix}.scoreBreakdown`, "missing scoreBreakdown");
      } else {
        pass(section, `${prefix}.scoreBreakdown`);
      }

      if (!analysis.recommendation.label) {
        fail(section, `${prefix}.recommendation`, "empty recommendation");
      } else {
        pass(section, `${prefix}.recommendation`);
      }

      if (!["low", "medium", "high"].includes(analysis.riskLevel)) {
        fail(section, `${prefix}.riskLevel`, "invalid riskLevel", "low|medium|high", analysis.riskLevel);
      } else {
        pass(section, `${prefix}.riskLevel`);
      }
    }
  }

  return finalizeSection(section);
}

function validateRules(fixtures: HistoricalMatchRecord[]): ValidationSectionResult {
  const section = emptySection("Rules");
  const ruleIds = listMarketRuleIds();
  const triggerCounts = new Map<string, number>();
  const noTriggerCounts = new Map<string, number>();

  for (const ruleId of ruleIds) {
    triggerCounts.set(ruleId, 0);
    noTriggerCounts.set(ruleId, 0);
  }

  const uniqueIds = new Set(ruleIds);
  if (uniqueIds.size === ruleIds.length) {
    pass(section, "rule registry unique ids");
  } else {
    fail(section, "rule registry unique ids", "duplicate rule ids detected");
  }

  for (const fixture of fixtures) {
    const engineSnapshot = runMarketEngine(fixture.marketSelections);
    for (const analysis of engineSnapshot.markets) {
      if (analysis.auditLog.length !== MARKET_RULE_REGISTRY.length) {
        fail(
          section,
          `${fixture.id}.${analysis.marketType}.audit count`,
          "audit rule count mismatch",
          String(MARKET_RULE_REGISTRY.length),
          String(analysis.auditLog.length)
        );
      } else {
        pass(section, `${fixture.id}.${analysis.marketType}.audit count`);
      }

      for (const rule of analysis.ruleResults) {
        if (rule.triggered) {
          triggerCounts.set(rule.id, (triggerCounts.get(rule.id) ?? 0) + 1);
        } else {
          noTriggerCounts.set(rule.id, (noTriggerCounts.get(rule.id) ?? 0) + 1);
        }

        if (PLACEHOLDER_RULE_IDS.has(rule.id) && rule.triggered) {
          fail(section, `${rule.id} placeholder`, "placeholder rule must not trigger");
        }
        if (PLACEHOLDER_RULE_IDS.has(rule.id) && rule.reason.toLowerCase().includes("historical")) {
          fail(section, `${rule.id} placeholder reason`, "placeholder must not fake historical signal");
        }
      }
    }

    for (const marketType of ["1X2", "AH", "O/U", "BTTS"] as const) {
      const selections = fixture.marketSelections;
      const oddsContext = evaluateMarketOddsRules(
        selections.filter((item) => {
          if (marketType === "1X2") return item.marketType === "moneyline";
          if (marketType === "AH") return item.marketType === "handicap";
          if (marketType === "O/U") return item.marketType === "totalGoals";
          return item.marketType === "btts";
        })
      );
      if (oddsContext.selections.length === 0) {
        continue;
      }
      const ruleResults = runMarketRuleEngine({
        marketType,
        selections,
        oddsContext,
      }).ruleResults;
      for (const rule of ruleResults) {
        if (rule.triggered) {
          triggerCounts.set(rule.id, (triggerCounts.get(rule.id) ?? 0) + 1);
        } else {
          noTriggerCounts.set(rule.id, (noTriggerCounts.get(rule.id) ?? 0) + 1);
        }
      }
    }
  }

  for (const ruleId of ruleIds) {
    if (PLACEHOLDER_RULE_IDS.has(ruleId)) {
      if ((triggerCounts.get(ruleId) ?? 0) === 0) {
        pass(section, `${ruleId} placeholder never triggers`);
      } else {
        fail(section, `${ruleId} placeholder never triggers`, "placeholder rule triggered");
      }
      if ((noTriggerCounts.get(ruleId) ?? 0) > 0) {
        pass(section, `${ruleId} not triggered at least once`);
      } else {
        fail(section, `${ruleId} not triggered at least once`, "placeholder rule missing not-trigger coverage");
      }
      continue;
    }

    if ((triggerCounts.get(ruleId) ?? 0) > 0) {
      pass(section, `${ruleId} triggered at least once`);
    } else {
      fail(section, `${ruleId} triggered at least once`, "rule never triggered across fixtures");
    }
    if ((noTriggerCounts.get(ruleId) ?? 0) > 0) {
      pass(section, `${ruleId} not triggered at least once`);
    } else {
      fail(section, `${ruleId} not triggered at least once`, "rule always triggered across fixtures");
    }
  }

  return finalizeSection(section);
}

function validatePatterns(fixtures: HistoricalMatchRecord[]): ValidationSectionResult {
  const section = emptySection("Patterns");
  const patternIds = listPatternIds();
  const matchCounts = new Map<string, number>();
  const noMatchCounts = new Map<string, number>();

  for (const patternId of patternIds) {
    matchCounts.set(patternId, 0);
    noMatchCounts.set(patternId, 0);
  }

  if (new Set(patternIds).size === patternIds.length) {
    pass(section, "pattern registry unique ids");
  } else {
    fail(section, "pattern registry unique ids", "duplicate pattern ids detected");
  }

  for (const fixture of fixtures) {
    const engineSnapshot = runMarketEngine(fixture.marketSelections);
    for (const analysis of engineSnapshot.markets) {
      if (!analysis.patternAudit.length) {
        fail(section, `${fixture.id}.${analysis.marketType}.patternAudit`, "missing pattern audit");
        continue;
      }

      for (const audit of analysis.patternAudit) {
        if (audit.matched) {
          matchCounts.set(audit.patternId, (matchCounts.get(audit.patternId) ?? 0) + 1);
        } else {
          noMatchCounts.set(audit.patternId, (noMatchCounts.get(audit.patternId) ?? 0) + 1);
        }

        if (!audit.reason) {
          fail(section, `${fixture.id}.${audit.patternId}.reason`, "missing pattern audit reason");
        } else {
          pass(section, `${fixture.id}.${audit.patternId}.reason`);
        }
      }

      for (const pattern of analysis.matchedPatterns) {
        for (const ruleId of pattern.matchedRules) {
          const triggered = analysis.ruleResults.some((rule) => rule.id === ruleId && rule.triggered);
          if (!triggered) {
            fail(
              section,
              `${fixture.id}.${pattern.id}.matchedRules`,
              `matched rule ${ruleId} not triggered`,
              "triggered",
              "not triggered"
            );
          } else {
            pass(section, `${fixture.id}.${pattern.id}.matchedRules.${ruleId}`);
          }
        }
      }

      if (analysis.patternAudit.length !== MARKET_PATTERN_REGISTRY.length) {
        fail(
          section,
          `${fixture.id}.${analysis.marketType}.pattern audit count`,
          "pattern audit count mismatch",
          String(MARKET_PATTERN_REGISTRY.length),
          String(analysis.patternAudit.length)
        );
      }
    }

    for (const definition of MARKET_PATTERN_REGISTRY) {
      for (const optionalRule of definition.optionalRules) {
        if (definition.requiredRules.includes(optionalRule)) {
          fail(
            section,
            `${definition.id}.optionalRules`,
            `optional rule ${optionalRule} duplicated as required`
          );
        }
      }
    }
  }

  for (const patternId of patternIds) {
    if ((matchCounts.get(patternId) ?? 0) > 0) {
      pass(section, `${patternId} matched at least once`);
    } else {
      fail(section, `${patternId} matched at least once`, "pattern never matched across fixtures");
    }
    if ((noMatchCounts.get(patternId) ?? 0) > 0) {
      pass(section, `${patternId} not matched at least once`);
    } else {
      fail(section, `${patternId} not matched at least once`, "pattern always matched across fixtures");
    }
  }

  return finalizeSection(section);
}

function validateKnowledgeBatch(fixtures: HistoricalMatchRecord[]): ValidationSectionResult {
  const section = emptySection("Knowledge Batch");
  resetMarketKnowledgeStoreForTests();

  try {
    const result = updateMarketKnowledgeFromVerifiedMatches(fixtures, {
      generatedAt: fixtures[fixtures.length - 1]?.verificationResult?.verifiedAt,
    });
    const snapshot = result.snapshot;

    for (const rule of snapshot.ruleStatistics) {
      const total = rule.hitCount + rule.missCount + rule.pushCount;
      if (total !== rule.sampleSize) {
        fail(
          section,
          `ruleStatistics.${rule.ruleId}.sampleSize`,
          "hit+miss+push must equal sampleSize",
          String(rule.sampleSize),
          String(total)
        );
      } else {
        pass(section, `ruleStatistics.${rule.ruleId}.sampleSize`);
      }

      const expectedHitRate =
        rule.hitCount + rule.missCount === 0 ? 0 : rule.hitCount / (rule.hitCount + rule.missCount);
      if (Math.abs(rule.hitRate - expectedHitRate) > 1e-9) {
        fail(section, `ruleStatistics.${rule.ruleId}.hitRate`, "hitRate mismatch", String(expectedHitRate), String(rule.hitRate));
      } else {
        pass(section, `ruleStatistics.${rule.ruleId}.hitRate`);
      }

      for (const field of ["roi", "averageOdds", "averageConfidence", "averageMarketScore", "sampleSize", "hitRate"] as const) {
        const value = rule[field];
        if (!Number.isFinite(value) || Number.isNaN(value)) {
          fail(section, `ruleStatistics.${rule.ruleId}.${field}`, "invalid number");
        }
      }
    }

    for (const marketType of Object.keys(snapshot.marketStatistics) as Array<keyof MarketStatisticsMap>) {
      pass(section, `marketStatistics.${marketType} present`);
    }

    for (const league of snapshot.leagueStatistics) {
      pass(section, `leagueStatistics.${league.leagueId}.${league.marketType}`);
    }

    for (const historical of snapshot.historicalPatterns) {
      pass(section, `historicalPatterns.${historical.marketType}.${historical.leagueId ?? "none"}`);
    }

    pass(section, "batch snapshot generated", snapshot.id);
  } catch (error) {
    fail(
      section,
      "updateMarketKnowledgeFromVerifiedMatches",
      error instanceof Error ? error.message : String(error),
      undefined,
      undefined,
      error instanceof Error ? error.stack : undefined
    );
  } finally {
    resetMarketKnowledgeStoreForTests();
  }

  return finalizeSection(section);
}

function validateReplay(fixtures: HistoricalMatchRecord[]): ValidationSectionResult {
  const section = emptySection("Replay");
  resetMarketKnowledgeStoreForTests();

  const dryStore = createInMemoryMarketKnowledgeStore();
  const dryRepo = createInMemoryMarketKnowledgeRepository();
  const dryResult = replayMarketKnowledge({
    matches: fixtures,
    dryRun: true,
    store: dryStore,
    repository: dryRepo,
  });

  if (dryResult.report.matchesProcessed !== fixtures.length) {
    fail(
      section,
      "dryRun.matchesProcessed",
      "processed count mismatch",
      String(fixtures.length),
      String(dryResult.report.matchesProcessed)
    );
  } else {
    pass(section, "dryRun.matchesProcessed");
  }

  if (dryStore.listSnapshots().length !== 0 || dryRepo.listSnapshots().length !== 0) {
    fail(section, "dryRun.no writes", "dry run must not write store/repository");
  } else {
    pass(section, "dryRun.no writes");
  }

  const store = createInMemoryMarketKnowledgeStore();
  const realResult = replayMarketKnowledge({
    matches: fixtures,
    dryRun: false,
    store,
  });

  if (realResult.report.snapshotCount !== fixtures.length) {
    fail(
      section,
      "real.snapshotCount",
      "snapshot count mismatch",
      String(fixtures.length),
      String(realResult.report.snapshotCount)
    );
  } else {
    pass(section, "real.snapshotCount");
  }

  if (store.listSnapshots().length !== fixtures.length) {
    fail(section, "real.store writes", "real replay must save each snapshot");
  } else {
    pass(section, "real.store writes");
  }

  const snapshotIds = new Set<string>();
  for (const step of realResult.report.steps) {
    if (snapshotIds.has(step.snapshotId)) {
      fail(section, `step.${step.stepIndex}.snapshotId`, "duplicate snapshot id");
    } else {
      snapshotIds.add(step.snapshotId);
      pass(section, `step.${step.stepIndex}.snapshotId unique`);
    }

    const audit = realResult.report.audit.find((entry) => entry.stepIndex === step.stepIndex);
    if (!audit || audit.matchId !== step.matchId) {
      fail(section, `step.${step.stepIndex}.audit`, "audit matchId mismatch");
    } else {
      pass(section, `step.${step.stepIndex}.audit`);
    }
  }

  for (let index = 1; index < realResult.report.snapshots.length; index += 1) {
    const previous = realResult.report.snapshots[index - 1];
    const current = realResult.report.snapshots[index];
    for (const rule of current.ruleStatistics) {
      const prev = previous.ruleStatistics.find((item) => item.ruleId === rule.ruleId);
      if (prev && rule.sampleSize < prev.sampleSize) {
        fail(section, `monotonic.${rule.ruleId}`, "sampleSize decreased during replay");
      }
    }
  }
  pass(section, "monotonic sampleSize");

  if (!realResult.report.statisticsDiff) {
    fail(section, "statisticsDiff", "missing statistics diff");
  } else {
    pass(section, "statisticsDiff");
  }

  resetMarketKnowledgeStoreForTests();
  return finalizeSection(section);
}

function validatePersistence(tempDir: string): ValidationSectionResult {
  const section = emptySection("Persistence");
  const repo = createFileMarketKnowledgeRepository(tempDir);
  const fixtures = buildSystemValidationFixtures().slice(0, 2);
  const snapshot = buildMarketKnowledgeFromVerifiedMatches(fixtures, {
    snapshotId: "sv-persist-1",
    generatedAt: "2026-01-15T12:00:00.000Z",
  });
  snapshot.version = MARKET_KNOWLEDGE_SNAPSHOT_VERSION;

  const saveReport = repo.saveSnapshot(snapshot, { metadata: { source: "MANUAL", matchCount: 2 } });
  pass(section, "saveSnapshot");

  const loaded = repo.loadSnapshot(snapshot.id);
  if (!loaded || loaded.id !== snapshot.id) {
    fail(section, "loadSnapshot", "loaded snapshot mismatch");
  } else {
    pass(section, "loadSnapshot");
  }

  const latest = repo.loadLatestSnapshot();
  if (!latest || latest.id !== snapshot.id) {
    fail(section, "loadLatestSnapshot", "latest snapshot mismatch");
  } else {
    pass(section, "loadLatestSnapshot");
  }

  if (repo.listSnapshots().length !== 1) {
    fail(section, "listSnapshots", "expected one snapshot");
  } else {
    pass(section, "listSnapshots");
  }

  if (!repo.snapshotExists(snapshot.id)) {
    fail(section, "snapshotExists", "snapshot should exist");
  } else {
    pass(section, "snapshotExists");
  }

  const manifest = repo.getManifest?.();
  if (!manifest || manifest.latestSnapshotId !== snapshot.id || manifest.snapshotCount !== 1) {
    fail(section, "manifest", "manifest metadata incorrect");
  } else {
    pass(section, "manifest");
  }

  try {
    repo.saveSnapshot(snapshot);
    fail(section, "duplicate protection", "expected duplicate error");
  } catch {
    pass(section, "duplicate protection");
  }

  repo.saveSnapshot(snapshot, { overwrite: true, metadata: { source: "MANUAL", matchCount: 2 } });
  pass(section, "overwrite=true");

  const checksumSnapshot = buildMarketKnowledgeFromVerifiedMatches(fixtures, {
    snapshotId: "sv-persist-checksum",
    generatedAt: "2026-01-15T12:00:00.000Z",
  });
  checksumSnapshot.version = MARKET_KNOWLEDGE_SNAPSHOT_VERSION;
  const firstChecksum = repo.saveSnapshot(checksumSnapshot, {
    metadata: { source: "MANUAL", matchCount: 2 },
  }).checksum;
  const sameChecksum = repo.saveSnapshot(checksumSnapshot, {
    metadata: { source: "MANUAL", matchCount: 2 },
    overwrite: true,
  }).checksum;
  if (sameChecksum !== firstChecksum) {
    fail(section, "deterministic checksum same content", "same content checksum mismatch", firstChecksum, sameChecksum);
  } else {
    pass(section, "deterministic checksum same content");
  }

  const corruptPath = repo.getSnapshotPath(checksumSnapshot.id);
  const raw = readFileSync(corruptPath, "utf8");
  const parsed = JSON.parse(raw) as { checksum: string };
  parsed.checksum = "0".repeat(64);
  writeFileSync(corruptPath, JSON.stringify(parsed), "utf8");

  try {
    repo.loadSnapshot(checksumSnapshot.id);
    fail(section, "checksum corruption detection", "expected integrity error");
  } catch {
    pass(section, "checksum corruption detection");
  }

  const tempFiles = readdirSync(repo.getSnapshotsDir());
  if (tempFiles.some((file) => file.endsWith(".tmp"))) {
    fail(section, "atomic save", "tmp files remain after save");
  } else {
    pass(section, "atomic save");
  }

  repo.deleteSnapshot(snapshot.id);
  pass(section, "deleteSnapshot");

  writeFileSync(repo.getSnapshotPath("sv-corrupt"), "{ invalid", "utf8");
  const rebuilt = rebuildManifest(tempDir);
  if (rebuilt.invalidSnapshots.length === 0) {
    fail(section, "rebuildManifest.invalidSnapshots", "expected invalid snapshot detection");
  } else {
    pass(section, "rebuildManifest.invalidSnapshots");
  }
  pass(section, "rebuildManifest.validSnapshots", `${rebuilt.validSnapshots.length} valid`);

  return finalizeSection(section);
}

function validateIncremental(fixtures: HistoricalMatchRecord[]): ValidationSectionResult {
  const section = emptySection("Incremental");
  const repo = createInMemoryMarketKnowledgeRepository();
  let latest: MarketKnowledgeSnapshot | null = null;
  const parentIds: string[] = [];

  for (const fixture of fixtures) {
    const previousId = latest?.id ?? null;
    const result = updateMarketKnowledgeIncrementally({
      latestSnapshot: latest,
      verifiedMatch: fixture,
      repository: repo,
      generatedAt: fixture.verificationResult?.verifiedAt,
    });

    if (result.skipped) {
      fail(section, `${fixture.id}.skipped`, result.skipReason ?? "unexpected skip");
      continue;
    }

    if (result.report.parentSnapshotId !== previousId) {
      fail(
        section,
        `${fixture.id}.parentSnapshotId`,
        "parent snapshot mismatch",
        previousId ?? "null",
        result.report.parentSnapshotId ?? "null"
      );
    } else {
      pass(section, `${fixture.id}.parentSnapshotId`);
    }

    if (previousId && latest && JSON.stringify(latest) !== JSON.stringify(repo.loadSnapshot(previousId))) {
      fail(section, `${fixture.id}.immutable previous`, "previous snapshot modified");
    } else {
      pass(section, `${fixture.id}.immutable previous`);
    }

    latest = result.snapshot;
    parentIds.push(result.snapshot.id);
  }

  if (repo.listSnapshots().length !== fixtures.length) {
    fail(
      section,
      "repository count",
      "repository snapshot count mismatch",
      String(fixtures.length),
      String(repo.listSnapshots().length)
    );
  } else {
    pass(section, "repository count");
  }

  return finalizeSection(section);
}

function validateConsistency(fixtures: HistoricalMatchRecord[]): ValidationSectionResult & {
  firstDiff: ConsistencyDiffResult | null;
  batchChecksum: string | null;
  replayChecksum: string | null;
  incrementalChecksum: string | null;
} {
  const section = {
    ...emptySection("Consistency"),
    firstDiff: null as ConsistencyDiffResult | null,
    batchChecksum: null as string | null,
    replayChecksum: null as string | null,
    incrementalChecksum: null as string | null,
  };

  resetMarketKnowledgeStoreForTests();
  const batchSnapshot = buildMarketKnowledgeFromVerifiedMatches(fixtures, {
    generatedAt: fixtures[fixtures.length - 1]?.verificationResult?.verifiedAt,
  });
  batchSnapshot.version = MARKET_KNOWLEDGE_SNAPSHOT_VERSION;

  const replayResult = replayMarketKnowledge({ matches: fixtures, dryRun: true });
  const replaySnapshot = replayResult.report.snapshots[replayResult.report.snapshots.length - 1];

  let incrementalLatest: MarketKnowledgeSnapshot | null = null;
  for (const fixture of fixtures) {
    incrementalLatest = updateMarketKnowledgeIncrementally({
      latestSnapshot: incrementalLatest,
      verifiedMatch: fixture,
      generatedAt: fixture.verificationResult?.verifiedAt,
      dryRun: true,
    }).snapshot;
  }

  const batchStats = normalizeKnowledgeStatistics(batchSnapshot);
  const replayStats = normalizeKnowledgeStatistics(replaySnapshot);
  const incrementalStats = normalizeKnowledgeStatistics(incrementalLatest!);

  section.firstDiff = findFirstStatisticsDiff(batchStats, replayStats, incrementalStats);
  section.batchChecksum = statisticsChecksum(batchSnapshot, fixtures.length);
  section.replayChecksum = statisticsChecksum(replaySnapshot, fixtures.length);
  section.incrementalChecksum = statisticsChecksum(incrementalLatest!, fixtures.length);

  if (section.firstDiff) {
    fail(
      section,
      "statistics deepEqual",
      `first diff at ${section.firstDiff.path}`,
      JSON.stringify(section.firstDiff.batch),
      JSON.stringify(section.firstDiff.replay)
    );
  } else {
    pass(section, "statistics deepEqual");
  }

  if (section.batchChecksum !== section.replayChecksum || section.batchChecksum !== section.incrementalChecksum) {
    fail(
      section,
      "normalized checksum",
      "batch/replay/incremental checksum mismatch",
      section.batchChecksum ?? "null",
      `${section.replayChecksum ?? "null"} / ${section.incrementalChecksum ?? "null"}`
    );
  } else {
    pass(section, "normalized checksum");
  }

  resetMarketKnowledgeStoreForTests();
  return {
    ...finalizeSection(section),
    firstDiff: section.firstDiff,
    batchChecksum: section.batchChecksum,
    replayChecksum: section.replayChecksum,
    incrementalChecksum: section.incrementalChecksum,
  };
}

function buildIntegrationValidationFusion() {
  const features: FeatureScore[] = [
    {
      id: "market_odds",
      category: "moneyline",
      score: 22,
      weight: 1,
      confidence: 0.82,
      reason: "Validation market odds",
    },
    {
      id: "recent_form.win_rate",
      category: "moneyline",
      score: 48,
      weight: 1,
      confidence: 0.8,
      reason: "Validation win rate",
    },
    {
      id: "recent_form.goal_difference",
      category: "moneyline",
      score: 36,
      weight: 1,
      confidence: 0.78,
      reason: "Validation goal difference",
    },
    {
      id: "home_away.home_advantage",
      category: "moneyline",
      score: 40,
      weight: 1,
      confidence: 0.76,
      reason: "Validation home advantage",
    },
    {
      id: "goals_xg.expected_goal_advantage",
      category: "moneyline",
      score: 34,
      weight: 1,
      confidence: 0.75,
      reason: "Validation xG advantage",
    },
    {
      id: "scoring_pattern.combined_over_25",
      category: "totalGoals",
      score: 28,
      weight: 1,
      confidence: 0.72,
      reason: "Validation over pattern",
    },
  ];

  return fuseFeatureScores(features);
}

function validateMarketEngineIntegration(
  fixtures: HistoricalMatchRecord[]
): ValidationSectionResult {
  const section = emptySection("Market Engine Integration");

  try {
    const fixture = fixtures[0];
    const fusion = buildIntegrationValidationFusion();
    const recommendation = generateRecommendations(fusion, fixture.marketSelections);

    pass(section, "generateRecommendations completed");
    pass(section, "runMarketEngine invoked via recommendation pipeline");

    if (recommendation.globalPass) {
      fail(section, "globalPass", "expected actionable recommendation for integration check");
    } else {
      pass(section, "globalPass false for integration fixture");
    }

    const integratedCandidates = recommendation.candidates.filter((candidate) =>
      hasMarketEngineIntegratedReasons(candidate.reasons, candidate.warnings)
    );

    if (integratedCandidates.length === 0) {
      fail(
        section,
        "market engine decision signals",
        `expected ${MARKET_ENGINE_INTEGRATION_REASON_PREFIX} reasons or warnings on candidates`
      );
    } else {
      pass(
        section,
        "market engine decision signals",
        `${integratedCandidates.length} candidate(s) include market engine output`
      );
    }

    const engineSnapshot = runMarketEngine(fixture.marketSelections);
    if (engineSnapshot.markets.length === 0) {
      fail(section, "market engine markets", "expected market analyses");
    } else {
      pass(section, "market engine markets", `${engineSnapshot.markets.length} markets`);
    }

    const scoreAdjusted = recommendation.candidates.some(
      (candidate) => candidate.score !== 0 && candidate.confidence !== "pass"
    );
    if (!scoreAdjusted) {
      fail(section, "blended recommendation score", "expected market-adjusted candidate score");
    } else {
      pass(section, "blended recommendation score");
    }
  } catch (error) {
    fail(
      section,
      "market engine integration",
      error instanceof Error ? error.message : String(error),
      undefined,
      undefined,
      error instanceof Error ? error.stack : undefined
    );
  }

  return finalizeSection(section);
}

function validateVerifiedPipeline(
  fixtures: HistoricalMatchRecord[],
  tempDir: string
): ValidationSectionResult {
  const section = emptySection("Verified Pipeline");
  resetMarketKnowledgeStoreForTests();
  const repo = createFileMarketKnowledgeRepository(tempDir);

  try {
    const fixture = fixtures[0];
    const engine = runMarketEngine(fixture.marketSelections);
    pass(section, "runMarketEngine");

    const evaluation = evaluateVerifiedMatchForKnowledge(fixture);
    if (evaluation.observations.length === 0) {
      fail(section, "observations", "expected observations");
    } else {
      pass(section, "observations");
    }

    const triggeredRules = engine.markets.flatMap((market: MarketAnalysis) =>
      market.ruleResults.filter((rule) => rule.triggered).map((rule) => rule.id)
    );
    if (triggeredRules.length === 0) {
      fail(section, "triggered rules", "expected triggered rules");
    } else {
      pass(section, "triggered rules");
    }

    const matchedPatterns = engine.markets.flatMap((market) => market.matchedPatterns.map((item) => item.id));
    pass(section, "matched patterns", matchedPatterns.join(", ") || "none");

    for (const observation of evaluation.observations) {
      for (const field of ["matchRecordId", "leagueId", "marketType", "odds", "profit", "stake"] as const) {
        if (observation[field] === undefined || observation[field] === null) {
          fail(section, `observation.${field}`, "missing trace field");
        } else {
          pass(section, `observation.${field}`);
        }
      }
    }

    const batch = buildMarketKnowledgeFromVerifiedMatches(fixtures);
    const replay = replayMarketKnowledge({ matches: fixtures, dryRun: true }).report.snapshots.at(-1)!;
    let incremental: MarketKnowledgeSnapshot | null = null;
    for (const match of fixtures) {
      incremental = updateMarketKnowledgeIncrementally({
        latestSnapshot: incremental,
        verifiedMatch: match,
        dryRun: true,
      }).snapshot;
    }

    const saved = repo.saveSnapshot(batch, { metadata: { source: "MANUAL", matchCount: fixtures.length } });
    const loaded = repo.loadSnapshot(saved.savedSnapshotId);
    if (!loaded) {
      fail(section, "persistence load", "failed to load saved snapshot");
    } else {
      const loadedStats = normalizeKnowledgeStatistics(loaded);
      const batchStats = normalizeKnowledgeStatistics(batch);
      if (JSON.stringify(loadedStats) !== JSON.stringify(batchStats)) {
        fail(section, "persistence roundtrip", "loaded statistics differ from batch");
      } else {
        pass(section, "persistence roundtrip");
      }
    }

    pass(section, "pipeline completed without exception");
    pass(section, "replay final snapshot", replay.id);
    pass(section, "incremental final snapshot", incremental?.id ?? "missing");
  } catch (error) {
    fail(
      section,
      "verified pipeline",
      error instanceof Error ? error.message : String(error),
      undefined,
      undefined,
      error instanceof Error ? error.stack : undefined
    );
  } finally {
    resetMarketKnowledgeStoreForTests();
  }

  return finalizeSection(section);
}

export function runSystemValidation(
  options: SystemValidationRunOptions = {}
): SystemValidationRunResult {
  const startedAt = new Date();
  const fixtures = options.fixtures ?? buildSystemValidationFixtures();
  const artifactsDir = options.artifactsDir ?? path.join(process.cwd(), "artifacts");
  const tempPersistenceDir =
    options.tempPersistenceDir ?? mkdtempSync(path.join(tmpdir(), "sv-persist-"));

  const build = validateBuild(options.skipBuild ?? false);
  const unitTests = validateUnitTests(options.skipUnitTests ?? false);
  const marketEngine = validateMarketEngine(fixtures);
  const rules = validateRules(fixtures);
  const patterns = validatePatterns(fixtures);
  const knowledgeBatch = validateKnowledgeBatch(fixtures);
  const replay = validateReplay(fixtures);
  const persistence = validatePersistence(tempPersistenceDir);
  const incremental = validateIncremental(fixtures);
  const consistency = validateConsistency(fixtures);
  const marketEngineIntegration = validateMarketEngineIntegration(fixtures);
  const verifiedPipeline = validateVerifiedPipeline(fixtures, tempPersistenceDir);

  if (existsSync(tempPersistenceDir)) {
    rmSync(tempPersistenceDir, { recursive: true, force: true });
  }

  const sections: ValidationSectionResult[] = [
    build,
    unitTests,
    marketEngine,
    rules,
    patterns,
    knowledgeBatch,
    replay,
    persistence,
    incremental,
    consistency,
    marketEngineIntegration,
    verifiedPipeline,
  ];

  const hasHardFailure = sections.some(
    (section) =>
      section.status === "FAIL" &&
      section.name !== "Patterns" &&
      section.name !== "Verified Pipeline"
  );
  const hasPatternFailure = patterns.status === "FAIL";
  const overallStatus: ValidationStatus = hasHardFailure
    ? "FAIL"
    : hasPatternFailure
      ? "CONDITIONAL_PASS"
      : "PASS";

  const completedAt = new Date();
  const report: SystemValidationReport = {
    overallStatus,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    gitCommit: tryResolveGitCommit(),
    fixtureCount: fixtures.length,
    build,
    unitTests,
    marketEngine,
    rules,
    patterns,
    knowledgeBatch,
    replay,
    persistence,
    incremental,
    consistency,
    marketEngineIntegration,
    verifiedPipeline,
  };

  const paths = writeSystemValidationReports(report, artifactsDir);
  return { report, ...paths };
}

export function runSystemValidationAndPrint(
  options: SystemValidationRunOptions = {}
): SystemValidationRunResult {
  const result = runSystemValidation(options);
  printSystemValidationConsoleSummary(result.report, {
    jsonPath: result.jsonPath,
    markdownPath: result.markdownPath,
  });
  return result;
}

export { SYSTEM_VALIDATION_FIXTURE_SPECS, buildSystemValidationFixtures };
