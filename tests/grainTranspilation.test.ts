import { describe, expect, it } from "vitest";
import {
  EffectiveAt,
  Entity,
  Field,
  Key,
  Measure,
  RevisionAt,
  ScalarType,
  TSType,
  inferGrainModel,
  transpileEntitiesToGrain,
} from "../src";

@Entity({ name: "shop" })
class Shop {
  @Field(TSType.Value, String)
  @Key()
  id!: string;
}

@Entity({ name: "price" })
class Price {
  @Field(TSType.Value, String)
  @Key()
  shop!: string;

  @Field(TSType.Value, Date)
  @EffectiveAt()
  when!: Date;

  @Field(TSType.Value, Number)
  @Measure({ operations: ["plus", "less"] })
  amount!: number;
}

@ScalarType({ literal: "number", ordered: true, operations: ["plus", "less"] })
class Money {
  constructor(public readonly cents: number) {}
}

@Entity()
class AccountBalance {
  @Field(TSType.Value, String)
  @Key()
  accountId!: string;

  @Field(TSType.Value, Date)
  @RevisionAt()
  revision!: Date;

  @Field(TSType.Value, Money)
  balance!: Money;
}

describe("Grain transpilation", () => {
  it("infers world events, fact identity, scalar comparison and arithmetic permissions", () => {
    const result = transpileEntitiesToGrain([Shop, Price], { title: "Pricing" });
    const price = result.model.entities.find((entity) => entity.entity === Price)!;

    expect(price.eventName).toBe("set price");
    expect(price.fields).toEqual(["shop", "when", "amount"]);
    expect(price.keys).toEqual(["shop"]);
    expect(price.temporal).toEqual({ kind: "effective", field: "when" });

    expect(price.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "identity", on: "made by world on shop, when" }),
        expect.objectContaining({ operation: "compare", on: "named set price on when with date" }),
        expect.objectContaining({ operation: "compare", on: "named set price on amount with number" }),
        expect.objectContaining({
          operation: "plus",
          on: "named set price on amount with number -> named set price",
        }),
        expect.objectContaining({
          operation: "less",
          on: "named set price on amount with number -> named set price",
        }),
      ])
    );

    expect(result.markdown).toContain("# Pricing");
    expect(result.markdown).toContain(
      "| set price | fields: add shop; add when; add amount | inferred from TypeMorph ER metadata |"
    );
    expect(result.markdown).toContain(
      "| identity | made by world on shop, when | inferred from TypeMorph ER metadata |"
    );
    expect(result.markdown).not.toContain("named set price on shop with text");
    expect(result.markdown).toContain("## Narrowing table");
    expect(result.markdown).toContain("## Rows");
  });

  it("uses class-level scalar semantics and revision coordinates", () => {
    const model = inferGrainModel([AccountBalance]);
    const balance = model.entities[0];

    expect(balance.entityName).toBe("account balance");
    expect(balance.eventName).toBe("set account balance");
    expect(balance.temporal).toEqual({ kind: "revision", field: "revision" });
    expect(balance.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "identity", on: "made by world on accountId, revision" }),
        expect.objectContaining({ operation: "compare", on: "named set account balance on revision with date" }),
        expect.objectContaining({ operation: "compare", on: "named set account balance on balance with number" }),
        expect.objectContaining({
          operation: "plus",
          on: "named set account balance on balance with number -> named set account balance",
        }),
        expect.objectContaining({
          operation: "less",
          on: "named set account balance on balance with number -> named set account balance",
        }),
      ])
    );
  });


  it("refuses to guess how nested TypeMorph objects map into Grain fields", () => {
    class Address {
      @Field(TSType.Value, String)
      street!: string;
    }

    @Entity()
    class CustomerWithAddress {
      @Field(TSType.Value, String)
      @Key()
      id!: string;

      @Field(TSType.Object, Address)
      address!: Address;
    }

    expect(() => inferGrainModel([CustomerWithAddress])).toThrow(
      /requires scalar TSType.Value fields/
    );
  });

  it("rejects ambiguous history semantics instead of guessing", () => {
    @Entity()
    class AmbiguousHistory {
      @Field(TSType.Value, String)
      @Key()
      id!: string;

      @Field(TSType.Value, Date)
      @EffectiveAt()
      validFrom!: Date;

      @Field(TSType.Value, Date)
      @RevisionAt()
      updatedAt!: Date;
    }

    expect(() => inferGrainModel([AmbiguousHistory])).toThrow(
      /cannot use both @EffectiveAt\(\) and @RevisionAt\(\)/
    );
  });
});
