import type { DecisionV3ReplayValidationReport } from "@/lib/replay/v3/decisionV3ReplayValidationTypes";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number): string {
  return value.toFixed(4);
}

export function buildDecisionV3ReplayValidationMarkdown(
  report: DecisionV3ReplayValidationReport
): string {
  const lines: string[] = [
    "# Decision V3 Replay Validation",
    "",
    `Generated at: ${report.generatedAt}`,
    `Schema: ${report.schemaVersion}`,
    "",
    "## Verdict",
    "",
    `**${report.verdict}**`,
    "",
  ];

  for (const note of report.verdictNotes) {
    lines.push(`- ${note}`);
  }

  lines.push(
    "",
    "## Dataset",
    "",
    `- Total records: ${report.dataset.totalRecords}`,
    `- Eligible records: ${report.dataset.eligibleRecords}`,
    `- Excluded records: ${report.dataset.excludedRecords}`,
    "",
    "### Exclusion Reasons",
    ""
  );

  const exclusionEntries = Object.entries(report.dataset.exclusionReasons);
  if (exclusionEntries.length === 0) {
    lines.push("- None");
  } else {
    for (const [reason, count] of exclusionEntries.sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`- ${reason}: ${count}`);
    }
  }

  lines.push(
    "",
    "## Legacy Performance",
    "",
    `- Bets: ${report.legacy.bets}`,
    `- Passes: ${report.legacy.passes}`,
    `- Wins: ${report.legacy.wins}`,
    `- Half wins: ${report.legacy.halfWins}`,
    `- Pushes: ${report.legacy.pushes}`,
    `- Half losses: ${report.legacy.halfLosses}`,
    `- Losses: ${report.legacy.losses}`,
    `- Hit rate: ${formatPercent(report.legacy.hitRate)}`,
    `- ROI: ${formatPercent(report.legacy.roi)}`,
    `- Net units: ${formatNumber(report.legacy.netUnits)}`,
    `- Average odds: ${formatNumber(report.legacy.averageOdds)}`,
    `- Max drawdown: ${formatNumber(report.legacy.maxDrawdown)}`,
    "",
    "## Decision V3 Performance",
    "",
    `- Bets: ${report.decisionV3.bets}`,
    `- Passes: ${report.decisionV3.passes}`,
    `- Wins: ${report.decisionV3.wins}`,
    `- Half wins: ${report.decisionV3.halfWins}`,
    `- Pushes: ${report.decisionV3.pushes}`,
    `- Half losses: ${report.decisionV3.halfLosses}`,
    `- Losses: ${report.decisionV3.losses}`,
    `- Hit rate: ${formatPercent(report.decisionV3.hitRate)}`,
    `- ROI: ${formatPercent(report.decisionV3.roi)}`,
    `- Net units: ${formatNumber(report.decisionV3.netUnits)}`,
    `- Average odds: ${formatNumber(report.decisionV3.averageOdds)}`,
    `- Max drawdown: ${formatNumber(report.decisionV3.maxDrawdown)}`,
    "",
    "## Agreement",
    "",
    `- Direction agreement: ${formatPercent(report.agreement.directionAgreementRate)}`,
    `- Market agreement: ${formatPercent(report.agreement.marketAgreementRate)}`,
    `- Confidence agreement: ${formatPercent(report.agreement.confidenceAgreementRate)}`,
    `- Candidate changed: ${formatPercent(report.agreement.candidateChangedRate)}`,
    `- Overall agreement: ${formatPercent(report.agreement.overallAgreementRate)}`,
    `- Legacy only bet: ${report.agreement.legacyOnlyBetCount}`,
    `- Decision only bet: ${report.agreement.decisionOnlyBetCount}`,
    `- Both bet: ${report.agreement.bothBetCount}`,
    `- Both pass: ${report.agreement.bothPassCount}`,
    "",
    "## Head-to-Head",
    "",
    `- Both bet, legacy won / decision lost: ${report.headToHead.bothBetLegacyWonDecisionLost}`,
    `- Both bet, decision won / legacy lost: ${report.headToHead.bothBetDecisionWonLegacyLost}`,
    `- Both won: ${report.headToHead.bothWon}`,
    `- Both lost: ${report.headToHead.bothLost}`,
    "",
    "## Leakage Audit",
    "",
    `- Checked: ${report.leakageAudit.checked}`,
    `- Passed: ${report.leakageAudit.passed}`,
    `- Excluded: ${report.leakageAudit.excluded}`,
    ""
  );

  const leakageEntries = Object.entries(report.leakageAudit.violationsByReason);
  if (leakageEntries.length === 0) {
    lines.push("- Violations: none");
  } else {
    lines.push("### Violations");
    lines.push("");
    for (const [reason, count] of leakageEntries.sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`- ${reason}: ${count}`);
    }
  }

  lines.push("", "## Grouped Decision V3 Metrics", "");
  appendGroupedSection(lines, "Market Type", report.grouped.byMarketType);
  appendGroupedSection(lines, "League", report.grouped.byLeague);
  appendGroupedSection(lines, "Decision Level", report.grouped.byDecisionLevel);
  appendGroupedSection(lines, "Confidence", report.grouped.byConfidence);
  appendGroupedSection(lines, "Evidence Completeness", report.grouped.byEvidenceCompleteness);
  appendGroupedSection(lines, "Provider Confidence", report.grouped.byProviderConfidence);
  appendGroupedSection(lines, "Runtime Weight Source", report.grouped.byRuntimeWeightSource);
  appendGroupedSection(lines, "Data Source", report.grouped.byDataSource);

  lines.push(
    "",
    "## Notes",
    "",
    "- Production recommendation output is unchanged.",
    "- This report is replay validation only; it does not activate Decision V3 in Production.",
    "- Mock fixtures are excluded unless explicitly enabled.",
    ""
  );

  return lines.join("\n");
}

function appendGroupedSection(
  lines: string[],
  title: string,
  grouped: Record<string, { sampleSize: number; hitRate: number; roi: number; netUnits: number; status: string }>
): void {
  lines.push(`### ${title}`, "");
  const entries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    lines.push("- No samples");
    lines.push("");
    return;
  }

  for (const [key, bucket] of entries) {
    if (bucket.status === "insufficient_sample") {
      lines.push(
        `- ${key}: insufficient_sample (n=${bucket.sampleSize})`
      );
      continue;
    }

    lines.push(
      `- ${key}: n=${bucket.sampleSize}, hitRate=${formatPercent(bucket.hitRate)}, roi=${formatPercent(bucket.roi)}, netUnits=${formatNumber(bucket.netUnits)}`
    );
  }

  lines.push("");
}

export function sanitizeDecisionV3ReplayValidationReportForArtifact(
  report: DecisionV3ReplayValidationReport
): DecisionV3ReplayValidationReport {
  return JSON.parse(JSON.stringify(report)) as DecisionV3ReplayValidationReport;
}
