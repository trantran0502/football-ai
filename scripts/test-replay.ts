import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import {
  buildReplayResponse,
  buildReplayResponseFromSnapshot,
  simulateFeatureRemoval,
} from "@/lib/replay/replayEngine";
import { buildReplaySnapshotFromReport } from "@/lib/replay/replayBuilder";
import { getReplayForMatch } from "@/lib/replay/replayService";
import {
  resetInMemoryProductionStore,
  saveMatchInMemory,
  verifyMatchInMemory,
} from "@/lib/production/inMemoryProductionStore";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const SAMPLE_ODDS = `Arsenal vs Chelsea
獨贏
主 1.85
和 3.4
客 4.2
全場讓分
主-0.5 0.92
客+0.5 0.98
全場大小
大(2.5) 0.90
小(2.5) 0.96
雙方進球
是 0.82
否 1.02`;

const MATCH_DATE = "2026-07-16";

async function runTests(): Promise<void> {
  resetInMemoryProductionStore();

  const report = analyzeMatch(SAMPLE_ODDS);

  const saved = await saveMatchInMemory(SAMPLE_ODDS, report, MATCH_DATE);
  assert(saved.status === "created", "should create match with replay snapshot");

  const record = saved.record;
  const snapshot = record.analysisSnapshot?.replay;
  if (!snapshot) {
    throw new Error("analysis snapshot should include replay");
  }

  assert(snapshot.match.matchId === record.id, "replay matchId should match record id");
  assert(snapshot.match.homeTeam === "Arsenal", "replay should capture home team");
  assert(snapshot.match.awayTeam === "Chelsea", "replay should capture away team");
  assert(Array.isArray(snapshot.providers) && snapshot.providers.length === 8, "should capture 8 providers");
  assert(snapshot.features.length > 0, "should capture features");
  assert(snapshot.fusion !== null, "should capture fusion");
  assert(snapshot.recommendation !== null, "should capture recommendation");
  assert(snapshot.validation === null, "validation should be null before verify");

  const response = buildReplayResponse(record);
  if (!response) {
    throw new Error("buildReplayResponse should succeed");
  }
  assert(response.steps.length === 8, "replay response should have 8 steps");
  assert(response.readOnly === true, "replay response must be read-only");
  assert(
    response.featureRemovalSimulations.length === snapshot.features.length,
    "feature removal simulations should cover all features"
  );

  const firstFeature = snapshot.features[0];
  const simulation = simulateFeatureRemoval(snapshot, firstFeature.id);
  if (!simulation) {
    throw new Error("simulateFeatureRemoval should return result");
  }
  assert(typeof simulation.delta === "number", "simulation delta should be numeric");

  const verified = await verifyMatchInMemory(record.id, {
    fullTimeHomeGoals: 2,
    fullTimeAwayGoals: 1,
    halfTimeHomeGoals: 1,
    halfTimeAwayGoals: 0,
  });
  assert(verified !== null, "verify should succeed");
  assert(verified?.status === "VERIFIED", "match should be verified");
  assert(
    verified?.analysisSnapshot?.replay?.validation !== null,
    "validation should be attached to replay after verify"
  );

  const apiReplay = await getReplayForMatch(record.id);
  if (!apiReplay) {
    throw new Error("getReplayForMatch should resolve in-memory record");
  }
  assert(
    apiReplay.snapshot.validation !== null,
    "API replay should include validation after verify"
  );

  const directSnapshot = buildReplaySnapshotFromReport(report, {
    matchId: "test-direct",
  });
  const directResponse = buildReplayResponseFromSnapshot("test-direct", directSnapshot);
  assert(directResponse.steps[0].key === "raw", "direct snapshot response should include raw step");

  console.log("Replay module tests passed.");
  console.log(`- Match ID: ${record.id}`);
  console.log(`- Features: ${snapshot.features.length}`);
  console.log(`- Providers: ${snapshot.providers.length}`);
  console.log(`- Feature removal simulations: ${response.featureRemovalSimulations.length}`);
  console.log(`- Validation entries: ${apiReplay.snapshot.validation?.entries.length ?? 0}`);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
