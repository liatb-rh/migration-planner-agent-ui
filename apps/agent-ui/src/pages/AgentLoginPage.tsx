import { AgentModeRequestModeEnum } from "@openshift-migration-advisor/agent-sdk";
import { Backdrop, Bullseye, Spinner } from "@patternfly/react-core";
import type React from "react";
import { useEffect } from "react";
import { useAgentStatus } from "../common/AgentStatusContext";
import { MainVCenterCredentialsModal } from "../credentials/MainVCenterCredentialsModal";
import { useLoginViewModel } from "../credentials/UseCredentialViewModel";
import { MainRvtoolsUploadModal } from "../rvtools/MainRvtoolsUploadModal";
import { useRvtoolsUploadViewModel } from "../rvtools/useRvtoolsUploadViewModel";

interface ModeLoginModalProps {
  refetchAgentStatus: () => Promise<void>;
  isDataShared: boolean;
}

// Each mode's modal owns its own view-model hook so only the active mode's
// API calls (version, initial collector status, polling) ever run — the
// inactive mode's modal is never mounted, not just hidden.
const VCenterLoginModal: React.FC<ModeLoginModalProps> = ({
  refetchAgentStatus,
  isDataShared,
}) => {
  const vm = useLoginViewModel({ refetchAgentStatus });
  return (
    <MainVCenterCredentialsModal
      isOpen={true}
      version={vm.version}
      isDataShared={isDataShared}
      isCollecting={vm.isCollecting}
      status={vm.status}
      error={vm.error}
      onCollect={vm.onCollect}
      onCancel={vm.onCancel}
    />
  );
};

const RvtoolsLoginModal: React.FC<{
  refetchAgentStatus: () => Promise<void>;
}> = ({ refetchAgentStatus }) => {
  const vm = useRvtoolsUploadViewModel({ refetchAgentStatus });
  return (
    <MainRvtoolsUploadModal
      isOpen={true}
      version={vm.version}
      isUploading={vm.isUploading}
      status={vm.status}
      error={vm.error}
      onUpload={vm.onUpload}
      onCancel={vm.onCancel}
    />
  );
};

const AgentLoginPage: React.FC = () => {
  const {
    agentStatus,
    isRvtoolsMode,
    refetch: refetchAgentStatus,
  } = useAgentStatus();

  useEffect(() => {
    document.title = "Migration Advisor";
  }, []);

  return (
    <Backdrop style={{ overflow: "auto" }}>
      <Bullseye style={{ height: "100vh", padding: "1rem" }}>
        {agentStatus === null ? (
          // Avoid flashing the vCenter form before the mode is known.
          <Spinner size="xl" aria-label="Loading agent status" />
        ) : isRvtoolsMode ? (
          <RvtoolsLoginModal refetchAgentStatus={refetchAgentStatus} />
        ) : (
          <VCenterLoginModal
            refetchAgentStatus={refetchAgentStatus}
            isDataShared={agentStatus.mode === AgentModeRequestModeEnum.Connected}
          />
        )}
      </Bullseye>
    </Backdrop>
  );
};

AgentLoginPage.displayName = "AgentLoginPage";

export default AgentLoginPage;
