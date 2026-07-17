import type { HistoricalMatchRecord, MatchResult } from "@/lib/database/matchSchema";
import type { MarketSelection } from "@/types/match";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  createEmptyMarketKnowledgeSnapshot,
  type MarketKnowledgeSnapshot,
} from "../marketKnowledgeTypes";
import { resetMarketKnowledgeStoreForTests } from "../marketKnowledgeStore";
import { replayMarketKnowledge } from "@/lib/replay/marketKnowledge/marketKnowledgeReplayRunner";
import {
  computeSnapshotChecksum,
  buildPersistedSnapshot,
  verifyPersistedSnapshotChecksum,
} from "./marketKnowledgePersistence";
import {
  MarketKnowledgeDuplicateSnapshotError,
  MarketKnowledgeIntegrityError,
} from "./marketKnowledgePersistenceTypes";
import { validateMarketKnowledgeSnapshotIntegrity } from "./marketKnowledgeIntegrity";
import {
  createInMemoryMarketKnowledgeRepository,
} from "./inMemoryMarketKnowledgeRepository";
import {
  createFileMarketKnowledgeRepository,
  rebuildManifest,
} from "./fileMarketKnowledgeRepository";
import {
  createDefaultSnapshotMetadata,
  MARKET_KNOWLEDGE_ENGINE_VERSION,
  MARKET_KNOWLEDGE_SCHEMA_VERSION,
} from "./marketKnowledgeVersioning";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(fn: () => void, errorName: string, message: string): void {
  try {
    fn();
    throw new Error(`${message}: expected ${errorName}`);
  } catch (error) {
    if (!(error instanceof Error) || error.name !== errorName) {
      throw new Error(`${message}: got ${String(error)}`);
    }
  }
}

function createValidSnapshot(id = "snapshot-test-1"): MarketKnowledgeSnapshot {
  return {
    ...createEmptyMarketKnowledgeSnapshot(id, "2026-01-15T12:00:00.000Z"),
    status: "available",
    message: undefined,
    version: MARKET_KNOWLEDGE_ENGINE_VERSION,
  };
}

function createTempRepoDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function testInMemorySaveLoadListDelete(): void {
  const repo = createInMemoryMarketKnowledgeRepository();
  const snapshot = createValidSnapshot("mem-1");

  const report = repo.saveSnapshot(snapshot);
  assert(report.savedSnapshotId === "mem-1", "in-memory save report id");
  assert(report.checksum.length === 64, "in-memory checksum length");
  assert(report.manifestUpdated === true, "in-memory manifest updated");

  const loaded = repo.loadSnapshot("mem-1");
  assert(loaded?.id === "mem-1", "in-memory load id");
  assert(repo.snapshotExists("mem-1"), "in-memory exists");
  assert(repo.listSnapshots().length === 1, "in-memory list length");

  assert(repo.deleteSnapshot("mem-1"), "in-memory delete");
  assert(!repo.snapshotExists("mem-1"), "in-memory deleted");
  assert(repo.loadSnapshot("mem-1") === null, "in-memory load after delete");
}

function testInMemoryLatestSnapshot(): void {
  const repo = createInMemoryMarketKnowledgeRepository();
  const older = createValidSnapshot("mem-older");
  older.generatedAt = "2026-01-01T00:00:00.000Z";
  const newer = createValidSnapshot("mem-newer");
  newer.generatedAt = "2026-01-15T00:00:00.000Z";

  repo.saveSnapshot(older);
  repo.saveSnapshot(newer);

  const latest = repo.loadLatestSnapshot();
  assert(latest?.id === "mem-newer", "in-memory latest snapshot");
}

function testDuplicateProtectionAndOverwrite(): void {
  const repo = createInMemoryMarketKnowledgeRepository();
  const snapshot = createValidSnapshot("dup-1");
  repo.saveSnapshot(snapshot);

  assertThrows(
    () => repo.saveSnapshot(snapshot),
    "MarketKnowledgeDuplicateSnapshotError",
    "duplicate protection"
  );

  const overwritten = repo.saveSnapshot(snapshot, { overwrite: true });
  assert(overwritten.savedSnapshotId === "dup-1", "overwrite allowed");
}

