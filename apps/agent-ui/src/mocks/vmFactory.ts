/** Builds a single, fully-populated mock VM record. */
import type {
  VirtualMachineDevice,
  VirtualMachineDisk,
  VirtualMachineIssue,
  VirtualMachineNIC,
} from "@openshift-migration-advisor/agent-sdk";
import {
  APPLICATION_CATALOG,
  CPU_COUNT_WEIGHTS,
  DISK_BUS_TYPES,
  ISSUE_CATALOG,
  LABEL_CATALOG,
  MEMORY_MB_WEIGHTS,
  NETWORK_CATALOG,
  NIC_COUNT_WEIGHTS,
  OS_CATALOG,
  OS_CATALOG_WEIGHTS,
} from "./catalogs";
import {
  chance,
  fakeMoRef,
  mulberry32,
  pad,
  pick,
  pickN,
  pickWeighted,
  type Rng,
  randomFloat,
  randomInt,
} from "./random";
import type { MockVm } from "./types";

const ROLE_PREFIXES = [
  "web",
  "app",
  "db",
  "api",
  "cache",
  "lb",
  "proxy",
  "mail",
  "dns",
  "auth",
  "batch",
  "worker",
  "queue",
  "search",
  "log",
  "monitor",
  "backup",
  "file",
  "vdi",
  "build",
  "test",
  "jump",
  "ad",
  "dc",
  "sql",
  "nas",
  "cdn",
  "gw",
];

const ENV_SUFFIXES = ["prod", "stage", "dev", "qa", "uat", "dr"];

function buildVmName(rng: Rng, index: number): string {
  const role = pick(rng, ROLE_PREFIXES);
  const env = pick(rng, ENV_SUFFIXES);
  return `${role}-${env}-${pad(index, 4)}`;
}

function buildDisks(rng: Rng): {
  disks: VirtualMachineDisk[];
  totalMB: number;
} {
  const diskCount = pickWeighted(rng, [1, 2, 3, 4, 5], [35, 30, 20, 10, 5]);
  const disks: VirtualMachineDisk[] = [];
  let totalMB = 0;

  for (let i = 0; i < diskCount; i++) {
    const isSystemDisk = i === 0;
    const sizeGB = isSystemDisk
      ? pickWeighted(rng, [40, 60, 80, 100], [30, 35, 25, 10])
      : pickWeighted(
          rng,
          [50, 100, 250, 500, 1024, 2048, 4096],
          [20, 25, 20, 15, 10, 6, 4],
        );
    const capacityBytes = sizeGB * 1024 * 1024 * 1024;
    totalMB += sizeGB * 1024;
    disks.push({
      key: 2000 + i,
      file: `[datastore${randomInt(rng, 1, 8)}] disk-${i}.vmdk`,
      capacity: capacityBytes,
      shared: chance(rng, 0.03),
      rdm: chance(rng, 0.02),
      bus: pick(rng, DISK_BUS_TYPES),
      mode: chance(rng, 0.05) ? "independent_persistent" : "persistent",
    });
  }

  return { disks, totalMB };
}

function buildNics(rng: Rng): {
  nics: VirtualMachineNIC[];
  networks: string[];
} {
  const count = pickWeighted(
    rng,
    NIC_COUNT_WEIGHTS.map((w) => w.count),
    NIC_COUNT_WEIGHTS.map((w) => w.weight),
  );
  const chosenNetworks = pickN(rng, NETWORK_CATALOG, count);
  const hexByte = (): string =>
    randomInt(rng, 0, 255).toString(16).padStart(2, "0");
  const nics: VirtualMachineNIC[] = chosenNetworks.map((net, i) => ({
    mac: `00:50:56:${hexByte()}:${hexByte()}:${hexByte()}`,
    network: net.name,
    index: i,
  }));
  return { nics, networks: chosenNetworks.map((n) => n.name) };
}

function buildDevices(rng: Rng): VirtualMachineDevice[] {
  const devices: VirtualMachineDevice[] = [];
  if (chance(rng, 0.15)) devices.push({ kind: "cdrom" });
  if (chance(rng, 0.03)) devices.push({ kind: "usb" });
  if (chance(rng, 0.02)) devices.push({ kind: "serial" });
  if (chance(rng, 0.01)) devices.push({ kind: "parallel" });
  return devices;
}

