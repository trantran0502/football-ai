export type SampleWarningLevel =
  | "very_low"
  | "low"
  | "preliminary"
  | "comparable"
  | "adjustable";

export function getSampleWarning(verifiedCount: number): string {
  if (verifiedCount < 20) {
    return "樣本極低（少於 20 筆）";
  }
  if (verifiedCount < 50) {
    return "樣本偏低（20～49 筆）";
  }
  if (verifiedCount < 100) {
    return "初步參考（50～99 筆）";
  }
  if (verifiedCount < 300) {
    return "可開始比較（100 筆以上）";
  }
  return "才適合調整主要權重（300 筆以上）";
}

export function getSampleWarningLevel(
  verifiedCount: number
): SampleWarningLevel {
  if (verifiedCount < 20) {
    return "very_low";
  }
  if (verifiedCount < 50) {
    return "low";
  }
  if (verifiedCount < 100) {
    return "preliminary";
  }
  if (verifiedCount < 300) {
    return "comparable";
  }
  return "adjustable";
}
