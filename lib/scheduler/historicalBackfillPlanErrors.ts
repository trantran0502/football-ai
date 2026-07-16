export interface ApiFootballPlanDateRange {
  minDate: string;
  maxDate: string;
  message: string;
}

const PLAN_DATE_RANGE_PATTERNS = [
  /try from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i,
  /from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i,
  /between (\d{4}-\d{2}-\d{2}) and (\d{4}-\d{2}-\d{2})/i,
] as const;

const PLAN_DATE_RESTRICTION_HINT =
  /free plan|do not have access to this date|not have access to this date|access to this date/i;

export function parseApiFootballPlanDateRestriction(
  error: unknown
): ApiFootballPlanDateRange | null {
  const message = normalizeErrorMessage(error);
  if (!message) {
    return null;
  }

  if (!PLAN_DATE_RESTRICTION_HINT.test(message)) {
    return null;
  }

  for (const pattern of PLAN_DATE_RANGE_PATTERNS) {
    const match = message.match(pattern);
    if (!match) {
      continue;
    }

    const minDate = match[1];
    const maxDate = match[2];
    if (!isDateKey(minDate) || !isDateKey(maxDate)) {
      continue;
    }

    return {
      minDate: minDate <= maxDate ? minDate : maxDate,
      maxDate: minDate <= maxDate ? maxDate : minDate,
      message: message.trim(),
    };
  }

  return null;
}

export function isPlanDateAccessError(error: unknown): boolean {
  return parseApiFootballPlanDateRestriction(error) !== null;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error);
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
