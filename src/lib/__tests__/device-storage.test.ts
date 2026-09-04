import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GALLEY_QUEUE_KEY, GANGWAY_QUEUE_KEY, GANGWAY_ROSTER_PREFIX,
  adoptLegacyDeviceStorage, clearCachedRosters, unflushedCount,
} from "@/lib/device-storage";

/* A Storage stand-in whose entries are own enumerable properties, because the
   module walks Object.keys(localStorage) the way a browser's Storage allows. */
function fakeStorage(): Storage {
  const s: Record<string, string> = {};
  const api = {
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null),
    setItem: (k: string, v: string) => { s[k] = String(v); },
    removeItem: (k: string) => { delete s[k]; },
    clear: () => { for (const k of Object.keys(s)) delete s[k]; },
    key: (i: number) => Object.keys(s)[i] ?? null,
    get length() { return Object.keys(s).length; },
  };
  for (const [k, v] of Object.entries(Object.getOwnPropertyDescriptors(api))) Object.defineProperty(s, k, { ...v, enumerable: false });
  return s as unknown as Storage;
}

let store: Storage;
beforeEach(() => {
  store = fakeStorage();
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true, writable: true });
});
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe("adoptLegacyDeviceStorage", () => {
  it("carries queues forward from BOTH earlier eras and appends, never overwrites", () => {
    store.setItem(GANGWAY_QUEUE_KEY, JSON.stringify([{ code: "UN-1" }]));
    store.setItem("syrius-gangway-queue", JSON.stringify([{ code: "SYR-2" }]));
    store.setItem("lyre-gangway-queue", JSON.stringify([{ code: "LS-3" }]));
    store.setItem("lyre-galley-queue", JSON.stringify([{ item: "rum" }]));
    adoptLegacyDeviceStorage();
    expect(JSON.parse(store.getItem(GANGWAY_QUEUE_KEY)!).map((q: { code: string }) => q.code)).toEqual(["UN-1", "SYR-2", "LS-3"]);
    expect(JSON.parse(store.getItem(GALLEY_QUEUE_KEY)!)).toEqual([{ item: "rum" }]);
    expect(store.getItem("syrius-gangway-queue")).toBeNull();
    expect(store.getItem("lyre-gangway-queue")).toBeNull();
    expect(store.getItem("lyre-galley-queue")).toBeNull();
  });
  it("leaves a blob it cannot read exactly where it is, and carries on to the next", () => {
    store.setItem("syrius-gangway-queue", "{not json");
    store.setItem("lyre-gangway-queue", JSON.stringify([{ code: "LS-3" }]));
    store.setItem("syrius-galley-queue", JSON.stringify({ not: "an array" }));
    adoptLegacyDeviceStorage();
    expect(store.getItem("syrius-gangway-queue")).toBe("{not json");
    expect(store.getItem("syrius-galley-queue")).toBe(JSON.stringify({ not: "an array" }));
    expect(JSON.parse(store.getItem(GANGWAY_QUEUE_KEY)!)).toEqual([{ code: "LS-3" }]);
    expect(store.getItem("lyre-gangway-queue")).toBeNull();
  });
  it("drops rosters — names and live boarding codes — from both earlier eras", () => {
    store.setItem("syrius-gangway-roster:e1", "[]");
    store.setItem("lyre-gangway-roster:e2", "[]");
    store.setItem(`${GANGWAY_ROSTER_PREFIX}e3`, "[]");
    adoptLegacyDeviceStorage();
    expect(store.getItem("syrius-gangway-roster:e1")).toBeNull();
    expect(store.getItem("lyre-gangway-roster:e2")).toBeNull();
    expect(store.getItem(`${GANGWAY_ROSTER_PREFIX}e3`)).toBe("[]");
  });
});

describe("unflushedCount", () => {
  it("counts unsent work under every era's key", () => {
    store.setItem(GANGWAY_QUEUE_KEY, JSON.stringify([1, 2]));
    store.setItem("lyre-gangway-queue", JSON.stringify([3]));
    store.setItem("syrius-galley-queue", JSON.stringify([4, 5, 6]));
    expect(unflushedCount()).toBe(6);
  });
  it("an unreadable key counts as one — the operator is asked, never told zero", () => {
    store.setItem(GANGWAY_QUEUE_KEY, "{truncated");
    store.setItem("lyre-gangway-queue", JSON.stringify([1, 2]));
    expect(unflushedCount()).toBe(3);
  });
  it("is zero with nothing waiting", () => {
    store.setItem(GANGWAY_QUEUE_KEY, "[]");
    expect(unflushedCount()).toBe(0);
  });
});

describe("clearCachedRosters", () => {
  it("removes rosters of every era and nothing else, and says how many", () => {
    store.setItem(`${GANGWAY_ROSTER_PREFIX}e1`, "[]");
    store.setItem("syrius-gangway-roster:e2", "[]");
    store.setItem("lyre-gangway-roster:e3", "[]");
    store.setItem(GANGWAY_QUEUE_KEY, "[1]");
    expect(clearCachedRosters()).toBe(3);
    expect(store.getItem(GANGWAY_QUEUE_KEY)).toBe("[1]");
    expect(Object.keys(store)).toEqual([GANGWAY_QUEUE_KEY]);
  });
});
