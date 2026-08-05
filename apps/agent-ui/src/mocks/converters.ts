/** Converts internal MockVm records into the SDK's VirtualMachine / VirtualMachineDetail shapes. */
import type {
  InspectionStatus,
  VirtualMachine,
  VirtualMachineDetail,
  VmUtilizationDetails,
} from "@openshift-migration-advisor/agent-sdk";
import type { MockVm } from "./types";

export function toApiVm(vm: MockVm): VirtualMachine {
  const inspectionStatus: InspectionStatus | undefined = vm.inspectionState
    ? { state: vm.inspectionState }
    : undefined;

  return {
    name: vm.name,
    id: vm.id,
    vCenterID: vm.vCenterID,
    vCenterState: vm.powerState,
    cluster: vm.cluster,
    datacenter: vm.datacenter,
    diskSize: vm.diskSizeMB,
    memory: vm.memoryMB,
    issueCount: vm.issues.length,
    migratable: vm.migratable,
    template: vm.template,
    inspectionStatus,
    inspectionConcernCount: vm.inspectionConcerns?.length,
    migrationExcluded: vm.migrationExcluded,
    groups: vm.groups,
    labels: vm.labels,
    utilization_cpu_p95: vm.utilization?.cpu_p95,
    utilization_mem_p95: vm.utilization?.mem_p95,
    utilization_cpu_max: vm.utilization?.cpu_max,
    utilization_mem_max: vm.utilization?.mem_max,
    utilization_disk: vm.utilization?.disk,
    utilization_confidence: vm.utilization?.confidence,
  };
}

function toApiUtilization(vm: MockVm): VmUtilizationDetails | undefined {
  if (!vm.utilization) return undefined;
  return {
    moid: vm.id,
    vm_name: vm.name,
    provisioned_cpus: vm.cpuCount,
    provisioned_memory_mb: vm.memoryMB,
    provisioned_disk_kb: vm.diskSizeMB * 1024,
    cpu_avg: vm.utilization.cpu_avg,
    cpu_p95: vm.utilization.cpu_p95,
    cpu_max: vm.utilization.cpu_max,
    cpu_latest: vm.utilization.cpu_latest,
    mem_avg: vm.utilization.mem_avg,
    mem_p95: vm.utilization.mem_p95,
    mem_max: vm.utilization.mem_max,
    mem_latest: vm.utilization.mem_latest,
    disk: vm.utilization.disk,
    confidence: vm.utilization.confidence,
  };
}

export function toApiVmDetail(vm: MockVm): VirtualMachineDetail {
  return {
    id: vm.id,
    name: vm.name,
    vCenterID: vm.vCenterID,
    uuid: vm.uuid,
    firmware: vm.firmware,
    powerState: vm.powerState,
    connectionState: vm.connectionState,
    host: vm.host,
    datacenter: vm.datacenter,
    cluster: vm.cluster,
    folder: vm.folder,
    cpuCount: vm.cpuCount,
    coresPerSocket: vm.coresPerSocket,
    memoryMB: vm.memoryMB,
    guestName: vm.guestName,
    guestId: vm.guestId,
    hostName: vm.hostName,
    ipAddress: vm.ipAddress,
    storageUsed: vm.storageUsed,
    template: vm.template,
    migratable: vm.migratable,
    migrationExcluded: vm.migrationExcluded,
    labels: vm.labels,
    faultToleranceEnabled: vm.faultToleranceEnabled,
    nestedHVEnabled: vm.nestedHVEnabled,
    toolsStatus: vm.toolsStatus,
    toolsRunningStatus: vm.toolsRunningStatus,
    disks: vm.disks,
    nics: vm.nics,
    devices: vm.devices,
    guestNetworks: vm.nics
      .filter((nic) => nic.network)
      .map((nic) => ({
        device: `eth${nic.index ?? 0}`,
        mac: nic.mac,
        ip: vm.ipAddress,
        prefixLength: 24,
        network: nic.network,
      })),
    issues: vm.issues,
    inspection: vm.inspectionConcerns
      ? { concerns: vm.inspectionConcerns }
      : undefined,
    utilization: toApiUtilization(vm),
    processes: vm.processes,
  };
}
