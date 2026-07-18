import { weightConfigAdminApiHandlers } from "@/lib/admin/weightConfigAdminApi";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return weightConfigAdminApiHandlers.getActive(request);
}
