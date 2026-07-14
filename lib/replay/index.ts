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