function buildProcessesAndApps(rng: Rng): {
  processes: Array<{ name: string; version?: string }>;
  applications: string[];
} {
  const appCount = pickWeighted(rng, [0, 1, 2, 3], [25, 45, 22, 8]);
  const chosen = pickN(rng, APPLICATION_CATALOG, appCount);
  const processes = chosen.flatMap((app) => app.processes);
  return { processes, applications: chosen.map((app) => app.name) };
}

function buildIssues(
  rng: Rng,
  isOsSupported: boolean,
  guestName: string,
  hasSharedDisk: boolean,
  hasCdrom: boolean,
  hasUsb: boolean,
  hasSerialOrParallel: boolean,
  cpuCount: number,
  totalDiskMB: number,
  isTemplate: boolean,
  isPoweredOff: boolean,
): VirtualMachineIssue[] {
  const issues: VirtualMachineIssue[] = [];

  if (!isOsSupported) {
    issues.push({
      label: "Unsupported guest OS",
      category: "Critical",
      description: `The guest operating system "${guestName}" is not supported by the target migration platform.`,
    });
  }
  if (hasSharedDisk) {
    const entry = ISSUE_CATALOG.find((i) => i.label === "Shared disk (RDM)")!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }
  if (chance(rng, 0.02)) {
    const entry = ISSUE_CATALOG.find(
      (i) => i.label === "Fault tolerance enabled",
    )!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }
  if (hasCdrom) {
    const entry = ISSUE_CATALOG.find(
      (i) => i.label === "CD/DVD drive attached",
    )!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }
  if (chance(rng, 0.03)) {
    const entry = ISSUE_CATALOG.find(
      (i) => i.label === "Nested virtualization enabled",
    )!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }
  if (hasUsb) {
    const entry = ISSUE_CATALOG.find((i) => i.label === "USB device attached")!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }
  if (hasSerialOrParallel) {
    const entry = ISSUE_CATALOG.find(
      (i) => i.label === "Serial or parallel port configured",
    )!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }
  if (totalDiskMB > 2 * 1024 * 1024) {
    const entry = ISSUE_CATALOG.find(
      (i) => i.label === "Large disk capacity (>2TB)",
    )!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }
  if (cpuCount > 32) {
    const entry = ISSUE_CATALOG.find(
      (i) => i.label === "High vCPU count (>32)",
    )!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }
  if (chance(rng, 0.09)) {
    const entry = ISSUE_CATALOG.find(
      (i) => i.label === "Missing VMware Tools",
    )!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }
  if (chance(rng, 0.05)) {
    const entry = ISSUE_CATALOG.find(
      (i) => i.label === "Static MAC address configured",
    )!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }
  if (isPoweredOff) {
    const entry = ISSUE_CATALOG.find((i) => i.label === "Powered-off VM")!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }
  if (isTemplate) {
    const entry = ISSUE_CATALOG.find((i) => i.label === "Template VM")!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }
  if (chance(rng, 0.07)) {
    const entry = ISSUE_CATALOG.find((i) => i.label === "Snapshot present")!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }
  if (chance(rng, 0.04)) {
    const entry = ISSUE_CATALOG.find(
      (i) => i.label === "Unsupported network adapter type",
    )!;
    issues.push({
      label: entry.label,
      category: entry.category,
      description: entry.description,
    });
  }

  return issues;
}

export interface BuildVmOptions {
  index: number;
  cluster: string;
  datacenter: string;
  hostName: string;
  seed: number;
}

