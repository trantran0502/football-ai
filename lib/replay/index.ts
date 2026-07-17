export type {
  ReplayCandidateSnapshot,
  ReplayDataSource,
  ReplayFeatureRemovalSimulation,
  ReplayFeatureSnapshot,
  ReplayMatchInfo,
  ReplayProviderSnapshot,
  ReplayRawSources,
  ReplayRecommendationSnapshot,
  ReplayResponse,
  ReplaySnapshot,
  ReplayStep,
  ReplayValidationSnapshot,
} from "@/lib/replay/replayTypes";

export {
  attachValidationToReplaySnapshot,
  buildReplayMatchInfo,
  buildReplaySnapshotFromReport,
  enrichRecordWithReplayValidation,
} from "@/lib/replay/replayBuilder";

export {
  buildFeatureRemovalSimulations,
  buildReplayResponse,
  buildReplayResponseFromSnapshot,
  buildReplaySnapshotForAnalysis,
  getReplaySnapshotFromRecord,
  simulateFeatureRemoval,
} from "@/lib/replay/replayEngine";

export { getReplayForMatch, findMatchRecordForReplay } from "@/lib/replay/replayService";

export {
  replayMarketKnowledge,
  runMarketKnowledgeReplay,
  validateReplay,
  validateReplayResult,
  validateReplayRoiConsistency,
  validateReplaySnapshots,
  buildReplayAuditEntry,
  buildStatisticsDiff,
  compareKnowledgeSnapshots,
  countUniqueUpdates,
  finalizeReplayReport,
  type ReplayValidationInput,
  type ReplayAuditEntry,
  type ReplayMarketKnowledgeOptions,
  type ReplayMarketKnowledgeResult,
  type ReplayMarketStatChange,
  type ReplayReport,
  type ReplayStatChange,
  type ReplayStep as MarketKnowledgeReplayStep,
  type ReplayValidationResult,
  type StatisticsDiff,
} from "@/lib/replay/marketKnowledge";
