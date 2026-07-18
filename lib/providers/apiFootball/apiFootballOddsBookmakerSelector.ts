import type { ApiFootballOddsBookmaker } from "@/lib/providers/apiFootball/apiFootballOddsTypes";

function parsePreferredBookmakerId(value: string | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolvePreferredBookmakerId(
  explicitBookmakerId?: string
): number | null {
  const fromQuery = parsePreferredBookmakerId(explicitBookmakerId);
  if (fromQuery !== null) {
    return fromQuery;
  }
  return parsePreferredBookmakerId(process.env.SCHEDULER_ODDS_BOOKMAKER_ID);
}

export function selectApiFootballBookmaker(
  bookmakers: ApiFootballOddsBookmaker[],
  options: { preferredBookmakerId?: string } = {}
): ApiFootballOddsBookmaker | null {
  if (bookmakers.length === 0) {
    return null;
  }

  const preferredId = resolvePreferredBookmakerId(options.preferredBookmakerId);
  if (preferredId !== null) {
    const preferred = bookmakers.find((bookmaker) => bookmaker.id === preferredId);
    if (preferred) {
      return preferred;
    }
  }

  return [...bookmakers].sort((left, right) => left.id - right.id)[0] ?? null;
}
