import { describe, it, expect } from "vitest";
import { TSType } from "../src";
import { TSField } from "../src";
import { createInstance } from "../src";
import { validateInstance } from "../src/core/validateInstance";
import { RIFTError } from "../src/utils/errors";

describe("validateInstance - multi-error collection", () => {

  class Address {
    street = new TSField(TSType.Value) as any;
    city = new TSField(TSType.Value) as any;
    zip = new TSField(TSType.Value) as any;
  }

  class User {
    id = new TSField(TSType.Value) as any;
    name = new TSField(TSType.Value) as any;
    address = new TSField(TSType.Object, Address) as any;
  }

  it("collectErrors=false (default) should throw on first failure", () => {
    const data = {
      id: "123",
      // missing name
      address: {
        // missing street, city, zip
      }
    };

    expect(() => createInstance(data, User, null, "root", { collectErrors: false })).toThrow(RIFTError);
  });

  it("collectErrors=true should capture all field-level failures", () => {
    const data = {
      id: "123",
      // missing name
      address: {
        // missing street, city, zip
      }
    };

    const { instance, errors } = createInstance(data, User, null, "root", { collectErrors: true });

    if(instance == null){
        throw Error();
    }

    // instance should be created (partially populated)
    expect(instance).toBeInstanceOf(User);
    expect(instance.id).toBe("123");
    expect(instance.name).toBeNull();
    expect(instance.address).toBeInstanceOf(Address);

    // address fields are null because of missing properties
    expect(instance.address.street).toBeNull();
    expect(instance.address.city).toBeNull();
    expect(instance.address.zip).toBeNull();

    // all missing fields should have produced errors
    const messages = errors.map(e => e.message);
    expect(messages).toContain("[root] Missing required property: name");
    expect(messages).toContain("[root.address] Missing required property: street");
    expect(messages).toContain("[root.address] Missing required property: city");
    expect(messages).toContain("[root.address] Missing required property: zip");

    // total number of errors (1 for name + 3 for address fields)
    expect(errors.length).toBe(4);
  });

  it("validateInstance should return all accumulated validation errors", () => {
    const data = {
      id: "123",
      address: {}
    };

    const result = validateInstance(data, User);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(4);

    const contexts = result.errors.map(e => e.context);
    expect(contexts).toContain("root");
    expect(contexts).toContain("root.address");

    const messages = result.errors.map(e => e.message);
    expect(messages.some(m => m.includes("Missing required property: name"))).toBe(true);
  });
});
