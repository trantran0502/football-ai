import { serviceUnavailableResponse } from "@/lib/security/securityResponse";
import type { NextResponse } from "next/server";

export function isSchedulerEnabled(): boolean {
  const value = process.env.SCHEDULER_ENABLED?.trim().toLowerCase();
  if (value === "false" || value === "0" || value === "no") {
    return false;
  }
  return true;
}

export function schedulerDisabledResponse(): NextResponse {
  return serviceUnavailableResponse();
}

export function requireSchedulerEnabled(): NextResponse | null {
  if (!isSchedulerEnabled()) {
    return schedulerDisabledResponse();
  }
  return null;
}
