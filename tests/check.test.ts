import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { checkWork } from "../src/check.ts";

const root = join(import.meta.dir, "..");

test("mystery-fixture passes with zero errors", () => {
  const result = checkWork(join(root, "works/mystery-fixture"));
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
});

describe("broken fixtures", () => {
  test("missing scene file", () => {
    const result = checkWork(join(root, "tests/fixtures/missing-scene"));
    expect(result.ok).toBe(false);
    const issue = result.errors.find((item) => item.file === "story/missing.json");
    expect(issue).toBeDefined();
    expect(issue?.work).toBe("missing-scene");
    expect(issue?.message).toContain("missing file");
  });

  test("jump to an unknown scene", () => {
    const result = checkWork(join(root, "tests/fixtures/bad-jump"));
    expect(result.ok).toBe(false);
    const issue = result.errors.find((item) => item.instruction === 0);
    expect(issue?.work).toBe("bad-jump");
    expect(issue?.scene).toBe("hall");
    expect(issue?.message).toContain("nowhere");
  });

  test("set of an undeclared variable", () => {
    const result = checkWork(join(root, "tests/fixtures/undeclared-var"));
    expect(result.ok).toBe(false);
    const issue = result.errors.find((item) => item.instruction === 0);
    expect(issue?.work).toBe("undeclared-var");
    expect(issue?.scene).toBe("room");
    expect(issue?.message).toContain("ghost");
  });

  test("background asset that is not approved", () => {
    const result = checkWork(join(root, "tests/fixtures/unapproved-asset"));
    expect(result.ok).toBe(false);
    const issue = result.errors.find((item) => item.instruction === 0);
    expect(issue?.work).toBe("unapproved-asset");
    expect(issue?.scene).toBe("hall");
    expect(issue?.message).toContain("bg-secret");
  });

  test("set value type does not match the declared variable", () => {
    const result = checkWork(join(root, "tests/fixtures/set-type-mismatch"));
    expect(result.ok).toBe(false);
    const issue = result.errors.find((item) => item.instruction === 0);
    expect(issue?.work).toBe("set-type-mismatch");
    expect(issue?.scene).toBe("room");
    expect(issue?.message).toContain("locked");
    expect(issue?.message).toContain("boolean");
  });
});
