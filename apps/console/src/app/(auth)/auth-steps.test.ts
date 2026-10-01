import { describe, expect, it } from "vitest";

import { authRail } from "./auth-steps";

const states = (path: string, backup = false) => authRail(path, backup).steps.map((s) => `${s.id}:${s.state}`);

describe("the sign-in rail", () => {
  it("lists the whole path in order on every page", () => {
    for (const path of ["/sign-in", "/two-factor", "/setup-two-factor", "/reset-password", "/no-access"]) {
      expect(authRail(path).steps.map((s) => s.id)).toEqual(["password", "two-factor", "backup"]);
    }
  });

  it("marks the step each page holds as the one current node", () => {
    expect(states("/sign-in")).toEqual(["password:current", "two-factor:ahead", "backup:ahead"]);
    expect(states("/two-factor")).toEqual(["password:passed", "two-factor:current", "backup:ahead"]);
    expect(states("/setup-two-factor")).toEqual(["password:passed", "two-factor:current", "backup:ahead"]);
    expect(states("/reset-password")).toEqual(["password:current", "two-factor:ahead", "backup:ahead"]);
  });

  it("points at backup codes while the two-factor form takes one", () => {
    expect(states("/two-factor", true)).toEqual(["password:passed", "two-factor:ahead", "backup:current"]);
    // Only the two-factor page has a backup mode.
    expect(states("/sign-in", true)).toEqual(states("/sign-in"));
  });

  it("has no current node when sign-in worked but the account has no access", () => {
    expect(authRail("/no-access").steps.some((s) => s.state === "current")).toBe(false);
  });
});
