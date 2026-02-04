import { describe, it, expect } from "vitest";
import { Field, getSchemaFields } from "../src/decorators/schemaDecorator";
import { TSType } from "../src";
import { TSField } from "../src";

describe("Field decorator compatibility", () => {
  it("attaches metadata under legacy decorator semantics", () => {
    class LegacyTest {
      @Field(TSType.Value)
      name!: string;

      @Field(TSType.Object)
      obj!: any;
    }

    const inst = new LegacyTest();
    const fields = getSchemaFields(inst);

    expect(fields).toBeDefined();
    expect(fields.name).toBeInstanceOf(TSField);
    expect(fields.name.fieldType).toBe(TSType.Value);
    expect(fields.obj.fieldType).toBe(TSType.Object);
  });

  it("attaches metadata under modern decorator semantics (simulated)", () => {
    // Simulate the shape that modern TS decorators call:
    // The function is called with (value, context)
    const calls: any[] = [];

    const decorator = Field(TSType.Value);
    const mockContext = {
      kind: "field",
      name: "example",
      addInitializer(fn: any) {
        calls.push(fn);
      },
    };

    // Simulate how TS 5.6+ applies a decorator
    decorator(undefined, mockContext);

    // Create a mock class instance to run the initializer on
    class Example {}
    const inst = new Example();

    // Run all deferred initializers
    for (const init of calls) {
      init.call(inst);
    }

    const proto = Object.getPrototypeOf(inst);
    expect(proto.__schemaFields).toBeDefined();
    expect(proto.__schemaFields.example).toBeInstanceOf(TSField);
    expect(proto.__schemaFields.example.fieldType).toBe(TSType.Value);
  });
});
