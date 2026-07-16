import { isOfficialAnnouncementUrl } from "@/lib/providers/squadAvailability/squadAvailabilityOfficialSource";

export { isOfficialAnnouncementUrl };

export function countOfficialCitations(
  citations: Array<{ url?: string | null }> | null | undefined
): number {
  if (!citations?.length) {
    return 0;
  }

  return citations.filter((citation) =>
    isOfficialAnnouncementUrl(citation.url)
  ).length;
}

export function hasOfficialCitation(
  citations: Array<{ url?: string | null }> | null | undefined
): boolean {
  return countOfficialCitations(citations) > 0;
}
