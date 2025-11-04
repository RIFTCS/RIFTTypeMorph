import { describe, it, expect } from "vitest";
import { createInstance } from "../src/core/createInstance";
import { TSField } from "../src/core/TSField";
import { TSType } from "../src/core/TSType";
import { RIFTError } from "../src/utils/errors";

describe("createInstance - non-required and required field behavior", () => {

  class OptionalExample {
    requiredValue = new TSField(TSType.Value) as any;
    optionalValue = new TSField(TSType.Value, null, false) as any;
    optionalObject = new TSField(TSType.Object, () => new InnerOptional(), false) as any;
  }

  class InnerOptional {
    value = new TSField(TSType.Value) as any;
  }

  it("creates instance and sets missing optional fields to null", () => {
    const data = { requiredValue: "exists" };
    const instance = createInstance(data, OptionalExample);
    expect(instance.requiredValue).toBe("exists");
    expect(instance.optionalValue).toBeNull();
    expect(instance.optionalObject).toBeNull();
  });

  it("populates optional fields when provided in data", () => {
    const data = {
      requiredValue: "exists",
      optionalValue: "provided",
      optionalObject: { value: "nested" }
    };
    const instance = createInstance(data, OptionalExample);
    expect(instance.optionalValue).toBe("provided");
    expect(instance.optionalObject.value).toBe("nested");
  });

  it("throws when a required field is missing", () => {
    const data = { optionalValue: "exists" };
    expect(() => createInstance(data, OptionalExample)).toThrow(RIFTError);
  });

  it("handles explicit null in optional fields correctly", () => {
    const data = {
      requiredValue: "exists",
      optionalValue: null,
      optionalObject: null
    };
    const instance = createInstance(data, OptionalExample);
    expect(instance.optionalValue).toBeNull();
    expect(instance.optionalObject).toBeNull();
  });

  it("throws if an optional Object field is the wrong type", () => {
    const data = {
      requiredValue: "exists",
      optionalObject: "notAnObject"
    };
    expect(() => createInstance(data, OptionalExample)).toThrow(RIFTError);
  });
});
