/** Internal mock data-model types (superset of VirtualMachine + VirtualMachineDetail). */
import type {
  InspectionStatusStateEnum,
  VirtualMachineDevice,
  VirtualMachineDisk,
  VirtualMachineInspectionConcern,
  VirtualMachineIssue,
  VirtualMachineNIC,
} from "@openshift-migration-advisor/agent-sdk";

export interface MockVm {
  id: string;
  name: string;
  vCenterID: string;
  cluster: string;
  datacenter: string;

  uuid: string;
  firmware: string;
  powerState: "poweredOn" | "poweredOff" | "suspended";
  connectionState: "connected" | "disconnected" | "orphaned" | "inaccessible";
  host: string;
  folder: string;
  cpuCount: number;
  coresPerSocket: number;
  memoryMB: number;
  guestName: string;
  guestId: string;
  hostName: string;
  ipAddress: string;
  storageUsed: number;
  template: boolean;
  faultToleranceEnabled: boolean;
  nestedHVEnabled: boolean;
  toolsStatus: string;
  toolsRunningStatus: string;

  disks: VirtualMachineDisk[];
  nics: VirtualMachineNIC[];
  devices: VirtualMachineDevice[];
  issues: VirtualMachineIssue[];
  processes: Array<{ name: string; version?: string }>;
  applications: string[];
  networks: string[];

  diskSizeMB: number;
  migratable: boolean;

  /** Mutable user state. */
  labels: string[];
  migrationExcluded: boolean;
  groups: string[];

  utilization?: {
    cpu_avg: number;
    cpu_p95: number;
    cpu_max: number;
    cpu_latest: number;
    mem_avg: number;
    mem_p95: number;
    mem_max: number;
    mem_latest: number;
    disk: number;
    confidence: number;
  };

  inspectionState: InspectionStatusStateEnum | null;
  inspectionConcerns: VirtualMachineInspectionConcern[] | null;
}

export interface MockClusterInfo {
  name: string;
  datacenter: string;
  drsEnabled: boolean;
  drsMode: "Fully Automated" | "Partially Automated" | "Manual" | "None";
  storageDrsEnabled: boolean;
  cpuOverCommitment: number;
  memoryOverCommitment: number;
}

export interface MockGroup {
  id: string;
  name: string;
  description?: string;
  filter: string;
  createdAt: Date;
  updatedAt: Date;
}
