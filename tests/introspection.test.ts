import { describe, expect, it } from "vitest";
import {
  Attribute,
  Entity,
  Field,
  Key,
  TSType,
  describeClass,
  fieldAnnotation,
} from "../src";

@Entity({ name: "customer" })
class CustomerForIntrospection {
  constructor() {
    throw new Error("constructor must not run during schema discovery");
  }

  @Field(TSType.Value, String)
  @Key()
  id!: string;

  @Field(TSType.Value, String)
  @Attribute()
  displayName!: string;
}

describe("describeClass", () => {
  it("discovers schema and semantic metadata without invoking the constructor", () => {
    const description = describeClass(CustomerForIntrospection);

    expect(description.name).toBe("CustomerForIntrospection");
    expect(Object.keys(description.fields)).toEqual(["id", "displayName"]);
    expect(description.fields.id.schema.fieldType).toBe(TSType.Value);
    expect(description.fields.id.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ namespace: "er", name: "key", value: true }),
      ])
    );
    expect(description.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          namespace: "er",
          name: "entity",
          value: { name: "customer" },
        }),
      ])
    );
  });

  it("discovers modern decorator metadata before any initializer runs", () => {
    const symbolObject = Symbol as any;
    const previousMetadataSymbol = symbolObject.metadata;
    const metadataSymbol = Symbol("test.metadata");
    symbolObject.metadata = metadataSymbol;

    try {
      class ModernLike {}
      const metadata: Record<PropertyKey, unknown> = {};
      const initializers: Array<() => void> = [];
      const context = {
        kind: "field",
        name: "value",
        metadata,
        addInitializer(fn: () => void) {
          initializers.push(fn);
        },
      };

      Field(TSType.Value, String)(undefined, context);
      fieldAnnotation("test", "marker", "yes")(undefined, context);
      (ModernLike as any)[metadataSymbol] = metadata;

      const description = describeClass(ModernLike);

      expect(initializers).toHaveLength(2);
      expect(description.fields.value.schema.fieldType).toBe(TSType.Value);
      expect(description.fields.value.annotations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ namespace: "test", name: "marker", value: "yes" }),
        ])
      );
    } finally {
      if (previousMetadataSymbol === undefined) {
        delete symbolObject.metadata;
      } else {
        symbolObject.metadata = previousMetadataSymbol;
      }
    }
  });

});