export function buildVm(options: BuildVmOptions): MockVm {
  const { index, cluster, datacenter, hostName, seed } = options;
  const rng = mulberry32(seed);

  const powerState = pickWeighted(
    rng,
    ["poweredOn", "poweredOff", "suspended"] as const,
    [85, 12, 3],
  );
  const isTemplate = chance(rng, 0.03);
  const osEntry = pickWeighted(rng, OS_CATALOG, OS_CATALOG_WEIGHTS);
  const cpuCount = pickWeighted(
    rng,
    CPU_COUNT_WEIGHTS.map((w) => w.count),
    CPU_COUNT_WEIGHTS.map((w) => w.weight),
  );
  const coresPerSocket = pick(rng, [1, 1, 1, 2, 2, 4]);
  const memoryMB = pickWeighted(
    rng,
    MEMORY_MB_WEIGHTS.map((w) => w.mb),
    MEMORY_MB_WEIGHTS.map((w) => w.weight),
  );

  const { disks, totalMB: diskSizeMB } = buildDisks(rng);
  const { nics, networks } = buildNics(rng);
  const devices = buildDevices(rng);
  const { processes, applications } = buildProcessesAndApps(rng);

  const hasCdrom = devices.some((d) => d.kind === "cdrom");
  const hasUsb = devices.some((d) => d.kind === "usb");
  const hasSerialOrParallel = devices.some(
    (d) => d.kind === "serial" || d.kind === "parallel",
  );
  const hasSharedDisk = disks.some((d) => d.shared);

  const issues = buildIssues(
    rng,
    osEntry.supported,
    osEntry.guestName,
    hasSharedDisk,
    hasCdrom,
    hasUsb,
    hasSerialOrParallel,
    cpuCount,
    diskSizeMB,
    isTemplate,
    powerState === "poweredOff",
  );

  const migratable = !issues.some((issue) => issue.category === "Critical");

  const hasUtilizationData = chance(rng, 0.9) && powerState === "poweredOn";
  const cpuAvg = randomFloat(rng, 2, 70);
  const memAvg = randomFloat(rng, 10, 85);

  const labelCount = pickWeighted(rng, [0, 1, 2, 3], [30, 35, 25, 10]);
  const labels = pickN(rng, LABEL_CATALOG, labelCount);

  const octet = () => randomInt(rng, 2, 254);

  return {
    id: fakeMoRef("vm", index),
    name: buildVmName(rng, index),
    vCenterID: "vcenter-01",
    cluster,
    datacenter,

    uuid: `${pad(index, 8)}-0000-0000-0000-${pad(index, 12)}`,
    firmware: chance(rng, 0.25) ? "efi" : "bios",
    powerState,
    connectionState: chance(rng, 0.985)
      ? "connected"
      : pick(rng, ["disconnected", "orphaned", "inaccessible"] as const),
    host: hostName,
    folder: `/Datacenters/${datacenter}/vm/${pick(rng, ["Production", "Development", "Infrastructure", "Discovered virtual machine"])}`,
    cpuCount,
    coresPerSocket,
    memoryMB,
    guestName: osEntry.guestName,
    guestId: osEntry.guestId,
    hostName: `${buildVmName(rng, index)}.corp.example.com`,
    ipAddress: `10.${randomInt(rng, 0, 200)}.${octet()}.${octet()}`,
    storageUsed: Math.round(
      diskSizeMB * 1024 * 1024 * randomFloat(rng, 0.35, 0.85),
    ),
    template: isTemplate,
    faultToleranceEnabled: issues.some(
      (i) => i.label === "Fault tolerance enabled",
    ),
    nestedHVEnabled: chance(rng, 0.03),
    toolsStatus: chance(rng, 0.9) ? "toolsOk" : "toolsNotInstalled",
    toolsRunningStatus:
      powerState === "poweredOn"
        ? chance(rng, 0.92)
          ? "guestToolsRunning"
          : "guestToolsNotRunning"
        : "guestToolsNotRunning",

    disks,
    nics,
    devices,
    issues,
    processes,
    applications,
    networks,

    diskSizeMB,
    migratable,

    labels,
    migrationExcluded: chance(rng, 0.04),
    groups: [],

    utilization: hasUtilizationData
      ? {
          cpu_avg: cpuAvg,
          cpu_p95: Math.min(100, cpuAvg + randomFloat(rng, 5, 25)),
          cpu_max: Math.min(100, cpuAvg + randomFloat(rng, 15, 40)),
          cpu_latest: Math.max(0, cpuAvg + randomFloat(rng, -10, 10)),
          mem_avg: memAvg,
          mem_p95: Math.min(100, memAvg + randomFloat(rng, 3, 12)),
          mem_max: Math.min(100, memAvg + randomFloat(rng, 8, 18)),
          mem_latest: Math.max(0, memAvg + randomFloat(rng, -8, 8)),
          disk: randomFloat(rng, 5, 90),
          confidence: randomFloat(rng, 70, 100),
        }
      : undefined,

    inspectionState: null,
    inspectionConcerns: null,
  };
}
