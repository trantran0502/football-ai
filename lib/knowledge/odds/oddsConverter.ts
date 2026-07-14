import type {
  DecimalOdds,
  OddsConverter,
  OddsPlatform,
  PlatformOddsInput,
} from "@/lib/knowledge/odds/types";

const platformConverters = new Map<OddsPlatform, OddsConverter>();

function convertDecimalOdds(value: number): number | null {
  return Number.isFinite(value) && value >= 1.01 ? value : null;
}

function convertHongKongOdds(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value + 1 : null;
}

function convertMalayOdds(value: number): number | null {
  if (!Number.isFinite(value) || value === 0) {
    return null;
  }
  return value > 0 ? value + 1 : 1 + 1 / Math.abs(value);
}

function convertIndonesianOdds(value: number): number | null {
  if (!Number.isFinite(value) || value === 0) {
    return null;
  }
  return value > 0 ? value + 1 : 1 - 1 / value;
}

function convertAmericanOdds(value: number): number | null {
  if (!Number.isFinite(value) || value === 0) {
    return null;
  }
  return value > 0 ? value / 100 + 1 : 100 / Math.abs(value) + 1;
}

function registerBuiltInConverters(): void {
  platformConverters.set("decimal", convertDecimalOdds);
  platformConverters.set("hongkong", convertHongKongOdds);
  platformConverters.set("malay", convertMalayOdds);
  platformConverters.set("indonesian", convertIndonesianOdds);
  platformConverters.set("american", convertAmericanOdds);
}

registerBuiltInConverters();

/**
 * 註冊自訂平台轉換器，支援未來擴充不同博彩平台格式。
 */
export function registerPlatformConverter(
  platform: OddsPlatform,
  converter: OddsConverter
): void {
  platformConverters.set(platform, converter);
}

/**
 * 取得目前已註冊的平台清單。
 */
export function getRegisteredPlatforms(): OddsPlatform[] {
  return [...platformConverters.keys()];
}

/**
 * 將平台賠率轉換為標準 Decimal Odds。
 */
export function convertOdds(input: PlatformOddsInput): DecimalOdds | null {
  const converter = platformConverters.get(input.platform);
  if (!converter) {
    return null;
  }

  const decimal = converter(input.value);
  if (decimal === null || !Number.isFinite(decimal) || decimal < 1.01) {
    return null;
  }

  return { decimal };
}
