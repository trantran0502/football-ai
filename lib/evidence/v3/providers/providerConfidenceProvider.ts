import type {
  EvidenceCollectorContext,
  EvidenceProviderOutcome,
} from "@/lib/evidence/v3/evidenceTypes";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function collectProviderConfidenceEvidence(
  context: EvidenceCollectorContext
): EvidenceProviderOutcome {
  try {
    const audit = context.providerAudit;
    if (!audit || audit.resolved.length === 0) {
      return { status: "missing" };
    }

    const usable = audit.resolved.filter(
      (snapshot) =>
        snapshot.source !== "mock" &&
        snapshot.source !== "unavailable" &&
        snapshot.available
    );

    if (usable.length === 0) {
      return { status: "missing" };
    }

    const averageConfidence =
      usable.reduce((sum, snapshot) => sum + snapshot.confidence, 0) /
      usable.length;
    const coverage = usable.length / audit.resolved.length;
    const score = clamp(averageConfidence * coverage * 2 - 1, -1, 1);
    const capturedAt = context.collectedAt ?? new Date().toISOString();

    const flags: string[] = [];
    if (audit.mockProviderCount > 0) {
      flags.push("mock_providers_present");
    }
    if (audit.criticalProvidersUnavailable) {
      flags.push("critical_providers_unavailable");
    }

    return {
      status: "collected",
      result: {
        id: "PROVIDER_CONFIDENCE",
        score,
        confidence: clamp(averageConfidence, 0, 1),
        reason: `Provider confidence ${(averageConfidence * 100).toFixed(1)}% across ${usable.length}/${audit.resolved.length} usable providers.`,
        metadata: {
          category: "meta",
          direction: "neutral",
          source: {
            provider: "providerAudit",
            resolutionChain: ["providerRegistry", "auditProviderResolution"],
          },
          capturedAt,
          rawMetrics: {
            usableProviderCount: usable.length,
            totalProviderCount: audit.resolved.length,
            averageConfidence,
          },
          flags: flags.length > 0 ? flags : undefined,
        },
      },
    };
  } catch {
    return { status: "missing" };
  }
}
