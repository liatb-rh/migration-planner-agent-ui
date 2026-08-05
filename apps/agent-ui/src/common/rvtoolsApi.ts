import type { CollectorStatus } from "@openshift-migration-advisor/agent-sdk";
import type { DefaultApiInterface } from "./agentApi";

/**
 * Forward-compat surface for `POST /collector/rvtools` (ECOPROJECT-5123).
 * `@openshift-migration-advisor/agent-sdk` has not been republished with a
 * matching `startRvtoolsCollector` operation yet — this is a blocking
 * prerequisite for the backend PR (kubev2v/assisted-migration-agent#356).
 *
 * Once the SDK ships `startRvtoolsCollector` on `CollectorApiInterface`,
 * delete this file's local type augmentation and call
 * `agentApi.startRvtoolsCollector(...)` directly; the wrapper function below
 * can stay (it matches the existing `getCollectorStatus`/`getLatestCollectionId`
 * thin-wrapper pattern in this directory) or be inlined at call sites.
 */
export interface StartRvtoolsCollectorRequest {
  files: Array<Blob>;
}

interface RvtoolsCollectorApiInterface {
  startRvtoolsCollector(
    requestParameters: StartRvtoolsCollectorRequest,
    initOverrides?: RequestInit,
  ): Promise<CollectorStatus>;
}

type RvtoolsCapableApi = DefaultApiInterface & RvtoolsCollectorApiInterface;

/** Upload one or more RVTools `.xlsx` exports and start the collection pipeline. */
export async function startRvtoolsCollector(
  agentApi: DefaultApiInterface,
  files: File[],
  initOverrides?: RequestInit,
): Promise<CollectorStatus> {
  return (agentApi as RvtoolsCapableApi).startRvtoolsCollector(
    { files },
    initOverrides,
  );
}
