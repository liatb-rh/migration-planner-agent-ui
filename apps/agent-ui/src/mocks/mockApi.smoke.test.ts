import { describe, expect, it, vi } from "vitest";
import { CLUSTER_COUNT, VM_COUNT } from "./catalogs";
import { getFixtures } from "./fixtures";
import { forecasterMock } from "./forecasterMock";
import { createMockAgentApi } from "./mockAgentApi";
import { BASELINE_COLLECTION_ID, LATEST_COLLECTION_ID, store } from "./store";

// Keep the mock API's artificial network latency (see delay.ts) from slowing down these tests.
vi.mock("./delay", () => ({
  MOCK_API_DELAY_MS: 0,
  delay: () => Promise.resolve(),
}));

describe("mock fixtures", () => {
  it("generates the requested VM/cluster/datacenter counts", () => {
    const fixtures = getFixtures();
    expect(fixtures.vms).toHaveLength(VM_COUNT);
    expect(fixtures.clusters).toHaveLength(CLUSTER_COUNT);
    expect(fixtures.inventory.vcenter?.vms?.total).toBe(VM_COUNT);
  });

  it("is deterministic across calls (memoized)", () => {
    expect(getFixtures()).toBe(getFixtures());
  });
});

describe("mock store: VM listing & filtering", () => {
  it("lists all 1200 VMs across pagination", async () => {
    const api = createMockAgentApi();
    const first = await api.listLatestVirtualMachines({
      page: 1,
      pageSize: 500,
    });
    expect(first.total).toBe(VM_COUNT);
    expect(first.pageCount).toBe(3);
    expect(first.virtualMachines).toHaveLength(500);

    const last = await api.listLatestVirtualMachines({
      page: 3,
      pageSize: 500,
    });
    expect(last.virtualMachines).toHaveLength(VM_COUNT - 1000);
  });

  it("filters VMs using the byExpression DSL", async () => {
    const api = createMockAgentApi();
    const excluded = await api.listLatestVirtualMachines({
      byExpression: "migration_excluded = true",
      pageSize: VM_COUNT,
    });
    expect(excluded.total).toBeGreaterThan(0);
    expect(excluded.virtualMachines.every((vm) => vm.migrationExcluded)).toBe(
      true,
    );

    const poweredOn = await api.listLatestVirtualMachines({
      byExpression: "status = 'poweredOn'",
      pageSize: VM_COUNT,
    });
    expect(
      poweredOn.virtualMachines.every((vm) => vm.vCenterState === "poweredOn"),
    ).toBe(true);
  });

  it("updates VM labels and exclusion", async () => {
    const api = createMockAgentApi();
    const vmId = store.vms[0].id;
    await api.updateLatestVirtualMachine({
      vmId,
      virtualMachineUpdateRequest: {
        migrationExcluded: true,
        labels: ["env:test"],
      },
    });
    const updated = await api.getLatestVirtualMachine({ vmId });
    expect(updated.migrationExcluded).toBe(true);
    expect(updated.labels).toContain("env:test");
  });
});

describe("mock store: groups CRUD", () => {
  it("creates, filters, updates, and deletes a group", async () => {
    const api = createMockAgentApi();
    const created = await api.createLatestGroup({
      createGroupRequest: { name: "Test group", filter: "migratable = true" },
    });
    expect(created.id).toBeTruthy();

    const listed = await api.listLatestGroups({});
    expect(listed.groups.some((g) => g.id === created.id)).toBe(true);

    const detail = await api.getLatestGroup({
      groupId: created.id,
      page: 1,
      pageSize: 10,
    });
    expect(detail.vms.every((vm) => vm.migratable)).toBe(true);

    const updated = await api.updateLatestGroup({
      groupId: created.id,
      updateGroupRequest: { name: "Renamed group" },
    });
    expect(updated.name).toBe("Renamed group");

    await api.deleteLatestGroup({ groupId: created.id });
    const listedAfter = await api.listLatestGroups({});
    expect(listedAfter.groups.some((g) => g.id === created.id)).toBe(false);
  });
});

describe("mock store: collections & comparison", () => {
  it("exposes two collections with different VM counts", async () => {
    const api = createMockAgentApi();
    const { collections } = await api.listCollections();
    expect(collections).toHaveLength(2);

    const summary = await api.compareCollections({
      aId: BASELINE_COLLECTION_ID,
      bId: LATEST_COLLECTION_ID,
    });
    expect(summary).toBeTruthy();
  });

  it("exports a collection as a downloadable blob", async () => {
    const api = createMockAgentApi();
    const blob = await api.exportCollection({ id: LATEST_COLLECTION_ID });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe("mock store: inspector", () => {
  it("starts inspection and eventually marks VMs completed", async () => {
    const api = createMockAgentApi();
    const vmId = store.vms[1].id;
    await api.startInspection({ startInspectionRequest: { vmIds: [vmId] } });
    expect(store.getVmById(vmId)?.inspectionState).toBe("pending");
  });
});

describe("forecaster mock", () => {
  it("returns datastores and pair capabilities", () => {
    const datastores = forecasterMock.getDatastores();
    expect(datastores.length).toBeGreaterThan(0);

    const [a, b] = datastores;
    const capabilities = forecasterMock.getPairCapabilities([
      { name: "pair-1", sourceDatastore: a.name, targetDatastore: b.name },
    ]);
    expect(capabilities).toHaveLength(1);
    expect(capabilities[0].capabilities.length).toBeGreaterThan(0);
  });
});
