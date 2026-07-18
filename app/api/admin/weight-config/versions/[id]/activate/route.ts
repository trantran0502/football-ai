import { weightConfigAdminApiHandlers } from "@/lib/admin/weightConfigAdminApi";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return weightConfigAdminApiHandlers.postActivate(request, id);
}
