import type { GoldenDiff, GoldenStageResult } from "@/lib/golden/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeComparableValue(value: unknown): unknown {
  if (typeof value === "number") {
    return value === 0 ? 0 : value;
  }
  return value;
}

export function collectDiffs(
  expected: unknown,
  actual: unknown,
  path = ""
): GoldenDiff[] {
  const normalizedExpected = normalizeComparableValue(expected);
  const normalizedActual = normalizeComparableValue(actual);

  if (Object.is(normalizedExpected, normalizedActual)) {
    return [];
  }

  if (expected === null || actual === null) {
    return [{ path: path || "(root)", expected, actual }];
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return [
        {
          path: path || "(root)",
          expected: `array length ${expected.length}`,
          actual: `array length ${actual.length}`,
        },
      ];
    }

    const diffs: GoldenDiff[] = [];
    for (let index = 0; index < expected.length; index += 1) {
      diffs.push(
        ...collectDiffs(
          expected[index],
          actual[index],
          `${path}[${index}]`
        )
      );
    }
    return diffs;
  }

  if (isPlainObject(expected) && isPlainObject(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
      .sort();
    const diffs: GoldenDiff[] = [];

    for (const key of keys) {
      const nextPath = path ? `${path}.${key}` : key;
      if (!(key in expected)) {
        diffs.push({
          path: nextPath,
          expected: undefined,
          actual: actual[key],
        });
        continue;
      }
      if (!(key in actual)) {
        diffs.push({
          path: nextPath,
          expected: expected[key],
          actual: undefined,
        });
        continue;
      }
      diffs.push(...collectDiffs(expected[key], actual[key], nextPath));
    }

    return diffs;
  }

  return [{ path: path || "(root)", expected, actual }];
}

export function compareStage(
  expected: unknown,
  actual: unknown
): GoldenStageResult {
  const diffs = collectDiffs(expected, actual);
  return {
    status: diffs.length === 0 ? "PASS" : "FAIL",
    diffs,
  };
}
