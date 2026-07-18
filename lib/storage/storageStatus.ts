/** M5: Fixed storage policy — always attempt Supabase before LocalStorage. */
export const STORAGE_POLICY = "supabase-first" as const;

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export type StorageHealth = "supabase" | "local" | "failed";

export const STORAGE_STATUS_LABELS: Record<StorageHealth, string> = {
  supabase: "Supabase",
  local: "LocalStorage fallback",
  failed: "儲存失敗",
};

export function getStorageStatusClassName(health: StorageHealth): string {
  switch (health) {
    case "supabase":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "local":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-900";
  }
}

export function combineStorageHealth(
  ...values: StorageHealth[]
): StorageHealth {
  if (values.includes("failed")) {
    return "failed";
  }
  if (values.includes("local")) {
    return "local";
  }
  return "supabase";
}
