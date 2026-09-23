import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BypassConstructor,
  cloneWith,
  createInstance,
  CustomSerialise,
  Field,
  Ignore,
  Include,
  OptionalField,
  serialiseInstance,
  TSField,
  TSType,
  validateInstance
} from "../src";

const coveredExampleIds = new Set([
  "public-api",
  "quick-start",
  "optional-default",
  "validation",
  "expando",
  "include-ignore",
  "custom-serialise",
  "bypass-constructor",
  "class-hooks",
  "clone-with",
  "legacy-tsfield"
]);

describe("README documentation contract", () => {
  it("has an explicit executable test for every documented TypeScript example", () => {
    const readme: string = fs.readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    const ids = Array.from(readme.matchAll(/<!--\s*readme-test:\s*([a-z0-9-]+)\s*-->/g)).map(
      (match) => match[1]
    );

    expect(ids.length).toBe(coveredExampleIds.size);
    expect(new Set(ids)).toEqual(coveredExampleIds);

    const typescriptBlocks = Array.from(readme.matchAll(/```ts\n/g)).length;
    expect(typescriptBlocks).toBe(coveredExampleIds.size);
  });
});

describe("README.md examples", () => {
  it("[README:public-api] exports the documented root API", () => {
    expect(BypassConstructor).toBeTypeOf("function");
    expect(cloneWith).toBeTypeOf("function");
    expect(createInstance).toBeTypeOf("function");
    expect(CustomSerialise).toBeTypeOf("function");
    expect(Field).toBeTypeOf("function");
    expect(Ignore).toBeTypeOf("function");
    expect(Include).toBeTypeOf("function");
    expect(OptionalField).toBeTypeOf("function");
    expect(serialiseInstance).toBeTypeOf("function");
    expect(TSField).toBeTypeOf("function");
    expect(TSType.Value).toBe(0);
    expect(validateInstance).toBeTypeOf("function");
  });
  it("[README:quick-start] hydrates nested annotated classes and serialises them", () => {
    class Address {
      @Field(TSType.Value)
      city!: string;
    }

    class User {
      @Field(TSType.Value)
      name!: string;

      @Field(TSType.Object, Address)
      address!: Address;

      @Field(TSType.Array, Address)
      previousAddresses!: Address[];
    }

    const data = {
      name: "Liam",
      address: { city: "Brisbane" },
      previousAddresses: [{ city: "Sydney" }]
    };

    const user = createInstance(data, User);

    expect(user).toBeInstanceOf(User);
    expect(user.address).toBeInstanceOf(Address);
    expect(user.previousAddresses[0]).toBeInstanceOf(Address);
    expect(serialiseInstance(user)).toEqual(data);
  });

  it("[README:optional-default] handles optional and defaulted fields", () => {
    class WorkItem {
      @Field(TSType.Value)
      id!: string;

      @OptionalField(TSType.Value)
      notes!: string | null;

      @OptionalField(TSType.Value, null, () => "draft")
      status!: string;
    }

    const item = createInstance({ id: "T-1" }, WorkItem);

    expect(item.notes).toBeNull();
    expect(item.status).toBe("draft");
  });

  it("[README:validation] collects all validation failures", () => {
    class Product {
      @Field(TSType.Value)
      sku!: string;

      @Field(TSType.Value)
      price!: number;
    }

    const result = validateInstance({}, Product);

    expect(result.valid).toBe(false);
    expect(result.instance).toBeInstanceOf(Product);
    expect(result.errors).toHaveLength(2);
  });

  it("[README:expando] captures and re-flattens unknown properties", () => {
    class Asset {
      @Field(TSType.Value)
      id!: string;

      @Field(TSType.Expando)
      extra!: Record<string, unknown>;
    }

    const asset = createInstance(
      { id: "A-1", colour: "blue", rank: 3 },
      Asset
    );

    expect(asset.extra).toEqual({ colour: "blue", rank: 3 });
    expect(serialiseInstance(asset, { flattenExpando: true })).toEqual({
      id: "A-1",
      colour: "blue",
      rank: 3
    });
  });

  it("[README:include-ignore] includes computed output and ignores runtime-only state", () => {
    class Person {
      @Field(TSType.Value)
      firstName = "Ada";

      @Field(TSType.Value)
      lastName = "Lovelace";

      @Ignore()
      cache = new Map<string, unknown>();

      @Include
      get displayName() {
        return `${this.firstName} ${this.lastName}`;
      }
    }

    expect(serialiseInstance(new Person())).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      displayName: "Ada Lovelace"
    });
  });

  it("[README:custom-serialise] round-trips a custom Date wire format", () => {
    class Event {
      @Field(TSType.Value, Date)
      @CustomSerialise<string, number>(
        value => new Date(value).getTime(),
        value => new Date(value).toISOString(),
        "number"
      )
      at!: Date;
    }

    const event = new Event();
    event.at = new Date(1000);

    const wire = serialiseInstance(event);
    expect(wire.at).toBe(1000);

    const restored = createInstance(wire, Event);
    expect(restored.at).toBeInstanceOf(Date);
    expect(restored.at.getTime()).toBe(1000);
  });

  it("[README:bypass-constructor] hydrates without running the constructor", () => {
    @BypassConstructor()
    class StoredCounter {
      static constructorCalls = 0;

      @Field(TSType.Value)
      value!: number;

      constructor() {
        StoredCounter.constructorCalls++;
      }

      double() {
        return this.value * 2;
      }
    }

    StoredCounter.constructorCalls = 0;
    const counter = createInstance({ value: 21 }, StoredCounter);

    expect(StoredCounter.constructorCalls).toBe(0);
    expect(counter).toBeInstanceOf(StoredCounter);
    expect(counter.double()).toBe(42);
  });

  it("[README:class-hooks] uses class-level serialise and deserialise hooks", () => {
    class Percentage {
      @Field(TSType.Value)
      value!: number;

      static serialise(instance: Percentage) {
        return { percent: instance.value * 100 };
      }

      static deserialise(data: { percent: number }) {
        const result = new Percentage();
        result.value = data.percent / 100;
        return result;
      }
    }

    const percentage = createInstance({ percent: 25 }, Percentage);
    expect(percentage.value).toBe(0.25);
    expect(serialiseInstance(percentage)).toEqual({ percent: 25 });
  });

  it("[README:clone-with] creates a validated changed copy", () => {
    class Settings {
      @Field(TSType.Value)
      theme = "light";

      @Field(TSType.Value)
      pageSize = 25;
    }

    const original = new Settings();
    const updated = cloneWith(original, { pageSize: 50 });

    expect(updated).toBeInstanceOf(Settings);
    expect(updated).not.toBe(original);
    expect(updated.theme).toBe("light");
    expect(updated.pageSize).toBe(50);
  });

  it("[README:legacy-tsfield] preserves the legacy TSField property schema", () => {
    class LegacyUser {
      name = new TSField(TSType.Value) as any;
      age = new TSField(TSType.Value) as any;
    }

    const user = createInstance(
      { name: "Grace", age: 37 },
      LegacyUser
    );

    expect(user).toBeInstanceOf(LegacyUser);
    expect(user.name).toBe("Grace");
    expect(user.age).toBe(37);
  });
});
