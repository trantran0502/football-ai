import fs from "node:fs";
import path from "node:path";
import type {
  GoldenMatch,
  GoldenMatchExpectation,
  GoldenMatchInput,
} from "@/lib/golden/types";

export const GOLDEN_DATA_DIR = path.join(process.cwd(), "data", "golden");
export const GOLDEN_MATCHES_FILE = path.join(GOLDEN_DATA_DIR, "goldenMatches.json");
export const GOLDEN_EXPECTED_FILE = path.join(
  GOLDEN_DATA_DIR,
  "goldenExpected.json"
);

interface GoldenMatchesFile {
  version: number;
  matches: GoldenMatchInput[];
}

interface GoldenExpectedFile {
  version: number;
  expectations: Record<string, GoldenMatchExpectation>;
}

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function loadGoldenMatchesFile(
  filePath: string = GOLDEN_MATCHES_FILE
): GoldenMatchInput[] {
  const data = readJsonFile<GoldenMatchesFile>(filePath);
  return data.matches;
}

export function loadGoldenExpectedFile(
  filePath: string = GOLDEN_EXPECTED_FILE
): Record<string, GoldenMatchExpectation> {
  const data = readJsonFile<GoldenExpectedFile>(filePath);
  return data.expectations;
}

export function mergeGoldenDataset(
  matches: GoldenMatchInput[],
  expectations: Record<string, GoldenMatchExpectation>
): GoldenMatch[] {
  return matches.map((match) => {
    const expected = expectations[match.id];
    if (!expected) {
      throw new Error(`Missing golden expectation for match id: ${match.id}`);
    }

    return {
      id: match.id,
      league: match.league,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      rawOdds: match.rawOdds,
      actualResult: match.actualResult,
      expectedParser: expected.expectedParser,
      expectedAnalysis: expected.expectedAnalysis,
      expectedCandidates: expected.expectedCandidates,
    };
  });
}

export function loadGoldenDataset(
  matchesFile: string = GOLDEN_MATCHES_FILE,
  expectedFile: string = GOLDEN_EXPECTED_FILE
): GoldenMatch[] {
  const matches = loadGoldenMatchesFile(matchesFile);
  const expectations = loadGoldenExpectedFile(expectedFile);
  return mergeGoldenDataset(matches, expectations);
}

export function writeGoldenDataset(
  matches: GoldenMatchInput[],
  expectations: Record<string, GoldenMatchExpectation>,
  matchesFile: string = GOLDEN_MATCHES_FILE,
  expectedFile: string = GOLDEN_EXPECTED_FILE
): void {
  fs.mkdirSync(path.dirname(matchesFile), { recursive: true });

  const matchesPayload: GoldenMatchesFile = {
    version: 1,
    matches,
  };
  const expectedPayload: GoldenExpectedFile = {
    version: 1,
    expectations,
  };

  fs.writeFileSync(matchesFile, `${JSON.stringify(matchesPayload, null, 2)}\n`, "utf8");
  fs.writeFileSync(expectedFile, `${JSON.stringify(expectedPayload, null, 2)}\n`, "utf8");
}
