import { compareStage } from "@/lib/golden/compare";
import { loadGoldenDataset } from "@/lib/golden/loadGoldenDataset";
import {
  buildAnalysisSnapshot,
  buildCandidateSnapshot,
  buildParserSnapshot,
} from "@/lib/golden/snapshot";
import type {
  GoldenMatch,
  GoldenMatchRunResult,
  GoldenReport,
  GoldenStageStatus,
} from "@/lib/golden/types";

function resolveOverallStatus(
  parser: GoldenStageStatus,
  analysis: GoldenStageStatus,
  candidates: GoldenStageStatus
): GoldenStageStatus {
  return parser === "PASS" && analysis === "PASS" && candidates === "PASS"
    ? "PASS"
    : "FAIL";
}

function runGoldenMatch(match: GoldenMatch): GoldenMatchRunResult {
  const actualParser = buildParserSnapshot(match.rawOdds);
  const actualAnalysis = buildAnalysisSnapshot(match.rawOdds);
  const actualCandidates = buildCandidateSnapshot(match.rawOdds);

  const parser = compareStage(match.expectedParser, actualParser);
  const analysis = compareStage(match.expectedAnalysis, actualAnalysis);
  const candidates = compareStage(match.expectedCandidates, actualCandidates);

  return {
    id: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    status: resolveOverallStatus(
      parser.status,
      analysis.status,
      candidates.status
    ),
    parser,
    analysis,
    candidates,
  };
}

function calculateAccuracy(passed: number, total: number): number {
  return total === 0 ? 0 : passed / total;
}

function buildGoldenReport(results: GoldenMatchRunResult[]): GoldenReport {
  const totalMatches = results.length;
  const parserPassed = results.filter((item) => item.parser.status === "PASS").length;
  const analysisPassed = results.filter((item) => item.analysis.status === "PASS").length;
  const candidatePassed = results.filter((item) => item.candidates.status === "PASS").length;

  return {
    totalMatches,
    parserPassed,
    parserFailed: totalMatches - parserPassed,
    parserAccuracy: calculateAccuracy(parserPassed, totalMatches),
    analysisPassed,
    analysisFailed: totalMatches - analysisPassed,
    analysisAccuracy: calculateAccuracy(analysisPassed, totalMatches),
    candidatePassed,
    candidateFailed: totalMatches - candidatePassed,
    candidateAccuracy: calculateAccuracy(candidatePassed, totalMatches),
    allPassed: results.every((item) => item.status === "PASS"),
    results,
  };
}

/**
 * Golden Dataset Runner。
 * 逐筆執行 Parser → Analysis → Candidate，並與 expected 比較。
 */
export function runGoldenDataset(matches?: GoldenMatch[]): GoldenReport {
  const dataset = matches ?? loadGoldenDataset();
  const results = dataset.map(runGoldenMatch);
  return buildGoldenReport(results);
}

export function formatGoldenReport(report: GoldenReport): string {
  const lines = [
    `Golden Dataset: ${report.allPassed ? "PASS" : "FAIL"}`,
    `Matches: ${report.totalMatches}`,
    `Parser Accuracy: ${(report.parserAccuracy * 100).toFixed(1)}% (${report.parserPassed}/${report.totalMatches})`,
    `Analysis Accuracy: ${(report.analysisAccuracy * 100).toFixed(1)}% (${report.analysisPassed}/${report.totalMatches})`,
    `Candidate Accuracy: ${(report.candidateAccuracy * 100).toFixed(1)}% (${report.candidatePassed}/${report.totalMatches})`,
  ];

  for (const result of report.results) {
    if (result.status === "PASS") {
      lines.push(`  [PASS] ${result.id} ${result.homeTeam} vs ${result.awayTeam}`);
      continue;
    }

    lines.push(`  [FAIL] ${result.id} ${result.homeTeam} vs ${result.awayTeam}`);
    if (result.parser.status === "FAIL") {
      lines.push(`    parser diffs: ${result.parser.diffs.length}`);
      for (const diff of result.parser.diffs.slice(0, 3)) {
        lines.push(`      ${diff.path}`);
      }
    }
    if (result.analysis.status === "FAIL") {
      lines.push(`    analysis diffs: ${result.analysis.diffs.length}`);
      for (const diff of result.analysis.diffs.slice(0, 3)) {
        lines.push(`      ${diff.path}`);
      }
    }
    if (result.candidates.status === "FAIL") {
      lines.push(`    candidate diffs: ${result.candidates.diffs.length}`);
      for (const diff of result.candidates.diffs.slice(0, 3)) {
        lines.push(`      ${diff.path}`);
      }
    }
  }

  return lines.join("\n");
}
