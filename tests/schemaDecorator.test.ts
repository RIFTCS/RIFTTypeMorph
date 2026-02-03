import { describe, it, expect } from "vitest";
import { Field, getSchemaFields } from "../src/decorators/schemaDecorator";
import { TSType } from "../src";

class Person {
  @Field(TSType.Value)
  name!: string;

  @Field(TSType.Value, null, false)
  nickname?: string;
}

describe("schemaDecorators", () => {
  it("should attach TSField metadata", () => {
    const person = new Person();
    const fields = getSchemaFields(person);
    expect(Object.keys(fields)).toContain("name");
    expect(fields.name.fieldType).toBe(TSType.Value);
  });
});
