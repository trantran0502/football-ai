import { parseOdds } from "../lib/parser/parser";
import { parseCorrectScorePairs } from "../lib/parser/marketParsers/parseCorrectScoreMarket";
import { buildCombinedHalfMoneylineHandicapSelections } from "../lib/parser/marketBuilders";
import { parseAsianMarket } from "../lib/parser/marketParsers/parseAsianMarket";
import type { MarketSelection } from "../types/match";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function sel(
  selections: MarketSelection[],
  filter: Partial<MarketSelection>
) {
  return selections.find((s) =>
    Object.entries(filter).every(
      ([k, v]) => (s as unknown as Record<string, unknown>)[k] === v
    )
  );
}

const scorePairs = parseCorrectScorePairs("0:0 90:1 90:2 16.20:3 450:4 126");
assert(scorePairs.length === 5, `correct score count ${scorePairs.length}`);
assert(scorePairs[0].label === "0:0" && scorePairs[0].odds === 9, "0:0 odds");
assert(scorePairs[1].label === "0:1" && scorePairs[1].odds === 9, "0:1 odds");
assert(scorePairs[2].label === "0:2" && scorePairs[2].odds === 16.2, "0:2 odds");
assert(scorePairs[3].label === "0:3" && scorePairs[3].odds === 45, "0:3 odds");
assert(scorePairs[4].label === "0:4" && scorePairs[4].odds === 126, "0:4 odds");

const combined = buildCombinedHalfMoneylineHandicapSelections(
  "上半場獨贏與讓分",
  `主 2 客 2.85 和 1.04 主0 0.72 客0 1.18 主 0.39 客(0-50) 1.51 主(0-50) 1.28 客 0.62`
);
const mlHome = sel(combined, { marketType: "moneyline", side: "home" });
const mlAway = sel(combined, { marketType: "moneyline", side: "away" });
const mlDraw = sel(combined, { marketType: "moneyline", side: "draw" });
assert(mlHome?.odds === 2 && mlHome.title === "上半場獨贏", "ml home");
assert(mlAway?.odds === 2.85, "ml away");
assert(mlDraw?.odds === 1.04, "ml draw");
const hc = combined.filter((s) => s.marketType === "handicap");
assert(hc.length === 6, `handicap selections ${hc.length}`);
assert(
  combined.some((s) => s.title === "上半場獨贏" && s.side === "home"),
  "half moneyline"
);
assert(
  combined.some((s) => s.title === "上半場讓分（0）"),
  "half handicap 0"
);
assert(
  combined.some((s) => s.title === "上半場讓分（0-50）"),
  "half handicap 0-50"
);

const segment = parseAsianMarket(
  "totalGoals",
  "0~15分鐘大小",
  "大(0.5) 1.52 小 0.3",
  "asianOverUnder"
);
assert(segment.length === 2, `segment ou ${segment.length}`);
assert(sel(segment, { side: "over" })?.odds === 1.52, "segment over");
assert(sel(segment, { side: "under" })?.odds === 0.3, "segment under");

const htft = parseOdds(
  `半全場\n主/主 2.95 主/和 14 主/客 25 和/主 4.5 和/和 4.2 和/客 6 客/主 22 客/和 14 客/客 4.7`
);
assert(
  htft.marketSelections.length === 9,
  `htft count ${htft.marketSelections.length}`
);
assert(
  sel(htft.marketSelections, { label: "主/主" })?.odds === 2.95,
  "htft 主/主"
);

const dc = parseOdds("雙勝彩\n主或和 0.35\n和或客 0.6\n主或客 0.35");
assert(
  dc.marketSelections.length === 3,
  `dc count ${dc.marketSelections.length}`
);
assert(
  sel(dc.marketSelections, { side: "homeOrDraw" })?.label === "主或和",
  "dc homeOrDraw"
);
assert(
  sel(dc.marketSelections, { side: "drawOrAway" })?.label === "和或客",
  "dc drawOrAway"
);
assert(
  sel(dc.marketSelections, { side: "homeOrAway" })?.label === "主或客",
  "dc homeOrAway"
);

const fg = parseOdds("最先入球\n主 0.81\n客 1.11\n否 8.8");
assert(
  fg.marketSelections.every((s) => s.line === null),
  "first goal null line"
);
assert(sel(fg.marketSelections, { side: "home" })?.odds === 0.81, "fg home");
assert(sel(fg.marketSelections, { side: "away" })?.odds === 1.11, "fg away");
assert(sel(fg.marketSelections, { side: "none" })?.odds === 8.8, "fg none");
assert(fg.marketSelections[0]?.marketType === "firstGoal", "fg type");

console.log("All parser validation checks passed.");
