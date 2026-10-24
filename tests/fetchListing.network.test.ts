import type { LookupFunction } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const network = vi.hoisted(() => ({
  lookup: vi.fn(), fetch: vi.fn(), destroy: vi.fn(),
  connections: [] as { lookup: LookupFunction }[],
}));
vi.mock("node:dns/promises", () => ({ lookup: network.lookup }));
vi.mock("undici", () => ({
  fetch: network.fetch,
  Agent: class {
    constructor(options: { connect: { lookup: LookupFunction } }) {
      network.connections.push(options.connect);
    }
    destroy() { return network.destroy(); }
  },
}));

import { fetchListing } from "@/lib/extract/fetchListing";

const publicAddress = { address: "93.184.215.14", family: 4 };
const html = () => new Response("<h1>Bike</h1><p>250W motor</p>", { headers: { "content-type": "text/html" } });

beforeEach(() => {
  vi.resetAllMocks();
  network.connections.length = 0;
  network.lookup.mockResolvedValue([publicAddress]);
  network.fetch.mockImplementation(async () => html());
  // A regression to the global fetch must not make a real outbound request.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected unpinned fetch")));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("listing socket address policy", () => {
  it("pins the socket to the checked answer even if DNS changes, preserving the TLS hostname", async () => {
    network.fetch.mockImplementation(async (url: URL, options: { dispatcher: unknown }) => {
      expect(url.href).toBe("https://shop.example/bike");
      expect(options.dispatcher).toBeDefined();
      network.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
      const connect = network.connections[0];
      const callback = vi.fn();
      connect.lookup("shop.example", { all: true }, callback);
      expect(callback).toHaveBeenCalledWith(null, [publicAddress]);
      const single = vi.fn();
      connect.lookup("shop.example", { family: 4 }, single);
      expect(single).toHaveBeenCalledWith(null, publicAddress.address, 4);
      return html();
    });
    expect((await fetchListing("https://shop.example/bike")).text).toContain("250W");
    expect(network.lookup).toHaveBeenCalledTimes(1);
    expect(network.destroy).toHaveBeenCalledOnce();
  });

  it("rejects mixed public and private DNS answers before opening a connection", async () => {
    network.lookup.mockResolvedValue([publicAddress, { address: "10.0.0.1", family: 4 }]);
    await expect(fetchListing("https://shop.example/bike")).rejects.toMatchObject({ code: "invalid" });
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it("stops waiting for DNS when the per-hop deadline expires", async () => {
    const controller = new AbortController();
    const deadline = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    network.lookup.mockImplementation(() => new Promise(() => {}));
    const pending = fetchListing("https://shop.example/bike");
    const rejected = expect(pending).rejects.toMatchObject({ code: "invalid" });
    controller.abort();
    await rejected;
    expect(deadline).toHaveBeenCalledWith(8_000);
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it.each([
    "http://127.0.0.1/", "http://169.254.169.254/", "http://[::1]/",
    "http://[::ffff:7f00:1]/", "http://192.0.0.1/", "http://198.18.0.1/",
    "http://[2001:db8::1]/", "http://[2002:7f00:1::]/", "http://localhost./",
  ])("rejects a redirect to %s and disposes the previous connection", async (destination) => {
    network.fetch.mockResolvedValue(new Response("redirect body", { status: 302, headers: { location: destination } }));
    await expect(fetchListing("https://shop.example/bike")).rejects.toMatchObject({ code: "invalid" });
    expect(network.fetch).toHaveBeenCalledTimes(1);
    expect(network.destroy).toHaveBeenCalledOnce();
  });

  it("checks DNS again on a same-host redirect and refuses a newly private answer", async () => {
    network.lookup.mockResolvedValueOnce([publicAddress]).mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    network.fetch.mockResolvedValue(new Response(null, { status: 302, headers: { location: "/next" } }));
    await expect(fetchListing("https://shop.example/bike")).rejects.toMatchObject({ code: "invalid" });
    expect(network.fetch).toHaveBeenCalledOnce();
  });

  it("does not hide a blocked page behind successful Shopify product data", async () => {
    network.fetch.mockResolvedValueOnce(Response.json({ product: { title: "Bike", body_html: "250W motor" } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://10.0.0.1/" } }));
    await expect(fetchListing("https://shop.example/products/bike")).rejects.toMatchObject({ code: "invalid" });
  });

  it("caps response bytes and releases the connection", async () => {
    network.fetch.mockResolvedValue(new Response("x".repeat(2_000_001)));
    await expect(fetchListing("https://shop.example/bike")).rejects.toMatchObject({ code: "too_big" });
    expect(network.destroy).toHaveBeenCalledOnce();
  });

  it("bounds redirect chains and releases every connection", async () => {
    network.fetch.mockImplementation(async () => new Response(null, { status: 302, headers: { location: "/again" } }));
    await expect(fetchListing("https://shop.example/bike")).rejects.toMatchObject({ code: "failed" });
    expect(network.fetch).toHaveBeenCalledTimes(4);
    expect(network.destroy).toHaveBeenCalledTimes(4);
  });

  it("releases the connection when fetching fails", async () => {
    network.fetch.mockRejectedValue(new Error("connection failed"));
    await expect(fetchListing("https://shop.example/bike")).rejects.toThrow("connection failed");
    expect(network.destroy).toHaveBeenCalledOnce();
  });
});
