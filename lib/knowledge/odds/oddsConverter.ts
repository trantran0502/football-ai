import { convertRawOdds } from "@/lib/analysis/featureScore/oddsConversion";
import type {
  DecimalOdds,
  OddsConverter,
  OddsPlatform,
  PlatformOddsInput,
} from "@/lib/knowledge/odds/types";

const legacyPlatformConverters = new Map<OddsPlatform, OddsConverter>();

/**
 * @deprecated Unified conversion ignores platform-specific formulas.
 * Kept for backward compatibility; does not affect convertOdds().
 */
export function registerPlatformConverter(
  platform: OddsPlatform,
  converter: OddsConverter
): void {
  legacyPlatformConverters.set(platform, converter);
}

/**
 * @deprecated Unified conversion ignores platform-specific formulas.
 */
export function getRegisteredPlatforms(): OddsPlatform[] {
  return [...legacyPlatformConverters.keys()];
}

/**
 * 將平台賠率轉換為標準 Decimal Odds。
 * 所有來源統一走 oddsConversion.convertRawOdds（依數值自動判斷香港盤／十進位）。
 */
export function convertOdds(input: PlatformOddsInput): DecimalOdds | null {
  const converted = convertRawOdds(input.value);
  if (!converted) {
    return null;
  }

  return { decimal: converted.decimalOdds };
}
