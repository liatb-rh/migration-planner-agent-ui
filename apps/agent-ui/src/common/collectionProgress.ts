import type { CollectorStatus } from "@openshift-migration-advisor/agent-sdk";

export type CollectionProgressInfo = {
  percentage: number;
  statusText: string;
};

/** Source of the collection, used to pick mode-appropriate progress copy. */
export type CollectionSource = "vcenter" | "rvtools";

const CONNECTING_TEXT: Record<CollectionSource, string> = {
  vcenter: "Connecting to vCenter...",
  rvtools: "Reading RVTools export...",
};

const COLLECTING_TEXT: Record<CollectionSource, string> = {
  vcenter: "Collecting inventory data...",
  rvtools: "Ingesting inventory data...",
};

const PARSING_TEXT: Record<CollectionSource, string> = {
  vcenter: "Parsing...",
  rvtools: "Parsing inventory...",
};

/**
 * Maps collector status to the progress copy used on first-time login and on
 * report refresh. The backend shares the same `CollectorStatus` enum for both
 * the vCenter and RVTools collection pipelines, so only the copy differs.
 */
export function getCollectionProgressInfo(
  status: CollectorStatus["status"] | null | undefined,
  errorMessage?: string | null,
  source: CollectionSource = "vcenter",
): CollectionProgressInfo {
  switch (status) {
    case "connecting":
      return { percentage: 20, statusText: CONNECTING_TEXT[source] };
    case "collecting":
    case "collecting metrics":
      return { percentage: 60, statusText: COLLECTING_TEXT[source] };
    case "parsing":
      return { percentage: 90, statusText: PARSING_TEXT[source] };
    case "collected":
      return { percentage: 100, statusText: "Collection complete" };
    case "error":
      return {
        percentage: 0,
        statusText: errorMessage
          ? `Error: ${errorMessage}`
          : "Collection failed",
      };
    default:
      return { percentage: 0, statusText: "" };
  }
}