function testChecksumDeterministicAndCorruption(): void {
  const snapshot = createValidSnapshot("checksum-1");
  const metadata = createDefaultSnapshotMetadata({ source: "MANUAL", matchCount: 0 });

  const first = computeSnapshotChecksum(snapshot, metadata);
  const second = computeSnapshotChecksum(snapshot, metadata);
  assert(first === second, "checksum deterministic");

  const persisted = buildPersistedSnapshot(snapshot, metadata);
  persisted.checksum = "deadbeef";
  assertThrows(
    () => verifyPersistedSnapshotChecksum(persisted),
    "MarketKnowledgeIntegrityError",
    "checksum corruption"
  );
}

function testFileSaveLoadAndManifest(): void {
  const baseDir = createTempRepoDir("mk-persist-");
  const repo = createFileMarketKnowledgeRepository(baseDir);
  const snapshot = createValidSnapshot("file-1");

  try {
    const report = repo.saveSnapshot(snapshot, {
      metadata: { source: "REPLAY", matchCount: 3 },
    });
    assert(report.filePath?.includes("file-1.json"), "file path contains snapshot id");
    assert(repo.snapshotExists("file-1"), "file snapshot exists");

    const loaded = repo.loadSnapshot("file-1");
    assert(loaded?.id === "file-1", "file load id");
    assert(loaded?.metadata?.source === "REPLAY", "file metadata source");
    assert(loaded?.metadata?.schemaVersion === MARKET_KNOWLEDGE_SCHEMA_VERSION, "schema version");
    assert(loaded?.metadata?.engineVersion === MARKET_KNOWLEDGE_ENGINE_VERSION, "engine version");

    const manifest = repo.getManifest();
    assert(manifest.snapshotCount === 1, "manifest snapshot count");
    assert(manifest.latestSnapshotId === "file-1", "manifest latest id");
    assert(manifest.snapshots[0]?.checksum === report.checksum, "manifest checksum");

    const latest = repo.loadLatestSnapshot();
    assert(latest?.id === "file-1", "file latest snapshot");
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
}

function testAtomicSaveLeavesNoTempFiles(): void {
  const baseDir = createTempRepoDir("mk-atomic-");
  const repo = createFileMarketKnowledgeRepository(baseDir);

  try {
    repo.saveSnapshot(createValidSnapshot("atomic-1"));
    const files = readdirSync(repo.getSnapshotsDir());
    assert(!files.some((file) => file.endsWith(".tmp")), "no tmp snapshot files");
    assert(!files.includes("manifest.json.tmp"), "no tmp manifest in snapshots dir");
    assert(!readdirSync(baseDir).some((file) => file === "manifest.json.tmp"), "no tmp manifest");
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
}

function testManifestRebuild(): void {
  const baseDir = createTempRepoDir("mk-rebuild-");
  const repo = createFileMarketKnowledgeRepository(baseDir);

  try {
    const first = createValidSnapshot("valid-1");
    first.generatedAt = "2026-01-01T00:00:00.000Z";
    const second = createValidSnapshot("valid-2");
    second.generatedAt = "2026-01-15T00:00:00.000Z";
    repo.saveSnapshot(first);
    repo.saveSnapshot(second);

    const corruptPath = repo.getSnapshotPath("corrupt-1");
    writeFileSync(
      corruptPath,
      JSON.stringify({ snapshot: {}, metadata: {}, checksum: "bad" }),
      "utf8"
    );

    rmSync(repo.getManifestPath(), { force: true });

    const rebuilt = rebuildManifest(baseDir);
    assert(rebuilt.validSnapshots.length === 2, "rebuild valid count");
    assert(rebuilt.invalidSnapshots.length === 1, "rebuild invalid count");
    assert(rebuilt.latestSnapshotId === "valid-2", "rebuild latest id");
    assert(rebuilt.manifest.snapshotCount === 2, "rebuild manifest count");
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
}

function testInvalidSnapshotValidation(): void {
  const invalid = createValidSnapshot("invalid-1");
  invalid.ruleStatistics = [
    {
      ruleId: "BadRule",
      sampleSize: 2,
      hitCount: 1,
      missCount: 0,
      pushCount: 0,
      hitRate: 0.5,
      roi: 0.1,
      averageOdds: 1.9,
      averageConfidence: 0.5,
      averageMarketScore: 0.5,
      firstSeen: null,
      lastSeen: null,
      lastUpdated: null,
    },
  ];

  assertThrows(
    () => validateMarketKnowledgeSnapshotIntegrity(invalid),
    "MarketKnowledgeIntegrityError",
    "invalid rule sample size"
  );

  const repo = createInMemoryMarketKnowledgeRepository();
  assertThrows(
    () => repo.saveSnapshot(invalid),
    "MarketKnowledgeIntegrityError",
    "repository rejects invalid snapshot"
  );
}

function testFileChecksumCorruptionOnLoad(): void {
  const baseDir = createTempRepoDir("mk-corrupt-");
  const repo = createFileMarketKnowledgeRepository(baseDir);

  try {
    repo.saveSnapshot(createValidSnapshot("corrupt-load-1"));
    const filePath = repo.getSnapshotPath("corrupt-load-1");
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as ReturnType<typeof buildPersistedSnapshot>;
    parsed.checksum = "0000000000000000000000000000000000000000000000000000000000000000";
    writeFileSync(filePath, JSON.stringify(parsed), "utf8");

    assertThrows(
      () => repo.loadSnapshot("corrupt-load-1"),
      "MarketKnowledgeIntegrityError",
      "file load checksum mismatch"
    );
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
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
    ...partial,
  };
}

function buildVerifiedMatchResult(): MatchResult {
  return {
    fullTimeHomeGoals: 2,
    fullTimeAwayGoals: 1,
    halfTimeHomeGoals: 1,
    halfTimeAwayGoals: 0,
    winner: "home",
    totalGoals: 3,
    bothTeamsScored: true,
  };
}

function buildVerifiedMatch(id: string, verifiedAt = "2026-01-15T12:00:00.000Z"): HistoricalMatchRecord {
  const now = verifiedAt;
  return {
    id,
    date: "2026-01-15",
    matchDate: "2026-01-15",
    league: "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    rawOdds: "multi",
    leagueId: 39,
    marketSelections: [
      selection({
        marketType: "moneyline",
        marketFamily: "moneyline",
        side: "home",
        odds: 1.85,
        impliedProbability: 0.54,
      }),
      selection({
        marketType: "handicap",
        marketFamily: "asianHandicap",
        title: "AH",
        side: "home",
        odds: 0.92,
        line: -0.5,
        rawLine: "-0.5",
        modifier: "plain",
        impliedProbability: 0.521,
      }),
      selection({
        marketType: "totalGoals",
        marketFamily: "asianOverUnder",
        title: "O/U",
        side: "over",
        odds: 0.9,
        line: 2.5,
        rawLine: "2.5",
        modifier: "plain",
        impliedProbability: 0.526,
      }),
    ],
    status: "VERIFIED",
    result: buildVerifiedMatchResult(),
    verificationResult: {
      verifiedAt: now,
      verifiedBy: "test",
      notes: null,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function testReplayRepositoryIntegration(): void {
  resetMarketKnowledgeStoreForTests();
  const repository = createInMemoryMarketKnowledgeRepository();
  const matches = [
    buildVerifiedMatch("replay-persist-1", "2026-01-15T10:00:00.000Z"),
    buildVerifiedMatch("replay-persist-2", "2026-01-15T12:00:00.000Z"),
  ];

  const result = replayMarketKnowledge({
    matches,
    dryRun: false,
    repository,
  });

  assert(result.report.snapshotCount === 2, "replay snapshot count");
  assert(repository.listSnapshots().length === 2, "repository saved replay snapshots");

  const latest = repository.loadLatestSnapshot();
  assert(latest?.metadata?.source === "REPLAY", "replay metadata source");
  assert(latest?.metadata?.matchCount === 2, "replay metadata match count");
  assert(latest?.metadata?.lastMatchId === "replay-persist-2", "replay metadata last match");

  const dryRunResult = replayMarketKnowledge({
    matches: [buildVerifiedMatch("replay-dry-1")],
    dryRun: true,
    repository,
  });
  assert(dryRunResult.report.snapshotCount === 1, "dry run still builds snapshots");
  assert(repository.listSnapshots().length === 2, "dry run does not persist");
}

export function runMarketKnowledgePersistenceTests(): void {
  testInMemorySaveLoadListDelete();
  testInMemoryLatestSnapshot();
  testDuplicateProtectionAndOverwrite();
  testChecksumDeterministicAndCorruption();
  testFileSaveLoadAndManifest();
  testAtomicSaveLeavesNoTempFiles();
  testManifestRebuild();
  testInvalidSnapshotValidation();
  testFileChecksumCorruptionOnLoad();
  testReplayRepositoryIntegration();
}
