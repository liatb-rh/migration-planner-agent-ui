/**
 * Installs a global `window.fetch` interceptor for the handful of endpoints
 * the UI calls via raw `fetch()` instead of the DI-injected AgentApi client
 * (see `inventoryParsing.ts` and `forecasterApi.ts`). Only called when
 * `VITE_MOCK_API=true`.
 */
import { delay } from "./delay";
import { forecasterMock } from "./forecasterMock";
import { store } from "./store";

function json(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function empty(status = 204): Response {
  return new Response(null, { status });
}

async function readJsonBody<T>(
  init: RequestInit | undefined,
): Promise<T | undefined> {
  if (!init?.body) return undefined;
  try {
    return JSON.parse(String(init.body)) as T;
  } catch {
    return undefined;
  }
}

export function installMockFetch(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    let pathname: string;
    try {
      pathname = new URL(url, window.location.origin).pathname;
    } catch {
      return originalFetch(input, init);
    }

    const isMockedPath =
      pathname.endsWith("/inventory") ||
      pathname.endsWith("/collector") ||
      pathname.includes("/forecaster");
    if (!isMockedPath) {
      return originalFetch(input, init);
    }
    await delay();

    const method = (init?.method ?? "GET").toUpperCase();

    if (pathname.endsWith("/inventory") && method === "GET") {
      return json(store.inventory);
    }

    if (pathname.endsWith("/collector") && method === "POST") {
      store.startCollector();
      return empty(202);
    }

    const forecasterMatch = pathname.match(/\/forecaster(\/.*)?$/);
    if (forecasterMatch) {
      const sub = forecasterMatch[1] ?? "";

      if (sub === "/credentials" && method === "PUT") {
        return empty(204);
      }
      if (sub === "/datastores" && method === "GET") {
        return json(forecasterMock.getDatastores());
      }
      if (sub === "/capabilities" && method === "POST") {
        const body = await readJsonBody<{
          pairs: Parameters<typeof forecasterMock.getPairCapabilities>[0];
        }>(init);
        return json(forecasterMock.getPairCapabilities(body?.pairs ?? []));
      }
      if (sub === "" && method === "POST") {
        const body =
          await readJsonBody<
            Parameters<typeof forecasterMock.startForecast>[0]
          >(init);
        try {
          return json(forecasterMock.startForecast(body ?? { pairs: [] }), 202);
        } catch (error) {
          return json({ error: (error as Error).message }, 409);
        }
      }
      if (sub === "" && method === "GET") {
        return json(forecasterMock.getStatus());
      }
      if (sub === "" && method === "DELETE") {
        return json(forecasterMock.cancelForecast(), 202);
      }
      const pairMatch = sub.match(/^\/pairs\/([^/]+)$/);
      if (pairMatch && method === "DELETE") {
        try {
          return json(
            forecasterMock.cancelPair(decodeURIComponent(pairMatch[1])),
            202,
          );
        } catch {
          return json({ error: "Pair not found" }, 404);
        }
      }
      if (sub === "/runs" && method === "GET") {
        const pairName =
          new URL(url, window.location.origin).searchParams.get("pairName") ??
          undefined;
        return json(forecasterMock.getRuns(pairName));
      }
      const runMatch = sub.match(/^\/runs\/(\d+)$/);
      if (runMatch && method === "DELETE") {
        forecasterMock.deleteRun(Number(runMatch[1]));
        return empty(204);
      }
      if (sub === "/stats" && method === "GET") {
        const pairName =
          new URL(url, window.location.origin).searchParams.get("pairName") ??
          "";
        return json(forecasterMock.getStats(pairName));
      }
    }

    return originalFetch(input, init);
  };
}
