import {
  STORAGE_STATUS_LABELS,
  getStorageStatusClassName,
  type StorageHealth,
} from "@/lib/storage/storageStatus";

export function StorageStatusBanner({
  matchStatus,
  betaStatus,
}: {
  matchStatus: StorageHealth;
  betaStatus: StorageHealth;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <StorageStatusCard label="比賽紀錄" status={matchStatus} />
      <StorageStatusCard label="Beta 資料" status={betaStatus} />
    </div>
  );
}

function StorageStatusCard({
  label,
  status,
}: {
  label: string;
  status: StorageHealth;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${getStorageStatusClassName(status)}`}
    >
      <p className="font-medium">{label}</p>
      <p className="mt-1 text-xs opacity-90">{STORAGE_STATUS_LABELS[status]}</p>
    </div>
  );
}
