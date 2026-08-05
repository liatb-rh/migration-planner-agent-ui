import type { CollectorStatus } from "@openshift-migration-advisor/agent-sdk";
import {
  Alert,
  Button,
  Content,
  Divider,
  Flex,
  FlexItem,
  Modal,
  ModalBody,
  ModalFooter,
  Title,
} from "@patternfly/react-core";
import type React from "react";
import { useMemo } from "react";
import { getCollectionProgressInfo } from "../common/collectionProgress";
import { CollectionProgress, RedHatLogo } from "../common/components/index";
import type { ApiError } from "../common/components/index";
import { RVToolsUploadForm } from "./RVToolsUploadForm";

interface MainRvtoolsUploadModalProps {
  isOpen: boolean;
  version?: string;
  isUploading: boolean;
  status: CollectorStatus["status"] | null;
  error: ApiError | null;
  onUpload: (files: File[]) => void;
  onCancel: () => void;
}

const RVTOOLS_UPLOAD_FORM_ID = "rvtools-upload-form";

export const MainRvtoolsUploadModal: React.FC<MainRvtoolsUploadModalProps> = ({
  isOpen,
  version,
  isUploading,
  status,
  error,
  onUpload,
  onCancel,
}) => {
  const progressInfo = useMemo(
    () => getCollectionProgressInfo(status, error?.message, "rvtools"),
    [status, error],
  );

  return (
    <Modal
      isOpen={isOpen}
      variant="medium"
      aria-labelledby="rvtools-upload-modal-title"
    >
      <ModalBody>
        <Flex direction={{ default: "column" }} gap={{ default: "gapMd" }}>
          <FlexItem>
            <RedHatLogo />
          </FlexItem>

          <Flex
            justifyContent={{
              default: "justifyContentSpaceBetween",
            }}
            alignItems={{ default: "alignItemsCenter" }}
          >
            <FlexItem>
              <Title
                headingLevel="h1"
                size="2xl"
                id="rvtools-upload-modal-title"
              >
                Migration Advisor Agent
              </Title>
            </FlexItem>
            {version && (
              <FlexItem>
                <Content component="small">ver {version}</Content>
              </FlexItem>
            )}
          </Flex>

          <FlexItem>
            <Content component="p">
              This appliance is running in disconnected RVTools mode. Upload
              one or more RVTools Excel exports to generate your assessment —
              no connection to vCenter or Red Hat is required or possible in
              this mode.
            </Content>
          </FlexItem>

          <Divider />

          <FlexItem>
            <Title headingLevel="h2" size="lg">
              Upload RVTools export
            </Title>
          </FlexItem>

          <FlexItem>
            <RVToolsUploadForm
              id={RVTOOLS_UPLOAD_FORM_ID}
              onSubmit={onUpload}
              isSubmitting={isUploading}
              error={error?.message}
            />
          </FlexItem>

          <FlexItem>
            <Alert variant="info" isInline isPlain title="Processed locally">
              Files are processed locally on this appliance and deleted after
              import. No data leaves this environment.
            </Alert>
          </FlexItem>
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form={RVTOOLS_UPLOAD_FORM_ID}
          isLoading={isUploading}
        >
          Create assessment report
        </Button>
        {isUploading && (
          <>
            <Button variant="link" onClick={onCancel}>
              Cancel
            </Button>
            <CollectionProgress
              percentage={progressInfo.percentage}
              statusText={progressInfo.statusText}
            />
          </>
        )}
      </ModalFooter>
    </Modal>
  );
};

MainRvtoolsUploadModal.displayName = "MainRvtoolsUploadModal";
