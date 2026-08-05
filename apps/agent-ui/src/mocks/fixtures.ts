/**
 * Generates the full standalone mock dataset: 1200 VMs spread across 2200 clusters
 * in 48 datacenters, plus every aggregate the dashboard/report pages read.
 * Generation is deterministic (seeded PRNG) and computed once per page load.
 */
import type {
  ClusterFeatures,
  ClusterUtilization,
  Host,
  Inventory1,
  InventoryData,
  VMFilterOptionsResponse,
} from "@openshift-migration-advisor/agent-sdk";
import { computeInfraAggregate, computeVMsAggregate } from "./aggregation";
import {
  buildDatacenterNames,
  CLUSTER_COUNT,
  HOST_VENDOR_MODELS,
  VM_COUNT,
} from "./catalogs";
import {
  chance,
  mulberry32,
  pad,
  pick,
  pickWeighted,
  type Rng,
  randomFloat,
  randomInt,
  shuffle,
} from "./random";
import type { MockClusterInfo, MockVm } from "./types";
import { buildVm } from "./vmFactory";

const BASE_SEED = 0x5eed1234;
const POPULATED_CLUSTER_COUNT = 320;

function buildClusterCatalog(
  rng: Rng,
  datacenters: string[],
): { clusters: MockClusterInfo[]; clustersPerDatacenter: number[] } {
  const weights = datacenters.map(() => randomFloat(rng, 0.6, 1.4));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const counts = weights.map((w) =>
    Math.max(1, Math.round((w / totalWeight) * CLUSTER_COUNT)),
  );

  let diff = CLUSTER_COUNT - counts.reduce((a, b) => a + b, 0);
  let cursor = 0;
  while (diff !== 0) {
    counts[cursor % counts.length] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
    cursor++;
  }

  const drsModes = [
    "Fully Automated",
    "Partially Automated",
    "Manual",
    "None",
  ] as const;
  const clusters: MockClusterInfo[] = [];
  let globalIdx = 0;
  datacenters.forEach((dc, dcIdx) => {
    for (let c = 0; c < counts[dcIdx]; c++) {
      clusters.push({
        name: `${dc}-CL${pad(c + 1, 4)}`,
        datacenter: dc,
        drsEnabled: chance(rng, 0.7),
        drsMode: pickWeighted(rng, drsModes, [45, 25, 20, 10]),
        storageDrsEnabled: chance(rng, 0.35),
        cpuOverCommitment: Number(randomFloat(rng, 0.8, 4.5).toFixed(2)),
        memoryOverCommitment: Number(randomFloat(rng, 0.7, 2.2).toFixed(2)),
      });
      globalIdx++;
    }
  });
  void globalIdx;

  return { clusters, clustersPerDatacenter: counts };
}

function assignVmsToClusters(
  rng: Rng,
  populatedClusters: MockClusterInfo[],
): string[] {
  const weights = populatedClusters.map((_, i) => 1 / (i + 1) ** 0.85);
  const assignments: string[] = [];
  for (let i = 0; i < VM_COUNT; i++) {
    assignments.push(pickWeighted(rng, populatedClusters, weights).name);
  }
  return assignments;
}

function buildHostsForCluster(
  rng: Rng,
  vmCount: number,
  hostIdSeed: { current: number },
): Host[] {
  const hostCount = Math.max(1, Math.min(6, Math.ceil(vmCount / 6)));
  return Array.from({ length: hostCount }, () => {
    const vendorModel =
      HOST_VENDOR_MODELS[randomInt(rng, 0, HOST_VENDOR_MODELS.length - 1)];
    const cpuSockets = pickWeighted(rng, [1, 2, 4], [10, 75, 15]);
    const coresPerSocket = pickWeighted(rng, [8, 16, 24, 32], [20, 40, 25, 15]);
    hostIdSeed.current += 1;
    return {
      id: `host-${hostIdSeed.current}`,
      vendor: vendorModel.vendor,
      model: vendorModel.model,
      cpuCores: cpuSockets * coresPerSocket,
      cpuSockets,
      memoryMB: pickWeighted(
        rng,
        [131072, 262144, 524288, 1048576],
        [15, 40, 35, 10],
      ),
    };
  });
}

function averageClusterUtilization(
  vms: MockVm[],
): ClusterUtilization | undefined {
  const withUtilization = vms.filter((vm) => vm.utilization);
  if (withUtilization.length === 0) return undefined;

  const avg = (
    selector: (u: NonNullable<MockVm["utilization"]>) => number,
  ): number =>
    Number(
      (
        withUtilization.reduce(
          (sum, vm) => sum + selector(vm.utilization!),
          0,
        ) / withUtilization.length
      ).toFixed(1),
    );

  return {
    cpu_avg: avg((u) => u.cpu_avg),
    cpu_p95: avg((u) => u.cpu_p95),
    cpu_max: avg((u) => u.cpu_max),
    mem_avg: avg((u) => u.mem_avg),
    mem_p95: avg((u) => u.mem_p95),
    mem_max: avg((u) => u.mem_max),
    confidence: avg((u) => u.confidence),
  };
}

