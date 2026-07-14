import type { RecommendationSection } from "@/lib/analysis/types";
import type { DecisionResult } from "@/lib/decision/decisionTypes";
import {
  DECISION_LEVEL_LABELS,
  formatDecisionScore,
  formatDecisionStars,
  getDecisionBadgeClassName,
} from "@/lib/decision/decisionPresentation";
import {
  EMPTY_RECOMMENDATION_MESSAGE,
  GLOBAL_PASS_HEADLINE,
  RECOMMENDATION_LEVEL_LABELS,
  formatRecommendationExpectedValue,
  formatRecommendationScore,
  formatRecommendationSelection,
  getRecommendationCardClassName,
  getRecommendationLevelBadgeClassName,
  getRecommendationMarketLabel,
  hasRecommendationContent,
  shouldShowEmptyRecommendationMessage,
  sortRecommendationCandidates,
} from "@/lib/recommendation/recommendationPresentation";

interface RecommendationSectionProps {
  recommendation: RecommendationSection;
  decision?: DecisionResult | null;
}

function DecisionSummary(props: { decision: DecisionResult }) {
  const { decision } = props;
  return (
    <div className="mb-4 rounded-lg border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={getDecisionBadgeClassName(decision.decision)}>
          {DECISION_LEVEL_LABELS[decision.decision]}
        </span>
        <span className="text-sm font-medium text-amber-600">
          {formatDecisionStars(decision.decisionScore)}
        </span>
        <span className="text-xs text-slate-500">
          Score {formatDecisionScore(decision.decisionScore)} ({decision.decisionScoreTier})
        </span>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium text-slate-500">Decision Score</dt>
          <dd className="text-sm font-semibold text-slate-900">
            {formatDecisionScore(decision.decisionScore)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Value</dt>
          <dd className="text-sm font-semibold text-slate-900">
            {formatDecisionScore(decision.valueScore)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Risk</dt>
          <dd className="text-sm font-semibold text-slate-900">
            {formatDecisionScore(decision.riskScore)}
          </dd>
        </div>
      </dl>
      {decision.reasons.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Reason</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-slate-700">
            {decision.reasons.slice(0, 5).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {decision.objections.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Objection</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-rose-700">
            {decision.objections.slice(0, 5).map((objection) => (
              <li key={objection}>{objection}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">{decision.explanation.summary}</p>
    </div>
  );
}

export function RecommendationSectionView({
  recommendation,
  decision,
}: RecommendationSectionProps) {
  if (!recommendation.enabled) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h3 className="mb-4 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-800">
          4. 下注建議
        </h3>
        <p className="text-sm text-slate-500">Recommendation 功能未啟用。</p>
      </div>
    );
  }

  const result = recommendation.result;

  if (shouldShowEmptyRecommendationMessage(result)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h3 className="mb-4 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-800">
          4. 下注建議
        </h3>
        {decision ? <DecisionSummary decision={decision} /> : null}
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {recommendation.message || EMPTY_RECOMMENDATION_MESSAGE}
        </p>
      </div>
    );
  }

  const sortedCandidates = sortRecommendationCandidates(result!.candidates);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="mb-4 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-800">
        4. 下注建議
      </h3>

      <p className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        建議僅供參考，並非保證獲利或賽果。
      </p>

      {decision ? <DecisionSummary decision={decision} /> : null}

      {result!.globalPass && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3">
          <p className="text-sm font-semibold text-amber-900">{GLOBAL_PASS_HEADLINE}</p>
          {recommendation.message && (
            <p className="mt-1 text-sm text-amber-800">{recommendation.message}</p>
          )}
        </div>
      )}

      {!result!.globalPass && recommendation.message && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {recommendation.message}
        </p>
      )}

      {!hasRecommendationContent(result) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {EMPTY_RECOMMENDATION_MESSAGE}
        </p>
      )}

      <div className="space-y-4">
        {sortedCandidates.map((candidate) => (
          <article
            key={`${candidate.marketType}-${candidate.selection.side}-${candidate.selection.title}-${candidate.selection.odds}`}
            className={getRecommendationCardClassName(candidate.confidence)}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {getRecommendationMarketLabel(candidate.marketType)}
              </p>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {formatRecommendationSelection(candidate.selection)}
              </span>
              <span className={getRecommendationLevelBadgeClassName(candidate.confidence)}>
                {RECOMMENDATION_LEVEL_LABELS[candidate.confidence]}
              </span>
              {decision &&
              decision.selection &&
              decision.selection.side === candidate.selection.side &&
              decision.market === candidate.marketType ? (
                <span className={getDecisionBadgeClassName(decision.decision)}>
                  Decision: {decision.decision}
                </span>
              ) : null}
            </div>

            <dl className="mt-3 grid gap-2 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-slate-500">Expected Value</dt>
                <dd className="text-sm font-medium text-slate-900">
                  {formatRecommendationExpectedValue(candidate.expectedValue)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Score</dt>
                <dd className="text-sm font-medium text-slate-900">
                  {formatRecommendationScore(candidate.score)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Selection</dt>
                <dd className="text-sm text-slate-900">
                  {candidate.selection.title}
                </dd>
              </div>
            </dl>

            {candidate.confidence === "pass" && (
              <p className="mt-3 text-sm font-medium text-amber-800">
                {GLOBAL_PASS_HEADLINE}
              </p>
            )}

            {candidate.reasons.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Reasons
                </p>
                <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-slate-700">
                  {candidate.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {candidate.supportingFeatures.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {candidate.supportingFeatures.map((feature) => (
                  <span
                    key={feature}
                    className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            )}

            {candidate.warnings.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                  Warnings
                </p>
                <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-rose-700">
                  {candidate.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
