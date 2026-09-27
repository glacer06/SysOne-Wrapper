import { describe, expect, it } from "vitest";
import { casesForSnapshot, parseDataset, takeSnapshot } from "./dataset.js";
import { createFolderEvalStore, stableUuid } from "./store.js";
import { DEFAULT_DATA_DIR } from "./cli.js";

describe("datasets", () => {
  it("parses JSON Lines and JSON arrays, and derives ids from the state", () => {
    const lines = parseDataset("d", '{"state":{"a":1},"expected":{"q":true}}\n\n{"id":"x","state":"s","expected":{"q":false},"tags":["t"],"split":"test"}\n');
    expect(lines.cases).toHaveLength(2);
    expect(lines.cases[0]?.id).toMatch(/^case_[0-9a-f]{16}$/);
    expect(lines.cases[1]).toEqual({ id: "x", state: "s", expected: { q: false }, tags: ["t"], split: "test" });
    const arr = parseDataset("d", '[{"state":1,"expected":{}}]');
    expect(arr.cases).toHaveLength(1);
  });

  it("names the bad line", () => {
    expect(() => parseDataset("d", '{"state":1,"expected":{}}\nnot json')).toThrow("line 2");
    expect(() => parseDataset("d", '{"state":1}')).toThrow("case 1: expected");
    expect(() => parseDataset("d", '{"id":"a","state":1,"expected":{}}\n{"id":"a","state":2,"expected":{}}')).toThrow("used twice");
  });

  it("snapshots freeze case ids and detect a changed case", () => {
    const d = parseDataset("d", '{"id":"b","state":1,"expected":{"q":1}}\n{"id":"a","state":2,"expected":{"q":2}}');
    const snap = takeSnapshot(d, "s1", "2026-09-27T00:00:00.000Z");
    expect(snap.caseIds).toEqual(["a", "b"]);
    expect(casesForSnapshot(d, snap).map((c) => c.id)).toEqual(["a", "b"]);
    const relabeled = parseDataset("d", '{"id":"b","state":1,"expected":{"q":0}}\n{"id":"a","state":2,"expected":{"q":2}}');
    expect(() => casesForSnapshot(relabeled, snap)).toThrow("changed");
    const shrunk = parseDataset("d", '{"id":"b","state":1,"expected":{"q":1}}');
    expect(() => casesForSnapshot(shrunk, snap)).toThrow("no longer");
    expect(() => casesForSnapshot({ ...d, name: "other" }, snap)).toThrow("belongs to");
  });
});

describe("folder store", () => {
  it("reads the demo set and dataset, and refuses paths that are not slugs", async () => {
    const store = createFolderEvalStore(DEFAULT_DATA_DIR);
    const v = await store.getVersion("demo", "ticket-routing", 1);
    expect(v?.spec.model).toBe("jev-1.13.0");
    expect(v?.setId).toBe(stableUuid("set:demo/ticket-routing"));
    expect(await store.getVersion("demo", "ticket-routing", 2)).toBeNull();
    expect((await store.getDataset("demo", "tickets"))?.cases).toHaveLength(12);
    expect(await store.getDataset("demo", "nope")).toBeNull();
    await expect(store.getVersion("../etc", "x", 1)).rejects.toThrow("must be a slug");
  });

  it("stable ids are uuid shaped", () => {
    expect(stableUuid("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
