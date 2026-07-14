import type { SchedulerJobName, SchedulerLockState } from "@/lib/scheduler/schedulerTypes";

const locks = new Map<SchedulerJobName, SchedulerLockState>();

export function acquireSchedulerLock(input: {
  jobName: SchedulerJobName;
  ownerId: string;
  ttlMs: number;
}): { acquired: boolean; existing: SchedulerLockState | null } {
  cleanupExpiredLocks();
  const existing = locks.get(input.jobName);
  if (existing && new Date(existing.expiresAt).getTime() > Date.now()) {
    return { acquired: false, existing };
  }

  const now = new Date();
  const lock: SchedulerLockState = {
    jobName: input.jobName,
    lockedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlMs).toISOString(),
    ownerId: input.ownerId,
  };
  locks.set(input.jobName, lock);
  return { acquired: true, existing: null };
}

export function releaseSchedulerLock(jobName: SchedulerJobName, ownerId: string): void {
  const existing = locks.get(jobName);
  if (existing?.ownerId === ownerId) {
    locks.delete(jobName);
  }
}

export function listActiveSchedulerLocks(): SchedulerLockState[] {
  cleanupExpiredLocks();
  return [...locks.values()];
}

export function resetSchedulerLocksForTests(): void {
  locks.clear();
}

function cleanupExpiredLocks(): void {
  const now = Date.now();
  for (const [key, lock] of locks.entries()) {
    if (new Date(lock.expiresAt).getTime() <= now) {
      locks.delete(key);
    }
  }
}
