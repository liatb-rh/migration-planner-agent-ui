/** Lightweight simulation of the Forecaster API (Storage Offload Estimator) used by the raw-fetch interceptor. */

import type {
  ForecasterDatastore,
  ForecasterStatus,
  ForecastPairStatus,
  ForecastRun,
  ForecastStartPair,
  ForecastStartRequest,
  ForecastStats,
  PairCapability,
} from "../pages/StorageOffloadEstimator/utils/forecasterTypes";
import { mulberry32, pickWeighted, randomFloat, randomInt } from "./random";

const CAPABILITY_POOL = ["xcopy", "copy-offload", "rdm", "vvol"];

function buildDatastores(): ForecasterDatastore[] {
  const rng = mulberry32(0xf0eca57e);
  const arrays: Array<{
    id?: string;
    vendor: string;
    model: string;
    type: string;
  }> = [
    {
      id: "naa-6000d3100",
      vendor: "Dell EMC",
      model: "PowerStore 5200T",
      type: "VMFS",
    },
    {
      id: "naa-6000d3200",
      vendor: "Pure Storage",
      model: "FlashArray//X70",
      type: "VMFS",
    },
    { id: "naa-6000d3300", vendor: "NetApp", model: "AFF A400", type: "VMFS" },
    { id: undefined, vendor: "NetApp", model: "FAS8300", type: "NFS" },
  ];

  const datastores: ForecasterDatastore[] = [];
  arrays.forEach((array, arrayIdx) => {
    const count = array.type === "NFS" ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const capacityGb = pickWeighted(
        rng,
        [2048, 4096, 8192, 16384],
        [20, 35, 30, 15],
      );
      const freeGb = Math.round(capacityGb * randomFloat(rng, 0.15, 0.6));
      datastores.push({
        name: `ds-${array.type.toLowerCase()}-${arrayIdx + 1}-${i + 1}`,
        type: array.type,
        capacityGb,
        freeGb,
        storageVendor: array.vendor,
        storageModel: array.model,
        storageArrayId: array.id,
        naaDevices: array.id
          ? [`${array.id}${randomInt(rng, 100, 999)}`]
          : undefined,
        capabilities:
          array.type === "NFS"
            ? ["xcopy"]
            : CAPABILITY_POOL.slice(0, randomInt(rng, 2, 4)),
      });
    }
  });
  return datastores;
}

class ForecasterMock {
  private datastores = buildDatastores();
  private state: "ready" | "running" = "ready";
  private pairs: ForecastPairStatus[] = [];
  private runs: ForecastRun[] = [];
  private runIdCounter = 1;
  private timers: ReturnType<typeof setTimeout>[] = [];

  getDatastores(): ForecasterDatastore[] {
    return this.datastores;
  }

  private datastoreByName(name: string): ForecasterDatastore | undefined {
    return this.datastores.find((ds) => ds.name === name);
  }

  getPairCapabilities(pairs: ForecastStartPair[]): PairCapability[] {
    return pairs.map((pair) => {
      const source = this.datastoreByName(pair.sourceDatastore);
      const target = this.datastoreByName(pair.targetDatastore);
      const sameArray =
        Boolean(source?.storageArrayId) &&
        source?.storageArrayId === target?.storageArrayId;
      const capabilities = sameArray
        ? (source?.capabilities ?? CAPABILITY_POOL).filter((cap) =>
            (target?.capabilities ?? CAPABILITY_POOL).includes(cap),
          )
        : ["copy-offload"];
      return {
        pairName: pair.name,
        sourceDatastore: pair.sourceDatastore,
        targetDatastore: pair.targetDatastore,
        capabilities: capabilities.length > 0 ? capabilities : ["copy-offload"],
      };
    });
  }

  getStatus(): ForecasterStatus {
    return this.state === "running"
      ? { state: this.state, pairs: this.pairs }
      : { state: this.state };
  }

  startForecast(request: ForecastStartRequest): ForecasterStatus {
    if (this.state === "running") {
      const error = new Error("A benchmark is already running.");
      error.name = "ForecastConflict";
      throw error;
    }

    this.state = "running";
    const iterations = request.iterations ?? 3;
    this.pairs = request.pairs.map((pair) => ({
      pairName: pair.name,
      sourceDatastore: pair.sourceDatastore,
      targetDatastore: pair.targetDatastore,
      host: pair.host,
      state: "pending",
      completedRuns: 0,
      totalRuns: iterations,
      prepBytesTotal: (request.diskSizeGb ?? 10) * 1024 * 1024 * 1024,
      prepBytesUploaded: 0,
    }));

    for (const pairStatus of this.pairs) {
      this.simulatePair(pairStatus, iterations, request.diskSizeGb ?? 10);
    }

    return this.getStatus();
  }

