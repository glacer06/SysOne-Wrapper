import { describe, expect, it } from "vitest";

import { describeMove, needsConfirm, widensActing } from "../sets/[ref]/releases/stages";
import { operationLabel, riskReason, timeLeft } from "./describe";

describe("riskReason", () => {
  it("names the condition that gated a publish", () => {
    const live = { protected: false, stages: { production: "controlled" as const } };
    expect(riskReason("set.publish", { ref: "a", channel: "production" }, live)).toBe(
      "Production is Controlled, so the new version acts on live decisions as soon as it is published.",
    );
    expect(riskReason("set.publish", { channel: "production" }, { protected: true, stages: {} })).toContain("protected");
    expect(riskReason("set.publish", { skipExperiment: { reason: "x" } }, live)).toContain("skips the champion");
  });

  it("tells a lifted pause from a widened rollout", () => {
    const paused = { protected: false, stages: { production: "paused" as const } };
    expect(riskReason("rollout.change", { channel: "production", stage: "shadow" }, paused)).toBe("It lifts the pause on production.");
    expect(riskReason("rollout.change", { channel: "staging", stage: "full" }, null)).toContain("staging to Full");
    expect(riskReason("member.remove", {}, null)).toBe("Agents need a person to approve this operation.");
    expect(operationLabel("rollout.change")).toBe("Change the rollout stage");
    expect(operationLabel("member.remove")).toBe("member.remove");
  });
});

describe("stage moves", () => {
  it("asks before a move that lets decisions act, or out of a pause, and never before a move toward safety", () => {
    expect(needsConfirm("shadow", "controlled")).toBe(true);
    expect(needsConfirm("controlled", "full")).toBe(true);
    expect(needsConfirm("paused", "shadow")).toBe(true);
    expect(needsConfirm("full", "controlled")).toBe(false);
    expect(needsConfirm("controlled", "shadow")).toBe(false);
    expect(needsConfirm("shadow", "paused")).toBe(false);
    expect(widensActing("paused", "shadow")).toBe(false);
    expect(widensActing("paused", "full")).toBe(true);
  });

  it("says what changes and what it needs", () => {
    const lines = describeMove("production", "controlled", "full");
    expect(lines[0]).toBe("production moves from Controlled to Full.");
    expect(lines).toContain("Entering full needs the admin role.");
    expect(lines.at(-1)).toContain("Pause or roll back at any time");
  });
});

describe("timeLeft", () => {
  const now = new Date("2026-10-01T07:00:00Z");
  it("reads in the largest whole unit", () => {
    expect(timeLeft("2026-10-08T07:00:00Z", now)).toBe("in 7 days");
    expect(timeLeft("2026-10-01T10:30:00Z", now)).toBe("in 3 hours");
    expect(timeLeft("2026-10-01T07:12:00Z", now)).toBe("in 12 minutes");
    expect(timeLeft("2026-10-01T06:00:00Z", now)).toBe("now");
  });
});
