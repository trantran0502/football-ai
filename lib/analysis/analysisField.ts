/**
 * 分析欄位：僅在規則完成後才可標記為 known。
 */
export type AnalysisField<T> =
  | { status: "known"; value: T }
  | { status: "unknown"; reason: string };

export function unknownField<T>(
  reason: string
): AnalysisField<T> {
  return { status: "unknown", reason };
}

export function isKnownField<T>(
  field: AnalysisField<T>
): field is { status: "known"; value: T } {
  return field.status === "known";
}

export function formatAnalysisField<T>(
  field: AnalysisField<T>,
  formatValue?: (value: T) => string
): string {
  if (field.status === "unknown") {
    return `unknown (${field.reason})`;
  }
  return formatValue ? formatValue(field.value) : String(field.value);
}