  private simulatePair(
    pairStatus: ForecastPairStatus,
    iterations: number,
    diskSizeGb: number,
  ): void {
    const rng = mulberry32(hashString(pairStatus.pairName + Date.now()));
    let elapsed = 400;

    this.timers.push(
      setTimeout(() => {
        pairStatus.state = "preparing";
      }, elapsed),
    );
    elapsed += 1200;

    const prepSteps = 5;
    for (let step = 1; step <= prepSteps; step++) {
      this.timers.push(
        setTimeout(
          () => {
            if (pairStatus.state === "canceled") return;
            pairStatus.prepBytesUploaded = Math.round(
              ((pairStatus.prepBytesTotal ?? 0) * step) / prepSteps,
            );
          },
          elapsed + step * 300,
        ),
      );
    }
    elapsed += prepSteps * 300 + 300;

    this.timers.push(
      setTimeout(() => {
        if (pairStatus.state === "canceled") return;
        pairStatus.state = "running";
      }, elapsed),
    );

    for (let iteration = 1; iteration <= iterations; iteration++) {
      elapsed += randomInt(rng, 900, 2200);
      const iterationDelay = elapsed;
      this.timers.push(
        setTimeout(() => {
          if (pairStatus.state === "canceled") return;
          const throughputMbps = Number(randomFloat(rng, 180, 950).toFixed(1));
          const durationSec = Number(randomFloat(rng, 4, 18).toFixed(1));
          this.runs.push({
            id: this.runIdCounter++,
            sessionId: 1,
            pairName: pairStatus.pairName,
            sourceDatastore: pairStatus.sourceDatastore,
            targetDatastore: pairStatus.targetDatastore,
            iteration,
            diskSizeGb,
            prepDurationSec:
              iteration === 1
                ? Number(randomFloat(rng, 2, 6).toFixed(1))
                : undefined,
            durationSec,
            throughputMbps,
            method: "copy-offload",
            createdAt: new Date().toISOString(),
          });
          pairStatus.completedRuns = iteration;
          if (iteration === iterations) {
            pairStatus.state = "completed";
            if (
              this.pairs.every(
                (p) =>
                  p.state === "completed" ||
                  p.state === "canceled" ||
                  p.state === "error",
              )
            ) {
              this.state = "ready";
            }
          }
        }, iterationDelay),
      );
    }
  }

  cancelForecast(): ForecasterStatus {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    for (const pair of this.pairs) {
      if (pair.state !== "completed" && pair.state !== "error")
        pair.state = "canceled";
    }
    this.state = "ready";
    return this.getStatus();
  }

  cancelPair(pairName: string): { pairName: string; state: "canceled" } {
    const pair = this.pairs.find((p) => p.pairName === pairName);
    if (!pair) {
      const error = new Error(`No active pair named "${pairName}".`);
      error.name = "ForecasterNotFound";
      throw error;
    }
    pair.state = "canceled";
    if (
      this.pairs.every(
        (p) =>
          p.state === "completed" ||
          p.state === "canceled" ||
          p.state === "error",
      )
    ) {
      this.state = "ready";
    }
    return { pairName, state: "canceled" };
  }

  getRuns(pairName?: string): ForecastRun[] {
    return pairName
      ? this.runs.filter((run) => run.pairName === pairName)
      : this.runs;
  }

  deleteRun(id: number): void {
    this.runs = this.runs.filter((run) => run.id !== id);
  }

  getStats(pairName: string): ForecastStats {
    const samples = this.runs
      .filter((run) => run.pairName === pairName)
      .map((run) => run.throughputMbps);
    if (samples.length === 0) {
      return { pairName, sampleCount: 0 };
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
    const variance =
      samples.reduce((sum, v) => sum + (v - mean) ** 2, 0) / samples.length;
    const stddev = Math.sqrt(variance);
    const median = sorted[Math.floor(sorted.length / 2)];
    const ci = 1.96 * (stddev / Math.sqrt(samples.length));

    const mbpsToTbEta = (mbps: number): string => {
      const seconds = (1024 * 1024 * 8) / mbps;
      const hours = seconds / 3600;
      return `${hours.toFixed(1)}h`;
    };

    return {
      pairName,
      sampleCount: samples.length,
      meanMbps: Number(mean.toFixed(1)),
      medianMbps: Number(median.toFixed(1)),
      minMbps: Number(sorted[0].toFixed(1)),
      maxMbps: Number(sorted[sorted.length - 1].toFixed(1)),
      stddevMbps: Number(stddev.toFixed(1)),
      ci95LowerMbps: Number((mean - ci).toFixed(1)),
      ci95UpperMbps: Number((mean + ci).toFixed(1)),
      estimatePer1TB: {
        bestCase: mbpsToTbEta(sorted[sorted.length - 1]),
        expected: mbpsToTbEta(mean),
        worstCase: mbpsToTbEta(sorted[0]),
      },
    };
  }
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export const forecasterMock = new ForecasterMock();
