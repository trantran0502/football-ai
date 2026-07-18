import { weightConfigAdminApiHandlers } from "@/lib/admin/weightConfigAdminApi";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return weightConfigAdminApiHandlers.postRollback(request);
}
