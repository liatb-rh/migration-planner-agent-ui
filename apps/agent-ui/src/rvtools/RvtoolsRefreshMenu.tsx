import { useInjection } from "@migration-planner-ui/ioc";
import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@patternfly/react-core";
import { UploadIcon } from "@patternfly/react-icons";
import type React from "react";
import { useCallback, useState } from "react";
import { newAbortSignal } from "../common/AbortSignal";
import type { DefaultApiInterface } from "../common/agentApi";
import { getCollectionProgressInfo } from "../common/collectionProgress";
import { CollectionProgress } from "../common/components/index";
import { parseApiError } from "../common/parseApiError";
import { startRvtoolsCollector } from "../common/rvtoolsApi";
import { Time } from "../common/Time";
import { usePollCollectorStatus } from "../common/usePollCollectorStatus";
import { Symbols } from "../main/Symbols";
import { RVToolsUploadForm } from "./RVToolsUploadForm";

const UPLOAD_TIMEOUT_MS = 5 * Time.Minute;
const RVTOOLS_REFRESH_FORM_ID = "rvtools-refresh-upload-form";

interface RvtoolsRefreshMenuProps {
  refetchAgentStatus: () => Promise<void>;
}

/**
 * Masthead action giving RVTools mode parity with the vCenter mode's
 * "edit credentials, then run new report" flow. There's no separate
 * credentials concept in this mode, so re-uploading files does both jobs
 * (source of truth + trigger) in one step.
 */
export const RvtoolsRefreshMenu: React.FC<RvtoolsRefreshMenuProps> = ({
  refetchAgentStatus,
}) => {
  const agentApi = useInjection<DefaultApiInterface>(Symbols.AgentApi);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCollected = useCallback(() => {
    refetchAgentStatus()
      .catch((err) => {
        console.error("Failed to refetch agent status:", err);
      })
      .finally(() => {
        // Reloading is the simplest correct way to refresh every report
        // surface (overview, groups, VM detail) with the newly-collected
        // inventory, without lifting refresh state across the masthead
        // (ReportLayout) / route content (ReportContainer) boundary.
        window.location.reload();
      });
  }, [refetchAgentStatus]);

  const handlePollError = useCallback((message: string) => {
    setIsUploading(false);
    setError(message);
  }, []);

  const { status, setStatus, startPolling, stopPolling } =
    usePollCollectorStatus(agentApi, {
      onCollected: handleCollected,
      onError: handlePollError,
    });

  const progressInfo = getCollectionProgressInfo(status, error, "rvtools");

  const openModal = () => {
    setError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isUploading) {
      return;
    }
    setIsModalOpen(false);
  };

  const handleUpload = async (files: File[]) => {
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
      setError(await parseApiError(err, "Failed to upload RVTools export"));
    }
  };

  const handleCancel = async () => {
    try {
      await agentApi.stopCollector();
      stopPolling();
      setIsUploading(false);
      setStatus(null);
      setError(null);
    } catch (err) {
      setError(await parseApiError(err, "Failed to cancel upload"));
    }
  };

  return (
    <>
      <Button variant="secondary" icon={<UploadIcon />} onClick={openModal}>
        Upload new files
      </Button>
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        variant="medium"
        aria-labelledby="rvtools-refresh-modal-title"
      >
        <ModalHeader
          title="Upload new RVTools export"
          labelId="rvtools-refresh-modal-title"
        />
        <ModalBody>
          <RVToolsUploadForm
            id={RVTOOLS_REFRESH_FORM_ID}
            onSubmit={handleUpload}
            isSubmitting={isUploading}
            error={error ?? undefined}
          />
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            type="submit"
            form={RVTOOLS_REFRESH_FORM_ID}
            isLoading={isUploading}
          >
            Start new collection
          </Button>
          <Button
            variant="link"
            onClick={() => {
              void (isUploading ? handleCancel() : closeModal());
            }}
          >
            {isUploading ? "Cancel" : "Close"}
          </Button>
          {isUploading && (
            <CollectionProgress
              percentage={progressInfo.percentage}
              statusText={progressInfo.statusText}
            />
          )}
        </ModalFooter>
      </Modal>
    </>
  );
};

RvtoolsRefreshMenu.displayName = "RvtoolsRefreshMenu";
