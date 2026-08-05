/** In-memory, mutable runtime state for the mock agent API (singleton per page load). */
import type {
  AgentStatus,
  ApplicationOverview,
  CapabilityStatusCapabilities,
  Collection,
  CollectorStatusStatusEnum,
  CredentialStatus,
  DeleteLabelGloballyResponse,
  Group,
  GroupListResponse,
  GroupResponse,
  InspectorStatus,
  InspectorStatusStateEnum,
  VddkProperties,
  VirtualMachineListResponse,
  VMFilterOptionsResponse,
  VMLabelsResponse,
} from "@openshift-migration-advisor/agent-sdk";
import { computeInfraAggregate, computeVMsAggregate } from "./aggregation";
import { APPLICATION_CATALOG } from "./catalogs";
import { toApiVm } from "./converters";
import { filterVms, matchesExpression } from "./filterExpression";
import { getFixtures } from "./fixtures";
import { chance, mulberry32, randomInt } from "./random";
import type { MockGroup, MockVm } from "./types";

const LATEST_COLLECTION_ID = "collection-latest";
const BASELINE_COLLECTION_ID = "collection-baseline";

function deepCloneVm(vm: MockVm): MockVm {
  return {
    ...vm,
    disks: vm.disks.map((d) => ({ ...d })),
    nics: vm.nics.map((n) => ({ ...n })),
    devices: vm.devices.map((d) => ({ ...d })),
    issues: vm.issues.map((i) => ({ ...i })),
    processes: vm.processes.map((p) => ({ ...p })),
    applications: [...vm.applications],
    networks: [...vm.networks],
    labels: [...vm.labels],
    groups: [...vm.groups],
    utilization: vm.utilization ? { ...vm.utilization } : undefined,
    inspectionConcerns: vm.inspectionConcerns
      ? vm.inspectionConcerns.map((c) => ({ ...c }))
      : null,
  };
}

function buildBaselineVms(latestVms: MockVm[]): MockVm[] {
  const rng = mulberry32(0xba5e1173);
  // Simulate an older snapshot: ~9% of current VMs did not exist yet, and a
  // handful of currently-migratable VMs had an issue that has since been fixed.
  const baseline = latestVms.filter(() => !chance(rng, 0.09)).map(deepCloneVm);

  let flips = 0;
  for (const vm of baseline) {
    if (vm.migratable && chance(rng, 0.05) && flips < 60) {
      vm.migratable = false;
      vm.issues = [
        ...vm.issues,
        {
          label: "Snapshot present",
          category: "Critical",
          description:
            "This VM had an active snapshot at the time of the baseline scan.",
        },
      ];
      flips += 1;
    }
  }
  return baseline;
}

function paginate<T>(
  items: T[],
  page = 1,
  pageSize = 20,
): { items: T[]; total: number; page: number; pageCount: number } {
  const safePageSize = Math.max(1, pageSize);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * safePageSize;
  return {
    items: items.slice(start, start + safePageSize),
    total,
    page: safePage,
    pageCount,
  };
}

type SortableField = string;

function compareVms(a: MockVm, b: MockVm, field: SortableField): number {
  switch (field) {
    case "name":
      return a.name.localeCompare(b.name);
    case "vCenterState":
      return a.powerState.localeCompare(b.powerState);
    case "cluster":
      return a.cluster.localeCompare(b.cluster);
    case "diskSize":
      return a.diskSizeMB - b.diskSizeMB;
    case "memory":
      return a.memoryMB - b.memoryMB;
    case "issues":
      return a.issues.length - b.issues.length;
    case "cpuUsage":
      return (a.utilization?.cpu_max ?? -1) - (b.utilization?.cpu_max ?? -1);
    case "diskUsage":
      return (a.utilization?.disk ?? -1) - (b.utilization?.disk ?? -1);
    case "ramUsage":
      return (a.utilization?.mem_max ?? -1) - (b.utilization?.mem_max ?? -1);
    case "cpuAvg":
      return (a.utilization?.cpu_avg ?? -1) - (b.utilization?.cpu_avg ?? -1);
    case "memAvg":
      return (a.utilization?.mem_avg ?? -1) - (b.utilization?.mem_avg ?? -1);
    default:
      return 0;
  }
}

function sortVms(vms: MockVm[], sort?: string[]): MockVm[] {
  if (!sort || sort.length === 0) return vms;
  const sorted = [...vms];
  sorted.sort((a, b) => {
    for (const spec of sort) {
      const [field, dir] = spec.split(":");
      const cmp = compareVms(a, b, field);
      if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
    }
    return 0;
  });
  return sorted;
}

