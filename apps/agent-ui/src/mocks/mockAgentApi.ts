/**
 * Mock implementation of `AgentApiClient` used when `VITE_MOCK_API=true`.
 *
 * Only the methods actually called by the UI (see the exhaustive `agentApi.*`
 * survey done while building this mock) are implemented directly. Any other
 * method is wrapped in a `Proxy` that throws a clear error if ever invoked,
 * rather than silently failing with "not a function".
 */
import type {
  AgentModeRequestModeEnum,
  ApplicationListResponse,
  BatchUpdateExclusionRequest,
  CapabilityStatus,
  CollectionComparisonDiff,
  CollectionComparisonSummary,
  CollectionListResponse,
  CollectorStatus,
  CreateGroupRequest,
  CredentialStatus,
  DeleteLabelGloballyResponse,
  Group,
  GroupListResponse,
  GroupResponse,
  InspectorStatus,
  Inventory,
  RightsizingClusterResponse,
  StartInspectionRequest,
  UpdateGroupRequest,
  UpdateLabelVMsRequest,
  VcenterCredentials,
  VddkProperties,
  VersionInfo,
  VirtualMachineDetail,
  VirtualMachineListResponse,
  VirtualMachineUpdateRequest,
  VMFilterOptionsResponse,
  VMLabelsResponse,
  VmUtilizationDetails,
} from "@openshift-migration-advisor/agent-sdk";
import type { AgentApiClient } from "../common/agentApi";
import { toApiVmDetail } from "./converters";
import { delay } from "./delay";
import { store } from "./store";

function notFound(message: string): never {
  const error = new Error(message);
  error.name = "MockNotFoundError";
  throw error;
}

function apiResponse<T>(value: T): { raw: Response; value: () => Promise<T> } {
  return { raw: new Response(null, { status: 200 }), value: async () => value };
}

