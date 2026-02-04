import { describe, it, expect } from "vitest";
import { createInstance } from "../src";
import { TSType } from "../src";
import { TSField } from "../src";
import { RIFTError } from "../src/utils/errors";

// ---------- Example Classes ----------

class Address {
  street = new TSField(TSType.Value) as any;
  city = new TSField(TSType.Value) as any;
}

class User {
  name = new TSField(TSType.Value) as any;
  age = new TSField(TSType.Value) as any;
  address = new TSField(TSType.Object, Address) as any;
}

class Form {
  id = new TSField(TSType.Value) as any;
  title = new TSField(TSType.Value) as any;
  users = new TSField(TSType.Array, User) as any;
}

// ---------- Tests ----------

describe("createInstance", () => {

  it("creates instance using explicit instantiator function", () => {
    const input = { name: "Liam", age: 30, address: { street: "Rift Rd", city: "Sydney" } };
    const user = createInstance(input, (d) => new User());
    expect(user).toBeInstanceOf(User);
    expect(user.name).toBe("Liam");
    expect(user.address.city).toBe("Sydney");
  });

  it("creates instance using constructor directly", () => {
    const input = { name: "Liam", age: 30, address: { street: "Rift Rd", city: "Sydney" } };
    const user = createInstance(input, User);
    expect(user).toBeInstanceOf(User);
    expect(user.address).toBeInstanceOf(Address);
    expect(user.address.street).toBe("Rift Rd");
  });

  it("creates nested arrays of objects", () => {
    const data = {
      id: 1,
      title: "Form A",
      users: [
        { name: "Alice", age: 25, address: { street: "1 Road", city: "Townsville" } },
        { name: "Bob", age: 40, address: { street: "2 Street", city: "Melbourne" } }
      ]
    };
    const form = createInstance(data, Form);
    expect(form).toBeInstanceOf(Form);
    expect(form.users.length).toBe(2);
    expect(form.users[0]).toBeInstanceOf(User);
    expect(form.users[0].address.city).toBe("Townsville");
  });

  it("throws if required field is missing", () => {
    const data = { name: "NoAge" };
    expect(() => createInstance(data, User)).toThrow(RIFTError);
  });

  it("throws if array field is not an array", () => {
    const data = {
      id: 5,
      title: "Broken",
      users: { name: "Invalid", age: 10, address: { street: "A", city: "B" } }
    };
    expect(() => createInstance(data, Form)).toThrow(RIFTError);
  });

  it("handles optional fields marked as not required", () => {
    class OptionalExample {
      always = new TSField(TSType.Value) as any;
      maybe = new TSField(TSType.Value, null, false) as any;
    }
    const data = { always: "present" };
    const inst = createInstance(data, OptionalExample);
    expect(inst.always).toBe("present");
    expect(inst.maybe).toBeNull();
  });

  it("throws if createInstance is called on a Value field", () => {
    const field = new TSField(TSType.Value);
    expect(() => createInstance({ x: 1 }, null, field)).toThrow(RIFTError);
  });

});
