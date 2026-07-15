const PLACEHOLDER_ODDS_TEMPLATE = `{home} vs {away}
獨贏
主 1.95
和 3.40
客 3.80
全場讓分
主-0.5 0.92
客+0.5 0.98
全場大小
大(2.5) 0.90
小(2.5) 0.96
雙方進球
是 0.82
否 1.02`;

export function buildSchedulerPlaceholderOdds(homeTeam: string, awayTeam: string): string {
  return PLACEHOLDER_ODDS_TEMPLATE.replace("{home}", homeTeam).replace("{away}", awayTeam);
}
