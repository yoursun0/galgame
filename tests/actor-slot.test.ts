import { describe, expect, test } from "bun:test";
import { DUAL_ACTOR, slotsForActors } from "../src/stage.ts";

const themeActors = {
  near: { heightPercent: 108, bottomPercent: 0 },
  far: { heightPercent: 52, bottomPercent: 8 },
};

describe("dual actor slots (#93)", () => {
  test("single near keeps the theme height and the left inset", () => {
    const slots = slotsForActors(themeActors, 1, 0);
    expect(slots.dual).toBe(false);
    expect(slots.near).toEqual({ heightPercent: 108, bottomPercent: 0, edgePercent: 6 });
    expect(slots.near.maxWidthPercent).toBeUndefined();
  });

  test("single far keeps the small theme box", () => {
    const slots = slotsForActors(themeActors, 0, 1);
    expect(slots.dual).toBe(false);
    expect(slots.far).toEqual({ heightPercent: 52, bottomPercent: 8, edgePercent: 8 });
  });

  test("two nears without a far stay on the single-actor layout", () => {
    const slots = slotsForActors(themeActors, 2, 0);
    expect(slots.dual).toBe(false);
    expect(slots.near.heightPercent).toBe(108);
  });

  test("dual puts near and far in opposite halves", () => {
    const slots = slotsForActors(themeActors, 1, 1);
    expect(slots.dual).toBe(true);
    expect(slots.near.heightPercent).toBe(DUAL_ACTOR.nearHeightPercent);
    expect(slots.near.bottomPercent).toBe(0);
    expect(slots.near.edgePercent).toBeGreaterThanOrEqual(2);
    expect(slots.near.edgePercent).toBeLessThanOrEqual(4);
    expect(slots.far.heightPercent).toBeGreaterThanOrEqual(82);
    expect(slots.far.heightPercent).toBeLessThanOrEqual(86);
    expect(slots.far.bottomPercent).toBeGreaterThanOrEqual(4);
    expect(slots.far.bottomPercent).toBeLessThanOrEqual(6);
    expect(slots.far.edgePercent).toBeGreaterThanOrEqual(2);
    expect(slots.far.edgePercent).toBeLessThanOrEqual(4);
    expect(slots.near.maxWidthPercent).toBeGreaterThanOrEqual(46);
    expect(slots.near.maxWidthPercent).toBeLessThanOrEqual(48);
    expect(slots.far.maxWidthPercent).toBe(slots.near.maxWidthPercent);
    expect(slots.near.edgePercent + (slots.near.maxWidthPercent ?? 100)).toBeLessThanOrEqual(50);
    expect(slots.far.edgePercent + (slots.far.maxWidthPercent ?? 100)).toBeLessThanOrEqual(50);
    expect(DUAL_ACTOR.farZ).toBeGreaterThanOrEqual(2);
    expect(DUAL_ACTOR.nearZ).toBeGreaterThan(DUAL_ACTOR.farZ);
  });
});
