/** Computes VMs/Infra aggregate summaries (as returned by GET /inventory) from a VM list. */
import type {
  Datastore,
  DiskSizeTierSummary,
  DiskTypeSummary,
  Host,
  Infra,
  IssuesBreakdown,
  MigrationIssue,
  Network,
  OsInfo,
  VMResourceBreakdown,
  VMs,
} from "@openshift-migration-advisor/agent-sdk";
import {
  DATASTORE_CATALOG,
  ISSUE_CATALOG,
  NETWORK_CATALOG,
  OS_CATALOG,
} from "./catalogs";
import { mulberry32, pickWeighted, randomFloat, randomInt } from "./random";
import type { MockVm } from "./types";

function emptyBreakdown(): VMResourceBreakdown {
  return {
    total: 0,
    totalForMigratable: 0,
    totalForMigratableWithWarnings: 0,
    totalForNotMigratable: 0,
  };
}

function addToBreakdown(
  breakdown: VMResourceBreakdown,
  amount: number,
  vm: MockVm,
): void {
  breakdown.total += amount;
  if (vm.migratable) {
    breakdown.totalForMigratable += amount;
    if (vm.issues.length > 0) {
      breakdown.totalForMigratableWithWarnings += amount;
    }
  } else {
    breakdown.totalForNotMigratable += amount;
  }
}

function cpuTierFor(cpuCount: number): string {
  if (cpuCount <= 4) return "0-4";
  if (cpuCount <= 8) return "5-8";
  if (cpuCount <= 16) return "9-16";
  if (cpuCount <= 32) return "17-32";
  return "32+";
}

function memoryTierFor(memoryGB: number): string {
  if (memoryGB <= 4) return "0-4";
  if (memoryGB <= 16) return "5-16";
  if (memoryGB <= 32) return "17-32";
  if (memoryGB <= 64) return "33-64";
  if (memoryGB <= 128) return "65-128";
  if (memoryGB <= 256) return "129-256";
  return "256+";
}

function diskSizeTierFor(diskGB: number): string {
  if (diskGB < 100) return "0-100 GB";
  if (diskGB < 500) return "100-500 GB";
  if (diskGB < 1024) return "500 GB-1 TB";
  if (diskGB < 2048) return "1-2 TB";
  return "2+ TB";
}

function diskComplexityTierFor(diskGB: number): string {
  const tib = diskGB / 1024;
  if (tib < 10) return "0-10 TiB";
  if (tib < 20) return "10-20 TiB";
  if (tib < 50) return "20-50 TiB";
  return "50+ TiB";
}

function nicCountTierFor(count: number): string {
  if (count >= 4) return "4+";
  return String(count);
}

function complexityLevelFor(vm: MockVm): string {
  if (!vm.migratable) return "Unsupported";
  if (vm.issues.length === 0) return "Easy";
  if (vm.issues.length <= 2) return "Medium";
  if (vm.issues.length <= 4) return "Hard";
  return "WhiteGlove";
}

function bumpDiskSizeTier(
  map: Record<string, DiskSizeTierSummary>,
  key: string,
  sizeTB: number,
): void {
  const existing = map[key] ?? { totalSizeTB: 0, vmCount: 0 };
  existing.totalSizeTB += sizeTB;
  existing.vmCount += 1;
  map[key] = existing;
}

function bumpDiskType(
  map: Record<string, DiskTypeSummary>,
  key: string,
  sizeTB: number,
): void {
  const existing = map[key] ?? { totalSizeTB: 0, vmCount: 0 };
  existing.totalSizeTB += sizeTB;
  existing.vmCount += 1;
  map[key] = existing;
}