let groupIdCounter = 1;
function nextGroupId(): string {
  return `group-${groupIdCounter++}`;
}

class MockStore {
  private fixtures = getFixtures();
  vms: MockVm[] = this.fixtures.vms;
  private vmById = this.fixtures.vmById;
  baselineVms: MockVm[] = buildBaselineVms(this.fixtures.vms);
  private baselineVmById = new Map(this.baselineVms.map((vm) => [vm.id, vm]));

  groups: MockGroup[] = [];

  collections: Collection[] = [
    {
      id: BASELINE_COLLECTION_ID,
      name: "Discovery run #1",
      createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000),
    },
    {
      id: LATEST_COLLECTION_ID,
      name: "Discovery run #2",
      createdAt: new Date(Date.now() - 3600 * 1000),
    },
  ];

  // Defaults to "collected" so the mock drops you straight into the report
  // (handy for demoing report features without redoing the login flow every
  // reload). Set `VITE_MOCK_HAS_COLLECTION=false` to start from a "no prior
  // collection yet" state instead, so the login/upload screen actually
  // renders instead of immediately redirecting to /report.
  collectorStatus: CollectorStatusStatusEnum =
    import.meta.env.VITE_MOCK_HAS_COLLECTION === "false"
      ? "ready"
      : "collected";
  collectorError?: string;
  private collectorTimers: ReturnType<typeof setTimeout>[] = [];

  credentialStatus: CredentialStatus | null = {
    url: "https://vcenter.mock.local",
    username: "administrator@vsphere.local",
    valid: true,
  };
  capabilities: CapabilityStatusCapabilities = {
    collector: { enabled: true },
    inspector: { enabled: true },
    forecaster: { enabled: true },
  };
  // `rvtoolsModeEnabled` isn't in the published SDK's `AgentStatus` type yet
  // (see AgentStatusContext.tsx); cast lets local dev toggle the mock flow via
  // `VITE_MOCK_RVTOOLS_MODE=true` without waiting on the SDK republish.
  agentStatus: AgentStatus = {
    mode: "disconnected",
    consoleConnection: { status: "disconnected" },
    ...(import.meta.env.VITE_MOCK_RVTOOLS_MODE === "true"
      ? ({ rvtoolsModeEnabled: true } as Partial<AgentStatus>)
      : {}),
  };

  inspectorState: InspectorStatusStateEnum = "ready";
  vddk?: VddkProperties;
  private inspectionTimers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    this.seedGroups();
  }

  private seedGroups(): void {
    const clusterCounts = new Map<string, number>();
    for (const vm of this.vms) {
      clusterCounts.set(vm.cluster, (clusterCounts.get(vm.cluster) ?? 0) + 1);
    }
    const topCluster = [...clusterCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];

    const now = new Date();
    const seeds: Array<{ name: string; description: string; filter: string }> =
      [
        {
          name: "Production workloads",
          description: "VMs labeled as production environment.",
          filter: "labels contains 'env:production'",
        },
        {
          name: "Migration blockers",
          description:
            "VMs with at least one Critical issue blocking migration.",
          filter: "migratable = false",
        },
        {
          name: "Excluded from migration",
          description: "VMs manually excluded from the migration wave.",
          filter: "migration_excluded = true",
        },
      ];
    if (topCluster) {
      seeds.push({
        name: `${topCluster} VMs`,
        description: `All virtual machines in cluster ${topCluster}.`,
        filter: `cluster = '${topCluster.replace(/'/g, "\\'")}'`,
      });
    }

    this.groups = seeds.map((seed) => ({
      id: nextGroupId(),
      name: seed.name,
      description: seed.description,
      filter: seed.filter,
      createdAt: now,
      updatedAt: now,
    }));
    this.recomputeGroupMembership();
  }

  private recomputeGroupMembership(): void {
    for (const vm of this.vms) {
      vm.groups = this.groups
        .filter((group) => matchesExpression(vm, group.filter))
        .map((group) => group.name);
    }
  }

  // ---------- VM access ----------

  getVmsForCollection(collectionId: string | undefined): MockVm[] {
    if (collectionId === BASELINE_COLLECTION_ID) return this.baselineVms;
    return this.vms;
  }

  getVmByIdForCollection(
    collectionId: string | undefined,
    vmId: string,
  ): MockVm | undefined {
    if (collectionId === BASELINE_COLLECTION_ID)
      return this.baselineVmById.get(vmId);
    return this.vmById.get(vmId);
  }

  getVmById(vmId: string): MockVm | undefined {
    return this.vmById.get(vmId);
  }

  listVms(params: {
    collectionId?: string;
    byExpression?: string;
    sort?: string[];
    page?: number;
    pageSize?: number;
  }): VirtualMachineListResponse {
    const pool = this.getVmsForCollection(params.collectionId);
    const filtered = filterVms(pool, params.byExpression);
    const sorted = sortVms(filtered, params.sort);
    const { items, total, page, pageCount } = paginate(
      sorted,
      params.page,
      params.pageSize,
    );
    return { virtualMachines: items.map(toApiVm), total, page, pageCount };
  }

  updateVm(
    vmId: string,
    update: { migrationExcluded?: boolean; labels?: string[] },
  ): void {
    const vm = this.vmById.get(vmId);
    if (!vm) return;
    if (update.migrationExcluded !== undefined)
      vm.migrationExcluded = update.migrationExcluded;
    if (update.labels !== undefined) vm.labels = [...update.labels];
    this.recomputeGroupMembership();
  }

  batchUpdateExclusion(vmIds: string[], migrationExcluded: boolean): void {
    for (const vmId of vmIds) {
      const vm = this.vmById.get(vmId);
      if (vm) vm.migrationExcluded = migrationExcluded;
    }
  }

  getLabelsResponse(): VMLabelsResponse {
    const counts = new Map<string, number>();
    for (const vm of this.vms) {
      for (const label of vm.labels)
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const labels = [...counts.keys()].sort();
    return { labels, counts: labels.map((label) => counts.get(label) ?? 0) };
  }

  updateLabelVMs(
    label: string,
    add: string[] = [],
    remove: string[] = [],
  ): void {
    const addSet = new Set(add);
    const removeSet = new Set(remove);
    for (const vm of this.vms) {
      if (addSet.has(vm.id) && !vm.labels.includes(label)) {
        vm.labels = [...vm.labels, label];
      }
      if (removeSet.has(vm.id)) {
        vm.labels = vm.labels.filter((existing) => existing !== label);
      }
    }
  }

  deleteLabelGlobally(label: string): DeleteLabelGloballyResponse {
    let affected = 0;
    for (const vm of this.vms) {
      if (vm.labels.includes(label)) {
        vm.labels = vm.labels.filter((existing) => existing !== label);
        affected += 1;
      }
    }
    return { label, affected };
  }

  getFilterOptions(): VMFilterOptionsResponse {
    return this.fixtures.filterOptions;
  }

  getApplications(collectionId?: string): ApplicationOverview[] {
    const vms = this.getVmsForCollection(collectionId);
    const byApp = new Map<string, MockVm[]>();
    for (const vm of vms) {
      for (const appName of vm.applications) {
        const list = byApp.get(appName) ?? [];
        list.push(vm);
        byApp.set(appName, list);
      }
    }
    return APPLICATION_CATALOG.filter((entry) => byApp.has(entry.name)).map(
      (entry) => {
        const matchedVms = byApp.get(entry.name) ?? [];
        return {
          name: entry.name,
          description: entry.description,
          vmCount: matchedVms.length,
          vms: matchedVms.map((vm) => ({ id: vm.id, name: vm.name })),
        };
      },
    );
  }

  // ---------- Groups ----------

  listGroups(params: {
    byName?: string;
    page?: number;
    pageSize?: number;
  }): GroupListResponse {
    let filtered = this.groups;
    if (params.byName) {
      const needle = params.byName.toLowerCase();
      filtered = filtered.filter((group) =>
        group.name.toLowerCase().includes(needle),
      );
    }
    const { items, total, page, pageCount } = paginate(
      filtered,
      params.page,
      params.pageSize,
    );
    const groups: Group[] = items.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      filter: group.filter,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    }));
    return { groups, total, page, pageCount };
  }

  getGroup(
    groupId: string,
    params: { page?: number; pageSize?: number },
  ): GroupResponse | null {
    const group = this.groups.find((g) => g.id === groupId);
    if (!group) return null;

    const matched = filterVms(this.vms, group.filter);
    const { items, total, page, pageCount } = paginate(
      matched,
      params.page,
      params.pageSize,
    );

    const hostIds = new Set(matched.map((vm) => vm.host));
    const scopedHosts = this.fixtures.allHosts.filter(
      (host) => host.id && hostIds.has(host.id),
    );

    return {
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        filter: group.filter,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      },
      inventory: {
        vcenter_id: this.fixtures.inventory.vcenter_id,
        vcenter_version: this.fixtures.inventory.vcenter_version,
        clusters: {},
        vcenter: {
          vcenter: { id: this.fixtures.inventory.vcenter_id },
          vms: computeVMsAggregate(matched),
          infra: computeInfraAggregate(matched, { hosts: scopedHosts }),
        },
      },
      vms: items.map(toApiVm),
      total,
      page,
      pageCount,
    };
  }

  createGroup(name: string, filter: string, description?: string): Group {
    const now = new Date();
    const group: MockGroup = {
      id: nextGroupId(),
      name,
      description,
      filter,
      createdAt: now,
      updatedAt: now,
    };
    this.groups.push(group);
    this.recomputeGroupMembership();
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      filter: group.filter,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  updateGroup(
    groupId: string,
    update: { name?: string; description?: string; filter?: string },
  ): Group | null {
    const group = this.groups.find((g) => g.id === groupId);
    if (!group) return null;
    if (update.name !== undefined) group.name = update.name;
    if (update.description !== undefined)
      group.description = update.description;
    if (update.filter !== undefined) group.filter = update.filter;
    group.updatedAt = new Date();
    this.recomputeGroupMembership();
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      filter: group.filter,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  deleteGroup(groupId: string): void {
    this.groups = this.groups.filter((g) => g.id !== groupId);
    this.recomputeGroupMembership();
  }

  // ---------- Collections & comparison ----------

  listCollections(): Collection[] {
    return this.collections;
  }

  latestCollectionId(): string {
    return LATEST_COLLECTION_ID;
  }

  baselineCollectionId(): string {
    return BASELINE_COLLECTION_ID;
  }

  getInventoryForCollection(collectionId: string | undefined) {
    if (collectionId === BASELINE_COLLECTION_ID) {
      const vms = this.baselineVms;
      return {
        vcenter_id: this.fixtures.inventory.vcenter_id,
        vcenter_version: this.fixtures.inventory.vcenter_version,
        clusters: {},
        vcenter: {
          vcenter: { id: this.fixtures.inventory.vcenter_id },
          vms: computeVMsAggregate(vms),
          infra: computeInfraAggregate(vms, {
            hosts: this.fixtures.allHosts,
            totalDatacenters: this.datacenters.length,
          }),
        },
      };
    }
    return this.fixtures.inventory;
  }

  getClusterUtilization(collectionId: string | undefined, clusterId: string) {
    const vms = this.getVmsForCollection(collectionId).filter(
      (vm) => vm.cluster === clusterId,
    );
    const withUtilization = vms.filter((vm) => vm.utilization);
    const avg = (selector: (vm: MockVm) => number): number =>
      withUtilization.length === 0
        ? 0
        : Number(
            (
              withUtilization.reduce((sum, vm) => sum + selector(vm), 0) /
              withUtilization.length
            ).toFixed(1),
          );

    return {
      cluster_id: clusterId,
      cluster_name: clusterId,
      vm_count: vms.length,
      cpu_avg: avg((vm) => vm.utilization!.cpu_avg),
      cpu_p95: avg((vm) => vm.utilization!.cpu_p95),
      cpu_max: avg((vm) => vm.utilization!.cpu_max),
      mem_avg: avg((vm) => vm.utilization!.mem_avg),
      mem_p95: avg((vm) => vm.utilization!.mem_p95),
      mem_max: avg((vm) => vm.utilization!.mem_max),
      disk: avg((vm) => vm.utilization!.disk),
      confidence: avg((vm) => vm.utilization!.confidence),
      total_provisioned_cpus: vms.reduce((sum, vm) => sum + vm.cpuCount, 0),
      total_provisioned_memory_mb: vms.reduce(
        (sum, vm) => sum + vm.memoryMB,
        0,
      ),
      total_provisioned_disk_kb: vms.reduce(
        (sum, vm) => sum + vm.diskSizeMB * 1024,
        0,
      ),
    };
  }

  private collectionAggregate(collectionId: string): {
    id: string;
    createdAt: Date;
    totalVMs: number;
    migratable: number;
    nonMigratable: number;
    clusters: number;
  } {
    const collection = this.collections.find((c) => c.id === collectionId);
    const vms = this.getVmsForCollection(collectionId);
    const migratable = vms.filter((vm) => vm.migratable).length;
    const clusters = new Set(vms.map((vm) => vm.cluster)).size;
    return {
      id: collectionId,
      createdAt: collection?.createdAt ?? new Date(),
      totalVMs: vms.length,
      migratable,
      nonMigratable: vms.length - migratable,
      clusters,
    };
  }

  compareCollections(aId: string, bId: string) {
    const a = this.collectionAggregate(aId);
    const b = this.collectionAggregate(bId);
    const diffEntry = (aVal: number, bVal: number): { delta: number } => ({
      delta: bVal - aVal,
    });
    return {
      collections: [a, b],
      diff: {
        totalVMs: this.dimensionDiff(aId, bId, "total"),
        migratable: this.dimensionDiff(aId, bId, "migratable"),
        nonMigratable: this.dimensionDiff(aId, bId, "non-migratable"),
        clusters: diffEntry(a.clusters, b.clusters),
      },
    };
  }

  private dimensionVmIds(
    collectionId: string,
    dimension: "total" | "migratable" | "non-migratable",
  ): Set<string> {
    const vms = this.getVmsForCollection(collectionId);
    const filtered =
      dimension === "total"
        ? vms
        : vms.filter((vm) =>
            dimension === "migratable" ? vm.migratable : !vm.migratable,
          );
    return new Set(filtered.map((vm) => vm.id));
  }

  private dimensionDiff(
    aId: string,
    bId: string,
    dimension: "total" | "migratable" | "non-migratable",
  ) {
    const aIds = this.dimensionVmIds(aId, dimension);
    const bIds = this.dimensionVmIds(bId, dimension);
    let onlyInA = 0;
    let onlyInB = 0;
    for (const id of aIds) if (!bIds.has(id)) onlyInA += 1;
    for (const id of bIds) if (!aIds.has(id)) onlyInB += 1;
    return { delta: bIds.size - aIds.size, onlyInA, onlyInB };
  }

  compareCollectionsDiff(
    aId: string,
    bId: string,
    dimension: "total" | "migratable" | "non-migratable",
    page = 1,
    pageSize = 50,
  ) {
    const aIds = this.dimensionVmIds(aId, dimension);
    const bIds = this.dimensionVmIds(bId, dimension);
    const onlyInAIds = [...aIds].filter((id) => !bIds.has(id));
    const onlyInBIds = [...bIds].filter((id) => !aIds.has(id));

    const pageA = paginate(onlyInAIds, page, pageSize);
    const pageB = paginate(onlyInBIds, page, pageSize);

    return {
      dimension,
      onlyInA: {
        total: pageA.total,
        page: pageA.page,
        pageCount: pageA.pageCount,
        vmIds: pageA.items,
      },
      onlyInB: {
        total: pageB.total,
        page: pageB.page,
        pageCount: pageB.pageCount,
        vmIds: pageB.items,
      },
    };
  }

  buildExportBlob(collectionId: string, scope?: string): Blob {
    const vms = this.getVmsForCollection(collectionId);
    const header =
      "id,name,cluster,datacenter,powerState,cpuCount,memoryMB,diskSizeMB,migratable,issueCount\n";
    const rows = vms
      .map((vm) =>
        [
          vm.id,
          vm.name,
          vm.cluster,
          vm.datacenter,
          vm.powerState,
          vm.cpuCount,
          vm.memoryMB,
          vm.diskSizeMB,
          vm.migratable,
          vm.issues.length,
        ].join(","),
      )
      .join("\n");
    const csv = `# Mock export (scope=${scope ?? "overview"})\n${header}${rows}\n`;
    return new Blob([csv], { type: "application/zip" });
  }

  // ---------- Collector state machine ----------

  private clearCollectorTimers(): void {
    for (const timer of this.collectorTimers) clearTimeout(timer);
    this.collectorTimers = [];
  }

  startCollector(): CollectorStatusStatusEnum {
    this.clearCollectorTimers();
    this.collectorError = undefined;
    this.collectorStatus = "connecting";

    const schedule = (
      delayMs: number,
      status: CollectorStatusStatusEnum,
    ): void => {
      this.collectorTimers.push(
        setTimeout(() => {
          this.collectorStatus = status;
          if (status === "collected") {
            const latest = this.collections.find(
              (c) => c.id === LATEST_COLLECTION_ID,
            );
            if (latest) latest.createdAt = new Date();
          }
        }, delayMs),
      );
    };

    schedule(1200, "collecting");
    schedule(3200, "collecting metrics");
    schedule(4600, "parsing");
    schedule(5800, "collected");

    return this.collectorStatus;
  }

  stopCollector(): void {
    this.clearCollectorTimers();
    this.collectorStatus = "ready";
    this.collectorError = undefined;
  }

  /** RVTools upload shares the same collector state machine as the vCenter flow. */
  startRvtoolsCollector(): CollectorStatusStatusEnum {
    return this.startCollector();
  }

  getCollectorStatusPayload(): {
    status: CollectorStatusStatusEnum;
    error?: string;
  } {
    return { status: this.collectorStatus, error: this.collectorError };
  }

  // ---------- Credentials / capabilities / agent status ----------

  putCredentials(url: string, username: string): CredentialStatus {
    this.credentialStatus = { url, username, valid: true };
    return this.credentialStatus;
  }

  deleteCredentials(): void {
    this.credentialStatus = null;
  }

  setAgentMode(mode: AgentStatus["mode"]): AgentStatus {
    this.agentStatus = {
      ...this.agentStatus,
      mode,
      consoleConnection: {
        status: mode === "connected" ? "connected" : "disconnected",
      },
    };
    return this.agentStatus;
  }

  // ---------- Inspector ----------

  getInspectorStatus(includeVddk?: boolean): InspectorStatus {
    return {
      state: this.inspectorState,
      vddk: includeVddk ? this.vddk : undefined,
    };
  }

  putInspectorVddk(fileSize: number): VddkProperties {
    this.vddk = { version: "8.0.3", md5: randomHex(32), bytes: fileSize };
    return this.vddk;
  }

  startInspection(vmIds: string[]): InspectorStatus {
    for (const timer of this.inspectionTimers) clearTimeout(timer);
    this.inspectionTimers = [];

    this.inspectorState = "running";
    for (const vmId of vmIds) {
      const vm = this.vmById.get(vmId);
      if (!vm) continue;
      vm.inspectionState = "pending";
      const rng = mulberry32(hashString(vmId));
      const runningDelay = randomInt(rng, 500, 1500);
      const doneDelay = runningDelay + randomInt(rng, 1500, 4000);

      this.inspectionTimers.push(
        setTimeout(() => {
          vm.inspectionState = "running";
        }, runningDelay),
      );
      this.inspectionTimers.push(
        setTimeout(() => {
          vm.inspectionState = "completed";
          vm.inspectionConcerns = buildInspectionConcerns(rng, vm);
          if (
            ![...this.vmById.values()].some(
              (candidate) =>
                candidate.inspectionState === "pending" ||
                candidate.inspectionState === "running",
            )
          ) {
            this.inspectorState = "ready";
          }
        }, doneDelay),
      );
    }
    return this.getInspectorStatus(true);
  }

  stopInspection(): InspectorStatus {
    for (const timer of this.inspectionTimers) clearTimeout(timer);
    this.inspectionTimers = [];
    for (const vm of this.vms) {
      if (
        vm.inspectionState === "pending" ||
        vm.inspectionState === "running"
      ) {
        vm.inspectionState = "canceled";
      }
    }
    this.inspectorState = "ready";
    return this.getInspectorStatus(true);
  }

  // ---------- Shared fixtures accessors ----------

  get inventory() {
    return this.fixtures.inventory;
  }

  get populatedClusterInventory() {
    return this.fixtures.populatedClusterInventory;
  }

  get allHosts() {
    return this.fixtures.allHosts;
  }

  get datacenters() {
    return this.fixtures.datacenters;
  }
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

function randomHex(length: number): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < length; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function buildInspectionConcerns(
  rng: ReturnType<typeof mulberry32>,
  vm: MockVm,
) {
  const concerns = [];
  if (chance(rng, 0.3)) {
    concerns.push({
      label: "vmware-tools-outdated",
      message:
        "VMware Tools version is outdated and should be upgraded before migration.",
      category: "Warning",
    });
  }
  if (chance(rng, 0.15)) {
    concerns.push({
      label: "unattached-iso",
      message: `An ISO image is attached to ${vm.name} but was not found in the referenced datastore.`,
      category: "Warning",
    });
  }
  if (chance(rng, 0.1)) {
    concerns.push({
      label: "guest-disk-usage-high",
      message: "One or more guest disks are over 90% full.",
      category: "Advisory",
    });
  }
  if (chance(rng, 0.05)) {
    concerns.push({
      label: "unsupported-firmware",
      message:
        "EFI secure boot is enabled and may require additional configuration on the target platform.",
      category: "Critical",
    });
  }
  return concerns;
}

export const store = new MockStore();
export { BASELINE_COLLECTION_ID, LATEST_COLLECTION_ID };
