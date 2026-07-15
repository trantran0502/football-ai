export interface ApiFootballPlanSeasonRange {
  minSeason: number;
  maxSeason: number;
  message: string;
}

const PLAN_SEASON_RANGE_PATTERN = /try from (\d{4}) to (\d{4})/i;

export function parseApiFootballPlanSeasonRestriction(
  errors: unknown
): ApiFootballPlanSeasonRange | null {
  const messages = collectErrorMessages(errors);
  for (const message of messages) {
    const parsed = parsePlanSeasonMessage(message);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

export function parsePlanSeasonMessage(message: string): ApiFootballPlanSeasonRange | null {
  const match = message.match(PLAN_SEASON_RANGE_PATTERN);
  if (!match) {
    return null;
  }

  const minSeason = Number(match[1]);
  const maxSeason = Number(match[2]);
  if (!Number.isFinite(minSeason) || !Number.isFinite(maxSeason)) {
    return null;
  }

  return {
    minSeason,
    maxSeason,
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
      }
    }
    if (messages.length > 0) {
      return messages;
    }
    return [JSON.stringify(errors)];
  }

  return [String(errors)];
}
