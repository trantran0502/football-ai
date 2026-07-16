export interface ApiFootballPlanSeasonRange {
  minSeason: number;
  maxSeason: number;
  message: string;
}

const PLAN_SEASON_RANGE_PATTERNS = [
  /try from (\d{4}) to (\d{4})/i,
  /from (\d{4}) to (\d{4})/i,
  /between (\d{4}) and (\d{4})/i,
  /seasons?\s+(\d{4})\s*[-–]\s*(\d{4})/i,
] as const;

const PLAN_RESTRICTION_HINT =
  /free plan|plan restriction|do not have access|not have access to this season|subscription plan|upgrade your plan/i;

const PLAN_LAST_PARAMETER_HINT = /last parameter/i;

export function parseApiFootballPlanSeasonRestriction(
  errors: unknown
): ApiFootballPlanSeasonRange | null {
  const messages = collectErrorMessages(errors);
  if (typeof errors === "object" && errors !== null) {
    messages.push(JSON.stringify(errors));
  } else if (typeof errors === "string") {
    messages.push(errors);
  }

  const seen = new Set<string>();
  for (const message of messages) {
    const trimmed = message.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);

    const parsed = parsePlanSeasonMessage(trimmed);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function parseApiFootballPlanLastParameterRestriction(
  errors: unknown
): { message: string } | null {
  const messages = collectErrorMessages(errors);
  if (typeof errors === "object" && errors !== null) {
    messages.push(JSON.stringify(errors));
  } else if (typeof errors === "string") {
    messages.push(errors);
  }

  for (const message of messages) {
    if (PLAN_LAST_PARAMETER_HINT.test(message)) {
      return { message: message.trim() };
    }
  }

  return null;
}

export function parsePlanLastParameterRestrictionFromText(
  text: string
): { message: string } | null {
  const normalized = text.replace(/^API-Football error:\s*/i, "").trim();
  return parseApiFootballPlanLastParameterRestriction(normalized);
}

export function parsePlanSeasonRestrictionFromText(text: string): ApiFootballPlanSeasonRange | null {
  const normalized = text.replace(/^API-Football error:\s*/i, "").trim();
  const direct = parsePlanSeasonMessage(normalized);
  if (direct) {
    return direct;
  }

  if (normalized.startsWith("{") || normalized.startsWith("[")) {
    try {
      return parseApiFootballPlanSeasonRestriction(JSON.parse(normalized));
    } catch {
      return parseApiFootballPlanSeasonRestriction(normalized);
    }
  }

  return parseApiFootballPlanSeasonRestriction(normalized);
}

const YEAR_TOKEN_PATTERN = /\b(19\d{2}|20\d{2})\b/g;

export function parsePlanSeasonMessage(message: string): ApiFootballPlanSeasonRange | null {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }

  for (const pattern of PLAN_SEASON_RANGE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return buildPlanSeasonRange(match[1], match[2], trimmed);
    }
  }

  if (!PLAN_RESTRICTION_HINT.test(trimmed)) {
    return null;
  }

  const years = [...trimmed.matchAll(YEAR_TOKEN_PATTERN)]
    .map((match) => Number(match[1]))
    .filter((year) => Number.isFinite(year))
    .sort((left, right) => left - right);

  if (years.length >= 2) {
    return buildPlanSeasonRange(String(years[0]), String(years[years.length - 1]), trimmed);
  }

  return null;
}

function buildPlanSeasonRange(
  minRaw: string,
  maxRaw: string,
  message: string
): ApiFootballPlanSeasonRange | null {
  const minSeason = Number(minRaw);
  const maxSeason = Number(maxRaw);
  if (!Number.isFinite(minSeason) || !Number.isFinite(maxSeason)) {
    return null;
  }

  return {
    minSeason: Math.min(minSeason, maxSeason),
    maxSeason: Math.max(minSeason, maxSeason),
    message: message.trim(),
  };
}

function collectErrorMessages(errors: unknown): string[] {
  if (!errors) {
    return [];
  }

  if (typeof errors === "string") {
    return [errors];
  }

  if (Array.isArray(errors)) {
    return errors.flatMap((item) => collectErrorMessages(item));
  }

  if (typeof errors === "object") {
    const record = errors as Record<string, unknown>;
    const messages: string[] = [];
    for (const value of Object.values(record)) {
      if (typeof value === "string" && value.trim().length > 0) {
        messages.push(value);
      } else if (value !== null && typeof value === "object") {
        messages.push(...collectErrorMessages(value));
      }
    }
    if (messages.length > 0) {
      return messages;
    }
    return [JSON.stringify(errors)];
  }

  return [String(errors)];
}
