import type { RecentFormMatchup } from "@/lib/analysis/featureScore/providers/recentFormProvider";
import {
  isUsableTeamProfile,
  mapTeamProfilesToRecentForm,
} from "@/lib/providers/teamProfile/teamProfileProviderAdapter";
import type {
  EvidenceCollectorContext,
  EvidenceProviderOutcome,
} from "@/lib/evidence/v3/evidenceTypes";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveRecentFormMatchup(
  context: EvidenceCollectorContext
): RecentFormMatchup | null {
  const recentFormSnapshot = context.providerAudit?.resolved.find(
    (entry) => entry.key === "recentForm"
  );

  if (recentFormSnapshot?.source === "teamProfile" && recentFormSnapshot.available) {
    const data = recentFormSnapshot.data as RecentFormMatchup | null | undefined;
    if (data?.home && data?.away) {
      return data;
    }
  }

  const snapshot = context.teamProfiles;
  if (
    snapshot?.home &&
    snapshot?.away &&
    isUsableTeamProfile(snapshot.home) &&
    isUsableTeamProfile(snapshot.away)
  ) {
    return mapTeamProfilesToRecentForm(snapshot.home, snapshot.away);
  }

  return null;
}

function resolveFormEdgeScore(matchup: RecentFormMatchup): {
  score: number;
  confidence: number;
  reason: string;
} | null {
  const homeWinRate = matchup.home.winRate;
  const awayWinRate = matchup.away.winRate;

  if (homeWinRate === null || awayWinRate === null) {
    return null;
  }

  const edge = homeWinRate - awayWinRate;
  const sampleSize = Math.min(matchup.home.sampleSize, matchup.away.sampleSize);
  const confidence = clamp(sampleSize / 10, 0.35, 0.95);

  return {
    score: clamp(edge * 2, -1, 1),
    confidence,
    reason: `Recent 10 form edge: home win rate ${(homeWinRate * 100).toFixed(1)}% vs away ${(awayWinRate * 100).toFixed(1)}%.`,
  };
}

export function collectFormRecent10Evidence(
  context: EvidenceCollectorContext
): EvidenceProviderOutcome {
  try {
    const recentFormSource = context.providerAudit?.providerSources?.recentForm;
    const hasTeamProfileSource =
      recentFormSource === "teamProfile" ||
      (context.teamProfiles?.home &&
        context.teamProfiles?.away &&
        isUsableTeamProfile(context.teamProfiles.home) &&
        isUsableTeamProfile(context.teamProfiles.away));

    if (!hasTeamProfileSource) {
      return { status: "missing" };
    }

    if (recentFormSource === "mock") {
      return { status: "missing" };
    }

    const matchup = resolveRecentFormMatchup(context);
    if (!matchup) {
      return { status: "missing" };
    }

    const edge = resolveFormEdgeScore(matchup);
    if (!edge) {
      return { status: "missing" };
    }

    const capturedAt = context.collectedAt ?? new Date().toISOString();
    const direction =
      edge.score > 0.05 ? "home" : edge.score < -0.05 ? "away" : "neutral";

    return {
      status: "collected",
      result: {
        id: "FORM_RECENT_10",
        score: edge.score,
        confidence: edge.confidence,
        reason: edge.reason,
        metadata: {
          category: "team",
          direction,
          source: {
            provider: "teamProfile",
            resolutionChain: ["teamProfile", "recentForm"],
          },
          capturedAt,
          rawMetrics: {
            homeWinRate: matchup.home.winRate ?? 0,
            awayWinRate: matchup.away.winRate ?? 0,
          },
        },
      },
    };
  } catch {
    return { status: "missing" };
  }
}
