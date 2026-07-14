export function getAdminRepairKey(): string | null {
  const key = process.env.ADMIN_REPAIR_KEY?.trim();
  return key ? key : null;
}

export function verifyAdminRepairKey(request: Request): boolean {
  const expected = getAdminRepairKey();
  if (!expected) {
    return false;
  }

  const provided = request.headers.get("x-admin-key")?.trim();
  return Boolean(provided && provided === expected);
}
