import { useInjection } from "@migration-planner-ui/ioc";
import type { CollectorStatus } from "@openshift-migration-advisor/agent-sdk";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { newAbortSignal } from "../common/AbortSignal";
import type { DefaultApiInterface } from "../common/agentApi";
import { getCollectorStatus } from "../common/collectorApi";
import type { ApiError } from "../common/components/index";
import { parseApiError } from "../common/parseApiError";
import { startRvtoolsCollector } from "../common/rvtoolsApi";
import { Time } from "../common/Time";
import { usePollCollectorStatus } from "../common/usePollCollectorStatus";
import { Symbols } from "../main/Symbols";

// A multi-file .xlsx upload can legitimately take much longer than the
// short/quick-call timeout used elsewhere (credentials, start-collector) —
// give it a generous timeout of its own rather than reusing the default.
const UPLOAD_TIMEOUT_MS = 5 * Time.Minute;

export interface RvtoolsUploadViewModelInterface {
  version: string | undefined;
  isUploading: boolean;
  status: CollectorStatus["status"] | null;
  error: ApiError | null;
  onUpload: (files: File[]) => Promise<void>;
  onCancel: () => Promise<void>;
}

interface UseRvtoolsUploadViewModelProps {
  refetchAgentStatus?: () => Promise<void>;
}

/**
 * Mirrors `useLoginViewModel` (vCenter flow), but starts the collection via
 * `POST /collector/rvtools` instead of `putCredentials` + `startCollector`.
 * Shares the same collector-status polling hook as the vCenter flow.
 */
export const useRvtoolsUploadViewModel = (
  props?: UseRvtoolsUploadViewModelProps,
): RvtoolsUploadViewModelInterface => {
  const agentApi = useInjection<DefaultApiInterface>(Symbols.AgentApi);
  const navigate = useNavigate();
  const refetchAgentStatus = props?.refetchAgentStatus;
  const [version, setVersion] = useState<string | undefined>(undefined);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const versionInfo = await agentApi.getVersion();
        setVersion(versionInfo.version);
      } catch (err) {
        console.warn("Failed to fetch agent version:", err);
      }
    };

    fetchVersion();
  }, [agentApi]);

  useEffect(() => {
    const checkInitialStatus = async () => {
      try {
        const collectorStatus = await getCollectorStatus(agentApi);

        if (collectorStatus.status === "collected") {
          navigate("/report");
        }
      } catch (err) {
        console.warn("Failed to check initial collector status:", err);
      }
    };

    checkInitialStatus();
  }, [agentApi, navigate]);

  const handleCollected = useCallback(() => {
    if (refetchAgentStatus) {
      refetchAgentStatus().catch((refetchErr) => {
        console.error("Failed to refetch agent status:", refetchErr);
      });
    }
    navigate("/report");
  }, [navigate, refetchAgentStatus]);

  const handlePollError = useCallback((message: string) => {
    setIsUploading(false);
    setError({ message });
  }, []);

  const { status, setStatus, startPolling, stopPolling } =
    usePollCollectorStatus(agentApi, {
      onCollected: handleCollected,
      onError: handlePollError,
    });

  const onUpload = useCallback(
    async (files: File[]) => {
      setError(null);
      setIsUploading(true);
      stopPolling();
      setStatus("connecting");

      try {
        const signal = newAbortSignal(
          "The RVTools upload didn't complete in time.",
          UPLOAD_TIMEOUT_MS,
        );

        const started = await startRvtoolsCollector(agentApi, files, {
          signal,
        });
        startPolling(started.status);
      } catch (err) {
        stopPolling();
        setIsUploading(false);
        setStatus(null);

        const errorMessage = await parseApiError(
          err,
          "Failed to upload RVTools export",
        );
        setError({ message: errorMessage });
        console.error("Error uploading RVTools export:", err);
      }
    },
    [agentApi, startPolling, stopPolling, setStatus],
  );

  const onCancel = useCallback(async () => {
    try {
      await agentApi.stopCollector();
      stopPolling();
      setIsUploading(false);
      setStatus(null);
      setError(null);
    } catch (err) {
      const errorMessage = await parseApiError(
        err,
        "Failed to cancel upload",
      );
      setError({ message: errorMessage });
      console.error("Error canceling RVTools upload:", err);
    }
  }, [agentApi, stopPolling, setStatus]);

  return {
    version,
    isUploading,
    status,
    error,
    onUpload,
    onCancel,
  };
};