const impl = {
  // ----- AgentApi -----
  async getAgentStatus() {
    return store.agentStatus;
  },
  async setAgentMode(params: {
    agentModeRequest: { mode: AgentModeRequestModeEnum };
  }) {
    return store.setAgentMode(params.agentModeRequest.mode);
  },

  // ----- ApplicationsApi -----
  async listApplications(params: {
    id: string;
  }): Promise<ApplicationListResponse> {
    return { applications: store.getApplications(params.id) };
  },

  // ----- CollectionsApi -----
  async listCollections(): Promise<CollectionListResponse> {
    return { collections: store.listCollections() };
  },
  async compareCollections(params: {
    aId: string;
    bId: string;
  }): Promise<CollectionComparisonSummary> {
    return store.compareCollections(
      params.aId,
      params.bId,
    ) as unknown as CollectionComparisonSummary;
  },
  async compareCollectionsDiff(params: {
    aId: string;
    bId: string;
    dimension: "total" | "migratable" | "non-migratable";
    page?: number;
    pageSize?: number;
  }): Promise<CollectionComparisonDiff> {
    return store.compareCollectionsDiff(
      params.aId,
      params.bId,
      params.dimension,
      params.page,
      params.pageSize,
    ) as unknown as CollectionComparisonDiff;
  },
  async exportCollection(params: {
    id: string;
    scope?: string;
  }): Promise<Blob> {
    return store.buildExportBlob(params.id, params.scope);
  },
  async exportCollectionRaw(params: { id: string; scope?: string }) {
    return apiResponse(store.buildExportBlob(params.id, params.scope));
  },

  // ----- CollectorApi -----
  async getCollectorStatus(): Promise<CollectorStatus> {
    return store.getCollectorStatusPayload();
  },
  async startCollector(): Promise<CollectorStatus> {
    return { status: store.startCollector() };
  },
  async stopCollector(): Promise<void> {
    store.stopCollector();
  },
  async startRvtoolsCollector(params: {
    files: Array<Blob>;
  }): Promise<CollectorStatus> {
    if (!params.files || params.files.length === 0) {
      const error = new Error("at least one file is required");
      error.name = "MockBadRequestError";
      throw error;
    }
    return { status: store.startRvtoolsCollector() };
  },

  // ----- CredentialsApi -----
  async getCredentials(): Promise<CredentialStatus> {
    if (!store.credentialStatus) {
      notFound("No vCenter credentials configured.");
    }
    return store.credentialStatus;
  },
  async getCredentialCapabilities(): Promise<CapabilityStatus> {
    return { capabilities: store.capabilities };
  },
  async putCredentials(params: {
    vcenterCredentials: VcenterCredentials;
  }): Promise<CredentialStatus> {
    return store.putCredentials(
      params.vcenterCredentials.url,
      params.vcenterCredentials.username,
    );
  },
  async deleteCredentials(): Promise<void> {
    store.deleteCredentials();
  },

  // ----- GroupsApi -----
  async createLatestGroup(params: {
    createGroupRequest: CreateGroupRequest;
  }): Promise<Group> {
    const { name, description, filter } = params.createGroupRequest;
    return store.createGroup(name, filter, description);
  },
  async deleteLatestGroup(params: { groupId: string }): Promise<void> {
    store.deleteGroup(params.groupId);
  },
  async getLatestGroup(params: {
    groupId: string;
    page?: number;
    pageSize?: number;
  }): Promise<GroupResponse> {
    const result = store.getGroup(params.groupId, {
      page: params.page,
      pageSize: params.pageSize,
    });
    if (!result) notFound(`Group ${params.groupId} not found.`);
    return result;
  },
  async getGroup(params: {
    id: string;
    groupId: string;
    page?: number;
    pageSize?: number;
  }): Promise<GroupResponse> {
    const result = store.getGroup(params.groupId, {
      page: params.page,
      pageSize: params.pageSize,
    });
    if (!result) notFound(`Group ${params.groupId} not found.`);
    return result;
  },
  async listLatestGroups(params: {
    byName?: string;
    page?: number;
    pageSize?: number;
  }): Promise<GroupListResponse> {
    return store.listGroups(params);
  },
  async listGroups(params: {
    id: string;
    byName?: string;
    page?: number;
    pageSize?: number;
  }): Promise<GroupListResponse> {
    return store.listGroups(params);
  },
  async updateLatestGroup(params: {
    groupId: string;
    updateGroupRequest: UpdateGroupRequest;
  }): Promise<Group> {
    const result = store.updateGroup(params.groupId, params.updateGroupRequest);
    if (!result) notFound(`Group ${params.groupId} not found.`);
    return result;
  },

  // ----- InspectorApi -----
  async getInspectorStatus(params?: {
    includeVddk?: boolean;
  }): Promise<InspectorStatus> {
    return store.getInspectorStatus(params?.includeVddk);
  },
  async getInspectorVddkStatus(): Promise<VddkProperties> {
    if (!store.vddk) notFound("No VDDK uploaded.");
    return store.vddk;
  },
  async putInspectorVddk(params: { file: Blob }): Promise<VddkProperties> {
    return store.putInspectorVddk(params.file.size);
  },
  async startInspection(params: {
    startInspectionRequest: StartInspectionRequest;
  }): Promise<InspectorStatus> {
    return store.startInspection(params.startInspectionRequest.vmIds);
  },
  async stopInspection(): Promise<InspectorStatus> {
    return store.stopInspection();
  },

  // ----- InventoriesApi -----
  async getLatestInventory(): Promise<Inventory> {
    return {
      inventory: {
        agentId: "mock-agent",
        inventory: store.getInventoryForCollection(undefined),
      },
    } as unknown as Inventory;
  },
  async getInventory(params: { id: string }): Promise<Inventory> {
    return {
      inventory: {
        agentId: "mock-agent",
        inventory: store.getInventoryForCollection(params.id),
      },
    } as unknown as Inventory;
  },

  // ----- RightsizingApi -----
  async getClusterUtilization(params: {
    id: string;
    clusterId: string;
  }): Promise<RightsizingClusterResponse> {
    return {
      report_id: params.id,
      cluster: store.getClusterUtilization(params.id, params.clusterId),
    } as unknown as RightsizingClusterResponse;
  },
  async getLatestVMUtilization(params: {
    vmId: string;
  }): Promise<VmUtilizationDetails> {
    const vm = store.getVmById(params.vmId);
    if (!vm?.utilization)
      notFound(`No utilization data for VM ${params.vmId}.`);
    return {
      moid: vm.id,
      vm_name: vm.name,
      provisioned_cpus: vm.cpuCount,
      provisioned_memory_mb: vm.memoryMB,
      provisioned_disk_kb: vm.diskSizeMB * 1024,
      ...vm.utilization,
    };
  },

  // ----- VersionApi -----
  async getVersion(): Promise<VersionInfo> {
    return {
      version: "2.0.0-mock",
      gitCommit: "0000000",
      uiGitCommit: "0000000",
    };
  },

  // ----- VirtualMachinesApi -----
  async batchUpdateLatestVMExclusion(params: {
    batchUpdateExclusionRequest: BatchUpdateExclusionRequest;
  }): Promise<void> {
    store.batchUpdateExclusion(
      params.batchUpdateExclusionRequest.vmIds,
      params.batchUpdateExclusionRequest.migrationExcluded,
    );
  },
  async deleteLatestLabelGlobally(params: {
    label: string;
  }): Promise<DeleteLabelGloballyResponse> {
    return store.deleteLabelGlobally(params.label);
  },
  async getLatestVMFilterOptions(): Promise<VMFilterOptionsResponse> {
    return store.getFilterOptions();
  },
  async getVMFilterOptions(): Promise<VMFilterOptionsResponse> {
    return store.getFilterOptions();
  },
  async getLatestVMLabels(): Promise<VMLabelsResponse> {
    return store.getLabelsResponse();
  },
  async getVMLabels(): Promise<VMLabelsResponse> {
    return store.getLabelsResponse();
  },
  async getLatestVirtualMachine(params: {
    vmId: string;
  }): Promise<VirtualMachineDetail> {
    const vm = store.getVmById(params.vmId);
    if (!vm) notFound(`VirtualMachine ${params.vmId} not found.`);
    return toApiVmDetail(vm);
  },
  async getVirtualMachine(params: {
    id: string;
    vmId: string;
  }): Promise<VirtualMachineDetail> {
    const vm = store.getVmByIdForCollection(params.id, params.vmId);
    if (!vm)
      notFound(
        `VirtualMachine ${params.vmId} not found in collection ${params.id}.`,
      );
    return toApiVmDetail(vm);
  },
  async listLatestVirtualMachines(params?: {
    byExpression?: string;
    sort?: string[];
    page?: number;
    pageSize?: number;
  }): Promise<VirtualMachineListResponse> {
    return store.listVms({ ...params });
  },
  async listVirtualMachines(params: {
    id: string;
    byExpression?: string;
    sort?: string[];
    page?: number;
    pageSize?: number;
  }): Promise<VirtualMachineListResponse> {
    return store.listVms({ collectionId: params.id, ...params });
  },
  async updateLatestLabelVMs(params: {
    label: string;
    updateLabelVMsRequest: UpdateLabelVMsRequest;
  }): Promise<void> {
    store.updateLabelVMs(
      params.label,
      params.updateLabelVMsRequest.add,
      params.updateLabelVMsRequest.remove,
    );
  },
  async updateLatestVirtualMachine(params: {
    vmId: string;
    virtualMachineUpdateRequest: VirtualMachineUpdateRequest;
  }): Promise<void> {
    store.updateVm(params.vmId, params.virtualMachineUpdateRequest);
  },
};

/**
 * Wraps `impl` so any AgentApiClient method not explicitly mocked fails loudly instead of
 * silently, and every implemented call is delayed to simulate real network latency (so the
 * UI's loading states, spinners, and skeletons can be exercised).
 */
export function createMockAgentApi(): AgentApiClient {
  const handler: ProxyHandler<typeof impl> = {
    get(target, prop, receiver) {
      if (prop in target) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === "function") {
          return async (...args: unknown[]) => {
            await delay();
            return value(...args);
          };
        }
        return value;
      }
      if (prop === "configuration") {
        return { basePath: `${window.location.origin}/agent/api/v2` };
      }
      if (typeof prop === "string") {
        return async () => {
          await delay();
          throw new Error(
            `[mock-agent-api] "${prop}" is not implemented in mock mode.`,
          );
        };
      }
      return undefined;
    },
  };
  return new Proxy(impl, handler) as unknown as AgentApiClient;
}
