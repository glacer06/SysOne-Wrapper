// Fixture contract test (testing.md, Fixtures): every fixture's response parses with the
// passthrough zod answer schemas, each answer has the type of the question asked, and each fixture
// records the openapi.json version of the committed contract snapshot. PR CI reads that version
// from the snapshot, so it needs no network. A newer live version fails the nightly contract watch
// until the fixtures are re-recorded.

import { readFileSync } from "node:fs";
import { KnownAnswer, SystemOneRequest, SystemOneResponse, isKnownAnswer } from "@sysone/core";
import { describe, expect, it } from "vitest";
import { loadBundledFixtures } from "./load.js";
import { systemOneCodeForStatus } from "./status-map.js";

const snapshot = JSON.parse(readFileSync(new URL("../../contract/typesafe-openapi.json", import.meta.url), "utf8")) as {
  info: { version: string };
  components: { schemas: { Question: { discriminator: { mapping: Record<string, string> } } } };
};
const fixtures = loadBundledFixtures();

describe("fixture contract", () => {
  it("the snapshot is TypeSafe's openapi.json with the three v1 question types", () => {
    expect(snapshot.info.version).toBe("0.2.0");
    expect(Object.keys(snapshot.components.schemas.Question.discriminator.mapping).sort()).toEqual(["choice", "noul", "score"]);
  });

  it.each(fixtures.map((f) => [`${f.provider}/${f.name}`, f] as const))("%s", (_name, f) => {
    expect(f.openapiVersion).toBe(snapshot.info.version);
    expect(SystemOneRequest.parse(f.request)).toEqual(f.request);
    if ("error" in f) {
      expect(systemOneCodeForStatus(f.error.status)).toMatch(/^(system_one_|model_)/);
      return;
    }
    const response = SystemOneResponse.parse(f.response);
    expect(Object.keys(response.answers).sort()).toEqual(Object.keys(f.request.questions).sort());
    for (const [qid, answer] of Object.entries(response.answers)) {
      expect(isKnownAnswer(answer)).toBe(true);
      KnownAnswer.parse(answer);
      expect(answer.type).toBe(f.request.questions[qid]?.type);
    }
    if (f.provider === "openrouter") {
      expect(response.id).toMatch(/^gen-/);
      expect(response.provider).toBe("TypeSafe");
      expect(response.usage.cost).toBeGreaterThan(0);
      expect(response.model.startsWith("typesafe/")).toBe(true);
    }
  });

  it("covers the testing.md minimum set", () => {
    const names = new Set(fixtures.map((f) => `${f.provider}/${f.name}`));
    for (const name of [
      "typesafe/noul-single",
      "typesafe/choice-single",
      "typesafe/score-single",
      "typesafe/multi-stage-1",
      "typesafe/multi-stage-2",
      "typesafe/choice-none-chosen",
      "typesafe/noul-near-half",
      "typesafe/alias-resolved",
      "typesafe/error-401",
      "typesafe/error-422",
      "typesafe/error-429",
      "typesafe/error-529",
      "openrouter/noul",
      "openrouter/choice",
      "openrouter/score",
      "openrouter/alias-latest",
      "openrouter/error-402",
      "typesafe/outage-503",
      "openrouter/outage-503",
    ]) {
      expect(names.has(name), name).toBe(true);
    }
    const alias = fixtures.find((f) => f.name === "alias-resolved");
    expect(alias !== undefined && "response" in alias && alias.request.model !== alias.response.model).toBe(true);
    const half = fixtures.find((f) => f.name === "noul-near-half");
    expect(half !== undefined && "response" in half && Math.abs((half.response.answers["is_urgent"] as { noul: number }).noul - 0.5) < 0.05).toBe(true);
    const none = fixtures.find((f) => f.name === "choice-none-chosen");
    expect(none !== undefined && "response" in none && (none.response.answers["department"] as { choice: string }).choice).toBe("none_of_these");
  });

  it("fixture keys are unique", async () => {
    const { fixtureKey } = await import("./fixture.js");
    const keys = fixtures.map((f) => fixtureKey(f.provider, f.request));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
