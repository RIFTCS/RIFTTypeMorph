import { describe, it, expect } from "vitest";
import { createInstance, TSField, TSType } from "../src";
import { RIFTError } from "../src/utils/errors";
import { single, singleOrNull } from "../src/utils/helpers";
import { Field } from "../src/decorators/schemaDecorator";

// ------------------------------
// 1 Basic Example
// ------------------------------

class UserBasic {
  name = new TSField(TSType.Value) as any;
  email = new TSField(TSType.Value) as any;
  age = new TSField(TSType.Value) as any;
}

// ------------------------------
// 2 Nested Objects and Arrays
// ------------------------------

class Entry {
  id = new TSField(TSType.Value) as any;
  value = new TSField(TSType.Value) as any;
}

class Form {
  id = new TSField(TSType.Value) as any;
  name = new TSField(TSType.Value) as any;
  entries = new TSField(TSType.Array, Entry) as any;
}

// ------------------------------
// 3 Advanced Initializer Example
// ------------------------------

class ComplexData {
  info = new TSField(TSType.Value) as any;
}

class Custom {
  id = new TSField(TSType.Value) as any;
  data = new TSField(TSType.Object, (d) => new ComplexData()) as any;
}

// ------------------------------
// 4 Decorator Syntax
// ------------------------------

class Address {
  @Field(TSType.Value)
  street!: string;

  @Field(TSType.Value)
  city!: string;
}

class UserDecorated {
  @Field(TSType.Value)
  name!: string;

  @Field(TSType.Object, Address)
  address!: Address;
}

// ------------------------------
// 5 Validation Example
// ------------------------------

class Product {
  id = new TSField(TSType.Value) as any;
  name = new TSField(TSType.Value) as any;
  price = new TSField(TSType.Value) as any;
}

// ------------------------------
// 6 Utility Helpers
// ------------------------------

describe("README.md examples", () => {
  it("Basic constructor-based usage works", () => {
    const json = { name: "Liam", email: "liam@riftcs.com", age: 29 };
    const user = createInstance(json, UserBasic);
    expect(user).toBeInstanceOf(UserBasic);
    expect(user.name).toBe("Liam");
    expect(user.email).toBe("liam@riftcs.com");
    expect(user.age).toBe(29);

    const serialized = JSON.parse(JSON.stringify(user));
    expect(serialized).toStrictEqual(json);
  });

  it("Nested objects and arrays deserialize correctly", () => {
    const data = {
      id: 1,
      name: "Customer Survey",
      entries: [
        { id: "q1", value: "Yes" },
        { id: "q2", value: "No" }
      ]
    };
    const form = createInstance(data, Form);

    expect(form).toBeInstanceOf(Form);
    expect(form.entries.length).toBe(2);
    expect(form.entries[0]).toBeInstanceOf(Entry);
    expect(form.entries[0].id).toBe("q1");

    const serialized = JSON.parse(JSON.stringify(form));
    expect(serialized).toStrictEqual(data);
  });

  it("Advanced initializer creates nested instances", () => {
    const json = { id: "custom-1", data: { info: "created via factory" } };
    const instance = createInstance(json, Custom);

    expect(instance).toBeInstanceOf(Custom);
    expect(instance.data).toBeInstanceOf(ComplexData);
    expect(instance.data.info).toBe("created via factory");

    const serialized = JSON.parse(JSON.stringify(instance));
    expect(serialized).toStrictEqual(json);
  });

  it("Decorator syntax works with nested objects", () => {
    const json = {
      name: "Liam",
      address: { street: "100 Rift Lane", city: "Sydney" }
    };
    const user = createInstance(json, UserDecorated);

    expect(user).toBeInstanceOf(UserDecorated);
    expect(user.address).toBeInstanceOf(Address);
    expect(user.address.street).toBe("100 Rift Lane");

    const serialized = JSON.parse(JSON.stringify(user));
    expect(serialized).toStrictEqual(json);
  });

  it("Validation throws descriptive errors for missing required fields", () => {
    const invalid = { id: "SKU-1001", name: "Rift Device" };
    expect(() => createInstance(invalid, Product)).toThrow(RIFTError);
  });

  it("Utility helpers behave as documented", () => {
    expect(single([5], "single value")).toBe(5);
    expect(singleOrNull([], "optional value")).toBeNull();
    expect(() => single([1, 2], "too many")).toThrow(Error);
  });

  it("End-to-end round-trip from README examples", () => {
    const data = {
      name: "Liam",
      email: "liam@riftcs.com",
      age: 29
    };
    const user = createInstance(data, UserBasic);
    const json = JSON.parse(JSON.stringify(user));
    expect(json).toStrictEqual(data);
  });
});
