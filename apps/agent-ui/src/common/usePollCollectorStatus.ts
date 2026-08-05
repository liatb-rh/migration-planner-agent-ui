import type { CollectorStatus } from "@openshift-migration-advisor/agent-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { newAbortSignal } from "./AbortSignal";
import type { DefaultApiInterface } from "./agentApi";
import { getCollectorStatus } from "./collectorApi";

const DEFAULT_POLL_INTERVAL_MS = 2000;
// Maximum consecutive polling failures before reporting an error to the user.
const DEFAULT_MAX_POLL_FAILURES = 5;

export interface UsePollCollectorStatusOptions {
  /** Called once when the collector status transitions to "collected". */
  onCollected?: () => void;
  /** Called on a reported collector error, or after too many failed polls. */
  onError?: (message: string) => void;
  intervalMs?: number;
  maxFailures?: number;
}

export interface UsePollCollectorStatusResult {
  status: CollectorStatus["status"] | null;
  isPolling: boolean;
  setStatus: (status: CollectorStatus["status"] | null) => void;
  /** Begin polling; optionally seed the displayed status immediately (e.g. "connecting"). */
  startPolling: (initialStatus?: CollectorStatus["status"] | null) => void;
  stopPolling: () => void;
}

/**
 * Polls `GET /collector` on an interval while a collection is in progress.
 * Shared by the vCenter login flow (`UseCredentialViewModel.ts`) and the
 * RVTools upload flow (`useRvtoolsUploadViewModel.ts`) since both drive the
 * same backend collector state machine/status enum.
 */
export function usePollCollectorStatus(
  agentApi: DefaultApiInterface,
  options?: UsePollCollectorStatusOptions,
): UsePollCollectorStatusResult {
  const {
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxFailures = DEFAULT_MAX_POLL_FAILURES,
  } = options ?? {};

  const [isPolling, setIsPolling] = useState(false);
  const [status, setStatus] = useState<CollectorStatus["status"] | null>(
    null,
  );
  const pollFailuresRef = useRef(0);

  // Keep latest callbacks in refs so the polling effect doesn't need to
  // restart (and re-fetch immediately) whenever a caller passes a fresh
  // inline callback.
  const onCollectedRef = useRef(options?.onCollected);
  const onErrorRef = useRef(options?.onError);
  useEffect(() => {
    onCollectedRef.current = options?.onCollected;
    onErrorRef.current = options?.onError;
  }, [options?.onCollected, options?.onError]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(
    (initialStatus?: CollectorStatus["status"] | null) => {
      pollFailuresRef.current = 0;
      if (initialStatus !== undefined) {
        setStatus(initialStatus);
      }
      setIsPolling(true);
    },
    [],
  );

  useEffect(() => {
    if (!isPolling) {
      return;
    }

    pollFailuresRef.current = 0;

    const pollStatus = async () => {
      try {
        const signal = newAbortSignal("Collector status request timed out.");
        const collectorStatus = await getCollectorStatus(agentApi, {
          signal,
        });

        pollFailuresRef.current = 0;
        setStatus(collectorStatus.status);

        if (collectorStatus.status === "collected") {
          setIsPolling(false);
          onCollectedRef.current?.();
        } else if (collectorStatus.status === "error") {
          setIsPolling(false);
          onErrorRef.current?.(collectorStatus.error || "Collection failed");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          console.warn(
            "Collector status poll timed out, will retry on next interval",
          );
        } else {
          pollFailuresRef.current += 1;
          console.error(
            `Error polling collector status (failure ${pollFailuresRef.current}/${maxFailures}):`,
            err,
          );

          if (pollFailuresRef.current >= maxFailures) {
            setIsPolling(false);
            onErrorRef.current?.(
              err instanceof Error
                ? `Failed to check collection status: ${err.message}`
                : "Failed to check collection status after multiple attempts",
            );
          }
        }
      }
    };

    const interval = setInterval(pollStatus, intervalMs);
    pollStatus();

    return () => {
      clearInterval(interval);
      pollFailuresRef.current = 0;
    };
  }, [isPolling, agentApi, intervalMs, maxFailures]);

  return { status, isPolling, setStatus, startPolling, stopPolling };
}