export interface GeneratedFixtures {
  vms: MockVm[];
  vmById: Map<string, MockVm>;
  datacenters: string[];
  clusters: MockClusterInfo[];
  clusterByName: Map<string, MockClusterInfo>;
  clustersPerDatacenter: number[];
  populatedClusterInventory: Record<string, InventoryData>;
  populatedClusterFeatures: Record<string, ClusterFeatures>;
  allHosts: Host[];
  inventory: Inventory1;
  filterOptions: VMFilterOptionsResponse;
}

function generate(): GeneratedFixtures {
  const rng = mulberry32(BASE_SEED);

  const datacenters = buildDatacenterNames();
  const { clusters, clustersPerDatacenter } = buildClusterCatalog(
    rng,
    datacenters,
  );
  const clusterByName = new Map(clusters.map((c) => [c.name, c]));

  const populatedClusters = shuffle(rng, clusters).slice(
    0,
    Math.min(POPULATED_CLUSTER_COUNT, clusters.length),
  );
  const clusterForVmIndex = assignVmsToClusters(rng, populatedClusters);

  const vmCountByCluster = new Map<string, number>();
  for (const clusterName of clusterForVmIndex) {
    vmCountByCluster.set(
      clusterName,
      (vmCountByCluster.get(clusterName) ?? 0) + 1,
    );
  }

  const hostIdSeed = { current: 0 };
  const hostsByCluster = new Map<string, Host[]>();
  for (const [clusterName, count] of vmCountByCluster) {
    hostsByCluster.set(
      clusterName,
      buildHostsForCluster(rng, count, hostIdSeed),
    );
  }

  const vms: MockVm[] = [];
  for (let i = 0; i < VM_COUNT; i++) {
    const clusterName = clusterForVmIndex[i];
    const clusterInfo = clusterByName.get(clusterName)!;
    const hostsForCluster = hostsByCluster.get(clusterName) ?? [];
    const host =
      hostsForCluster.length > 0 ? pick(rng, hostsForCluster) : undefined;
    vms.push(
      buildVm({
        index: i + 1,
        cluster: clusterName,
        datacenter: clusterInfo.datacenter,
        hostName: host?.id ?? `host-orphan-${i}`,
        seed: BASE_SEED + i * 7919 + 13,
      }),
    );
  }

  const vmsByCluster = new Map<string, MockVm[]>();
  for (const vm of vms) {
    const list = vmsByCluster.get(vm.cluster) ?? [];
    list.push(vm);
    vmsByCluster.set(vm.cluster, list);
  }

  const populatedClusterInventory: Record<string, InventoryData> = {};
  const populatedClusterFeatures: Record<string, ClusterFeatures> = {};
  for (const [clusterName, clusterVms] of vmsByCluster) {
    const clusterInfo = clusterByName.get(clusterName)!;
    const clusterHosts = hostsByCluster.get(clusterName) ?? [];
    const clusterFeatures: ClusterFeatures = {
      drsEnabled: clusterInfo.drsEnabled,
      drsMode: clusterInfo.drsMode,
      storageDrsEnabled: clusterInfo.storageDrsEnabled,
    };
    populatedClusterFeatures[clusterName] = clusterFeatures;
    populatedClusterInventory[clusterName] = {
      vcenter: { id: "vcenter-01" },
      clusterFeatures,
      clusterUtilization: averageClusterUtilization(clusterVms),
      vms: computeVMsAggregate(clusterVms),
      infra: computeInfraAggregate(clusterVms, {
        hosts: clusterHosts,
        cpuOverCommitment: clusterInfo.cpuOverCommitment,
        memoryOverCommitment: clusterInfo.memoryOverCommitment,
      }),
    };
  }

  const allHosts = [...hostsByCluster.values()].flat();
  const globalVms = computeVMsAggregate(vms);
  const globalInfra = computeInfraAggregate(vms, {
    hosts: allHosts,
    clustersPerDatacenter,
    totalDatacenters: datacenters.length,
    totalClusters: CLUSTER_COUNT,
  });

  const inventory: Inventory1 = {
    vcenter_id: "vcenter-01",
    vcenter_version: "8.0.3.0",
    clusters: populatedClusterInventory,
    vcenter: {
      vcenter: { id: "vcenter-01" },
      clusterUtilization: averageClusterUtilization(vms),
      vms: globalVms,
      infra: globalInfra,
    },
  };

  const concernLabels = new Set<string>();
  const concernCategories = new Set<string>();
  const applications = new Set<string>();
  for (const vm of vms) {
    for (const issue of vm.issues) {
      concernLabels.add(issue.label);
      concernCategories.add(issue.category);
    }
    for (const app of vm.applications) applications.add(app);
  }

  const filterOptions: VMFilterOptionsResponse = {
    clusters: [...vmsByCluster.keys()].sort(),
    datacenters: [...datacenters].sort(),
    concernLabels: [...concernLabels].sort(),
    concernCategories: [...concernCategories].sort(),
    applications: [...applications].sort(),
  };

  return {
    vms,
    vmById: new Map(vms.map((vm) => [vm.id, vm])),
    datacenters,
    clusters,
    clusterByName,
    clustersPerDatacenter,
    populatedClusterInventory,
    populatedClusterFeatures,
    allHosts,
    inventory,
    filterOptions,
  };
}

let cached: GeneratedFixtures | null = null;

/** Lazily generates (and memoizes) the mock dataset for the lifetime of the page. */
export function getFixtures(): GeneratedFixtures {
  if (!cached) {
    cached = generate();
  }
  return cached;
}
