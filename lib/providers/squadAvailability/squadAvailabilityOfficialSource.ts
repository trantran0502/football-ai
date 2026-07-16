const UNOFFICIAL_DOMAIN_PATTERN =
  /transfermarkt|flashscore|sofascore|whoscored|oddsportal|bet365|skysports|espn\.com\/(?!.+official)/i;

const OFFICIAL_DOMAIN_PATTERN =
  /official|premierleague|laliga|bundesliga|seriea|mlssoccer|uefa|fifa|concacaf|afc\.com|\.fc\.|football|soccer|club|league|federation|cbf\.com|cbf\.br/i;

const OFFICIAL_PATH_PATTERN =
  /\/(news|announcement|team-news|teamnews|injury|injuries|suspension|suspensions|squad|press|official|match-preview|preview)/i;

export function isOfficialAnnouncementUrl(url: string | null | undefined): boolean {
  if (!url || !url.trim()) {
    return false;
  }

  const normalized = url.trim().toLowerCase();
  if (UNOFFICIAL_DOMAIN_PATTERN.test(normalized)) {
    return false;
  }

  return (
    OFFICIAL_DOMAIN_PATTERN.test(normalized) || OFFICIAL_PATH_PATTERN.test(normalized)
  );
}

export type SquadPlayerStatus =
  | "injured"
  | "suspended"
  | "doubtful"
  | "unavailable";

export function classifySquadPlayerStatus(
  status: string | null | undefined,
  reason: string | null | undefined
): SquadPlayerStatus | null {
  const text = `${status ?? ""} ${reason ?? ""}`.trim().toLowerCase();
  if (!text) {
    return null;
  }

  if (/unclear|maybe|unknown|tbd|pending|possible|rumou?r|unconfirmed/.test(text)) {
    return null;
  }

  if (/suspend|suspension|ban|red card|sent off/.test(text)) {
    return "suspended";
  }
  if (/doubt|fitness test|uncertain|late decision|questionable|75%|50%/.test(text)) {
    return "doubtful";
  }
  if (/injur|muscle|hamstring|knee|ankle|groin|strain|tear|fracture/.test(text)) {
    return "injured";
  }
  if (/unavailable|not in squad|will not play|ruled out|out for|sideline|miss|\bout\b/.test(text)) {
    return "unavailable";
  }

  return null;
}