function buildMigrationIssues(
  vms: MockVm[],
  categories: string[],
): MigrationIssue[] {
  const counts = new Map<string, number>();
  for (const vm of vms) {
    for (const issue of vm.issues) {
      if (!categories.includes(issue.category)) continue;
      counts.set(issue.label, (counts.get(issue.label) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => {
      const catalogEntry = ISSUE_CATALOG.find((entry) => entry.label === label);
      return {
        id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label,
        assessment:
          catalogEntry?.assessment ??
          `${count} VM(s) are affected by "${label}".`,
        count,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export function computeVMsAggregate(vms: MockVm[]): VMs {
  const cpuCores = emptyBreakdown();
  const ramGB = emptyBreakdown();
  const diskGB = emptyBreakdown();
  const diskCount = emptyBreakdown();
  const nicCount = emptyBreakdown();

  const distributionByCpuTier: Record<string, number> = {};
  const distributionByMemoryTier: Record<string, number> = {};
  const distributionByNicCount: Record<string, number> = {};
  const diskSizeTier: Record<string, DiskSizeTierSummary> = {};
  const diskComplexityTier: Record<string, DiskSizeTierSummary> = {};
  const complexityDistribution: Record<string, DiskSizeTierSummary> = {};
  const diskTypes: Record<string, DiskTypeSummary> = {};
  const powerStates: Record<string, number> = {};
  const osInfo: Record<string, OsInfo> = {};

  let totalMigratable = 0;
  let totalMigratableWithWarnings = 0;
  let totalWithSharedDisks = 0;

  for (const vm of vms) {
    addToBreakdown(cpuCores, vm.cpuCount, vm);
    addToBreakdown(ramGB, vm.memoryMB / 1024, vm);
    addToBreakdown(diskGB, vm.diskSizeMB / 1024, vm);
    addToBreakdown(diskCount, vm.disks.length, vm);
    addToBreakdown(nicCount, vm.nics.length, vm);

    if (vm.migratable) {
      totalMigratable += 1;
      if (vm.issues.length > 0) totalMigratableWithWarnings += 1;
    }
    if (vm.disks.some((disk) => disk.shared)) totalWithSharedDisks += 1;

    const cpuTier = cpuTierFor(vm.cpuCount);
    distributionByCpuTier[cpuTier] = (distributionByCpuTier[cpuTier] ?? 0) + 1;

    const memTier = memoryTierFor(vm.memoryMB / 1024);
    distributionByMemoryTier[memTier] =
      (distributionByMemoryTier[memTier] ?? 0) + 1;

    const nicTier = nicCountTierFor(vm.nics.length);
    distributionByNicCount[nicTier] =
      (distributionByNicCount[nicTier] ?? 0) + 1;

    const diskGBTotal = vm.diskSizeMB / 1024;
    const diskTBTotal = diskGBTotal / 1024;
    bumpDiskSizeTier(diskSizeTier, diskSizeTierFor(diskGBTotal), diskTBTotal);
    bumpDiskSizeTier(
      diskComplexityTier,
      diskComplexityTierFor(diskGBTotal),
      diskTBTotal,
    );
    bumpDiskSizeTier(
      complexityDistribution,
      complexityLevelFor(vm),
      diskTBTotal,
    );

    for (const disk of vm.disks) {
      const busLabel = (disk.bus ?? "scsi").toUpperCase();
      const diskTB = (disk.capacity ?? 0) / 1024 / 1024 / 1024 / 1024;
      bumpDiskType(diskTypes, busLabel, diskTB);
    }

    powerStates[vm.powerState] = (powerStates[vm.powerState] ?? 0) + 1;

    const osEntry = OS_CATALOG.find(
      (entry) => entry.guestName === vm.guestName,
    );
    const existingOs = osInfo[vm.guestName];
    if (existingOs) {
      existingOs.count += 1;
    } else {
      osInfo[vm.guestName] = {
        count: 1,
        supported: osEntry?.supported ?? true,
        supportTier: osEntry?.supportTier,
        upgradeRecommendation: osEntry?.upgradeRecommendation,
      };
    }
  }

  const issuesBreakdown: IssuesBreakdown = {
    critical: 0,
    warning: 0,
    information: 0,
    advisory: 0,
    error: 0,
  };
  for (const vm of vms) {
    const categoriesPresent = new Set(vm.issues.map((issue) => issue.category));
    if (categoriesPresent.has("Critical")) issuesBreakdown.critical += 1;
    if (categoriesPresent.has("Warning")) issuesBreakdown.warning += 1;
    if (categoriesPresent.has("Information")) issuesBreakdown.information += 1;
    if (categoriesPresent.has("Advisory")) issuesBreakdown.advisory += 1;
    if (categoriesPresent.has("Error")) issuesBreakdown.error += 1;
  }

  return {
    total: vms.length,
    totalMigratable,
    totalMigratableWithWarnings,
    totalWithSharedDisks,
    cpuCores,
    diskSizeTier,
    diskComplexityTier,
    diskTypes,
    distributionByCpuTier,
    distributionByMemoryTier,
    distributionByNicCount,
    complexityDistribution,
    ramGB,
    diskGB,
    diskCount,
    nicCount,
    powerStates,
    osInfo,
    notMigratableReasons: buildMigrationIssues(vms, ["Critical"]),
    migrationWarnings: buildMigrationIssues(vms, [
      "Warning",
      "Advisory",
      "Information",
      "Error",
      "Other",
    ]),
    issuesBreakdown,
  };
}

export interface InfraBuildOptions {
  hosts: Host[];
  networks?: Network[];
  datastores?: Datastore[];
  clustersPerDatacenter?: number[];
  totalDatacenters?: number;
  totalClusters?: number;
  cpuOverCommitment?: number;
  memoryOverCommitment?: number;
}

export function computeInfraAggregate(
  vms: MockVm[],
  options: InfraBuildOptions,
): Infra {
  const hostPowerStates: Record<string, number> = {};
  for (const host of options.hosts) {
    hostPowerStates.poweredOn = (hostPowerStates.poweredOn ?? 0) + 1;
    void host;
  }

  const networkVmCounts = new Map<string, number>();
  for (const vm of vms) {
    for (const network of vm.networks) {
      networkVmCounts.set(network, (networkVmCounts.get(network) ?? 0) + 1);
    }
  }
  const networks: Network[] =
    options.networks ??
    NETWORK_CATALOG.map((net) => ({
      type: net.type,
      name: net.name,
      vlanId: net.vlanId,
      vmsCount: networkVmCounts.get(net.name) ?? 0,
    }));

  const totalAllocatedVcpu = vms.reduce((sum, vm) => sum + vm.cpuCount, 0);
  const totalPhysicalCores = options.hosts.reduce(
    (sum, host) => sum + (host.cpuCores ?? 0),
    0,
  );
  const totalAllocatedMemoryMB = vms.reduce((sum, vm) => sum + vm.memoryMB, 0);
  const totalPhysicalMemoryMB = options.hosts.reduce(
    (sum, host) => sum + (host.memoryMB ?? 0),
    0,
  );

  return {
    totalHosts: options.hosts.length,
    totalDatacenters: options.totalDatacenters,
    totalClusters: options.totalClusters,
    clustersPerDatacenter: options.clustersPerDatacenter,
    cpuOverCommitment:
      options.cpuOverCommitment ??
      (totalPhysicalCores > 0
        ? Number((totalAllocatedVcpu / totalPhysicalCores).toFixed(2))
        : undefined),
    memoryOverCommitment:
      options.memoryOverCommitment ??
      (totalPhysicalMemoryMB > 0
        ? Number((totalAllocatedMemoryMB / totalPhysicalMemoryMB).toFixed(2))
        : undefined),
    hosts: options.hosts,
    hostPowerStates,
    networks,
    datastores: options.datastores ?? buildDefaultDatastores(vms.length),
  };
}

function buildDefaultDatastores(vmCount: number): Datastore[] {
  const rng = mulberry32(777);
  const count = Math.max(4, Math.min(24, Math.round(vmCount / 60)));
  return Array.from({ length: count }, (_, i) => {
    const catalogEntry = DATASTORE_CATALOG[i % DATASTORE_CATALOG.length];
    const totalCapacityGB = pickWeighted(
      rng,
      [2048, 4096, 8192, 16384, 32768],
      [15, 30, 30, 18, 7],
    );
    const freeCapacityGB = Math.round(
      totalCapacityGB * randomFloat(rng, 0.1, 0.55),
    );
    return {
      type: catalogEntry.type,
      totalCapacityGB,
      freeCapacityGB,
      vendor: catalogEntry.vendor,
      diskId: `naa.${randomInt(rng, 1000000000, 9999999999)}`,
      hardwareAcceleratedMove: catalogEntry.type !== "NFS",
      protocolType: catalogEntry.protocolType,
      model: catalogEntry.model,
    };
  });
}
