import type React from "react";
import { Navigate } from "react-router-dom";
import { useAgentStatus } from "../common/AgentStatusContext";

interface ProtectedToolRouteProps {
  children: React.ReactNode;
}

/**
 * Guards vCenter/console-only tool routes (storage offload estimator, report
 * comparison) that the backend hard-501s in RVTools mode. Hiding the nav
 * item (`ReportLayout`) isn't sufficient on its own since a user can still
 * navigate to the URL directly — redirect defensively, consistent with the
 * existing `ProtectedReportRoute` gating pattern.
 */
export const ProtectedToolRoute: React.FC<ProtectedToolRouteProps> = ({
  children,
}) => {
  const { isRvtoolsMode, loading } = useAgentStatus();

  if (loading) {
    return null;
  }

  if (isRvtoolsMode) {
    return <Navigate to="/report/vms-overview" replace />;
  }

  return <>{children}</>;
};

ProtectedToolRoute.displayName = "ProtectedToolRoute";
