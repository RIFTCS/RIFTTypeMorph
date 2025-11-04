import { describe, it, expect } from "vitest";
import { single, singleOrNull } from "../src/utils/helpers";

describe("elementCheckers", () => {
  it("should return single element", () => {
    const result = single([1], "test");
    expect(result).toBe(1);
  });

  it("should return null for empty array in singleOrNull", () => {
    const result = singleOrNull([], "test");
    expect(result).toBeNull();
  });
});
