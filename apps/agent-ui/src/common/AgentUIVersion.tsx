import type React from "react";
import { useAgentStatus } from "./AgentStatusContext";

export const AgentUIVersion: React.FC = () => {
  const { agentStatus, isRvtoolsMode, error } = useAgentStatus();

  if (error) {
    return (
      <div data-testid="agent-api-lib-version" hidden>
        Error: {error}
      </div>
    );
  }

  if (!agentStatus) {
    return (
      <div data-testid="agent-api-lib-version" hidden>
        Loading...
      </div>
    );
  }

  // In RVTools mode there is no console connection to report on — no
  // network path to console.redhat.com exists in this mode, so omit the
  // field entirely rather than showing a misleading "unknown" status.
  if (isRvtoolsMode) {
    return (
      <div data-testid="agent-api-lib-version" hidden>
        Agent: {agentStatus.mode}
      </div>
    );
  }

  return (
    <div data-testid="agent-api-lib-version" hidden>
      Agent: {agentStatus.mode} - Connection:{" "}
      {agentStatus.consoleConnection?.status ?? "unknown"}
    </div>
  );
};
