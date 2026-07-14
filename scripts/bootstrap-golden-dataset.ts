import {
  buildAnalysisSnapshot,
  buildCandidateSnapshot,
  buildGoldenMatchResult,
  buildParserSnapshot,
  writeGoldenDataset,
  type GoldenMatchInput,
} from "../lib/golden";

interface FixtureSeed {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  rawOdds: string;
  result: {
    fullTimeHomeGoals: number;
    fullTimeAwayGoals: number;
    halfTimeHomeGoals: number;
    halfTimeAwayGoals: number;
  };
}

const FIXTURES: FixtureSeed[] = [
  {
    id: "golden-001",
    league: "International",
    homeTeam: "法國",
    awayTeam: "西班牙",
    rawOdds: `法國 vs 西班牙
獨贏
主 2.1
和 3.2
客 3.5
全場讓分
主0 0.9
客0 0.95
全場大小
大(2.5) 0.88
小 0.98
雙方進球
是 0.75
否 1.05`,
    result: { fullTimeHomeGoals: 2, fullTimeAwayGoals: 1, halfTimeHomeGoals: 1, halfTimeAwayGoals: 0 },
  },
  {
    id: "golden-002",
    league: "International",
    homeTeam: "法國",
    awayTeam: "西班牙",
    rawOdds: `法國 vs 西班牙
獨贏
主 1.55
和 3.2
客 3.5
全場讓分
主0 0.9
客0 0.95
全場大小
大(2.5) 0.88
小 0.98
雙方進球
是 0.75
否 1.05`,
    result: { fullTimeHomeGoals: 1, fullTimeAwayGoals: 0, halfTimeHomeGoals: 1, halfTimeAwayGoals: 0 },
  },
  {
    id: "golden-003",
    league: "International",
    homeTeam: "德國",
    awayTeam: "意大利",
    rawOdds: `德國 vs 意大利
獨贏
主 1.95
和 3.4
客 4.2
全場讓分
主0-50 0.82
客0+50 1.02
全場大小
大(2) 0.9
小 0.9
雙方進球
是 1.8
否 2.0`,
    result: { fullTimeHomeGoals: 1, fullTimeAwayGoals: 1, halfTimeHomeGoals: 0, halfTimeAwayGoals: 1 },
  },
  {
    id: "golden-004",
    league: "International",
    homeTeam: "巴西",
    awayTeam: "阿根廷",
    rawOdds: `巴西 vs 阿根廷
獨贏
主 2.4
和 3.1
客 2.9
全場讓分
主0.5 0.88
客0.5 0.96
全場大小
大(2.5) 0.92
小 0.92
雙方進球
是 1.7
否 2.1`,
    result: { fullTimeHomeGoals: 0, fullTimeAwayGoals: 2, halfTimeHomeGoals: 0, halfTimeAwayGoals: 1 },
  },
  {
    id: "golden-005",
    league: "International",
    homeTeam: "英格蘭",
    awayTeam: "葡萄牙",
    rawOdds: `英格蘭 vs 葡萄牙
獨贏
主 1.8
和 3.5
客 4.0
全場讓分
主1.5 0.85
客1.5 1.0
全場大小
大(2) 0.9
小 0.95
雙方進球
是 1.6
否 2.2`,
    result: { fullTimeHomeGoals: 3, fullTimeAwayGoals: 0, halfTimeHomeGoals: 2, halfTimeAwayGoals: 0 },
  },
  {
    id: "golden-006",
    league: "International",
    homeTeam: "荷蘭",
    awayTeam: "比利時",
    rawOdds: `荷蘭 vs 比利時
獨贏
主 1.7
和 3.6
客 4.5
全場讓分
主1 0.88
客1 0.98
全場大小
大(3) 0.86
小 0.96
雙方進球
是 1.55
否 2.35`,
    result: { fullTimeHomeGoals: 2, fullTimeAwayGoals: 1, halfTimeHomeGoals: 1, halfTimeAwayGoals: 1 },
  },
  {
    id: "golden-007",
    league: "International",
    homeTeam: "日本",
    awayTeam: "韓國",
    rawOdds: `日本 vs 韓國
獨贏
主 2.3
和 3.0
客 3.2
全場讓分
主0 0.92
客0 0.94
全場大小
大(2) 0.87
小 0.97
雙方進球
是 1.9
否 1.85`,
    result: { fullTimeHomeGoals: 1, fullTimeAwayGoals: 1, halfTimeHomeGoals: 0, halfTimeAwayGoals: 1 },
  },
  {
    id: "golden-008",
    league: "International",
    homeTeam: "西班牙",
    awayTeam: "意大利",
    rawOdds: `西班牙 vs 意大利
獨贏
主 2.0
和 3.3
客 3.8
全場讓分
主0 0.9
客0 0.95
全場大小
大(4) 0.95
小 0.85
雙方進球
是 1.75
否 2.0`,
    result: { fullTimeHomeGoals: 2, fullTimeAwayGoals: 2, halfTimeHomeGoals: 1, halfTimeAwayGoals: 0 },
  },
  {
    id: "golden-009",
    league: "International",
    homeTeam: "法國",
    awayTeam: "西班牙",
    rawOdds: `法國 vs 西班牙
獨贏
主 2.1
和 3.2
客 3.5
上半場獨贏與讓分
主 2
客 2.85
和 1.04
主0 0.72
客0 1.18
主 0.39
客(0-50) 1.51
主(0-50) 1.28
客 0.62
主隊進球數
大(1-50) 0.77
小 1.07
客隊進球數
大(0.5) 1.2
小 0.7
上半場罰牌大小
大(2.5) 0.9
小 0.95
最先入球
主 0.81
客 1.11
否 8.8
最後入球
主 1.2
客 0.9
否 7.5`,
    result: { fullTimeHomeGoals: 2, fullTimeAwayGoals: 1, halfTimeHomeGoals: 1, halfTimeAwayGoals: 0 },
  },
  {
    id: "golden-010",
    league: "International",
    homeTeam: "德國",
    awayTeam: "法國",
    rawOdds: `德國 vs 法國
半全場
主/主 2.95
主/和 14
主/客 25
和/主 4.5
和/和 4.2
和/客 6
客/主 22
客/和 14
客/客 4.7
雙勝彩
主或和 0.35
和或客 0.6
主或客 0.35`,
    result: { fullTimeHomeGoals: 1, fullTimeAwayGoals: 2, halfTimeHomeGoals: 0, halfTimeAwayGoals: 1 },
  },
  {
    id: "golden-011",
    league: "International",
    homeTeam: "阿根廷",
    awayTeam: "烏拉圭",
    rawOdds: `阿根廷 vs 烏拉圭
獨贏
主 1.65
和 3.5
客 5.0
全場讓分
主0.5 0.9
客0.5 0.98
全場大小
大(2.5) 0.9
小 0.94
波膽
1-0 7.5
2-0 9.0
2-1 8.5
0-0 11
1-1 6.5`,
    result: { fullTimeHomeGoals: 2, fullTimeAwayGoals: 0, halfTimeHomeGoals: 1, halfTimeAwayGoals: 0 },
  },
  {
    id: "golden-012",
    league: "International",
    homeTeam: "葡萄牙",
    awayTeam: "克羅地亞",
    rawOdds: `葡萄牙 vs 克羅地亞
獨贏
主 2.05
和 3.25
客 3.6
全場讓分
主0-50 0.84
客0+50 1.04
全場大小
大(2.5) 0.91
小 0.93
單雙
單 0.95
雙 0.91`,
    result: { fullTimeHomeGoals: 1, fullTimeAwayGoals: 0, halfTimeHomeGoals: 0, halfTimeAwayGoals: 0 },
  },
];

const matches: GoldenMatchInput[] = FIXTURES.map((fixture) => ({
  id: fixture.id,
  league: fixture.league,
  homeTeam: fixture.homeTeam,
  awayTeam: fixture.awayTeam,
  rawOdds: fixture.rawOdds,
  actualResult: buildGoldenMatchResult(fixture.result),
}));

const expectations = Object.fromEntries(
  FIXTURES.map((fixture) => [
    fixture.id,
    {
      expectedParser: buildParserSnapshot(fixture.rawOdds),
      expectedAnalysis: buildAnalysisSnapshot(fixture.rawOdds),
      expectedCandidates: buildCandidateSnapshot(fixture.rawOdds),
    },
  ])
);

writeGoldenDataset(matches, expectations);

console.log(`Golden dataset bootstrapped with ${matches.length} matches.`);
