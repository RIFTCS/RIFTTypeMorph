import { describe, expect, it } from "vitest";
import {
  AppliesTo,
  EffectiveAt,
  Entity,
  Field,
  Key,
  Measure,
  Reference,
  ScalarType,
  TSType,
  describeClass,
  inferGrainModel,
  transpileEntitiesToGrain,
} from "../src";

@Entity({ name: "store" })
class Store {
  @Field(TSType.Value, String)
  @Key()
  id!: string;
}

@Entity({ name: "item" })
class Item {
  @Field(TSType.Value, String)
  @Key()
  id!: string;
}

@Entity({ name: "purchaser" })
class Purchaser {
  @Field(TSType.Value, String)
  @Key()
  id!: string;
}

@ScalarType({ literal: "number", ordered: true, operations: ["plus", "less"] })
class Money {
  constructor(public readonly cents: number) {}
}

@Entity({ name: "stock" })
class Stock {
  @Field(TSType.Value, String)
  @Reference(Store)
  @Key()
  storeId!: string;

  @Field(TSType.Value, String)
  @Reference(Item)
  @Key()
  itemId!: string;

  @Field(TSType.Value, Date)
  @EffectiveAt()
  when!: Date;

  @Field(TSType.Value, Number)
  @Measure({ operations: ["plus", "less"] })
  quantity!: number;
}

@Entity({ name: "sales" })
class Sales {
  @Field(TSType.Value, String)
  @Reference(Store)
  @Key()
  storeId!: string;

  @Field(TSType.Value, String)
  @Reference(Item)
  @Key()
  itemId!: string;

  @Field(TSType.Value, String)
  @Reference(Purchaser)
  @Key()
  purchaserId!: string;

  @Field(TSType.Value, Date)
  @EffectiveAt()
  when!: Date;

  @Field(TSType.Value, Number)
  @Measure({ operations: ["plus", "less"] })
  quantity!: number;
}

@Entity({ name: "price" })
@AppliesTo(Sales)
class Price {
  @Field(TSType.Value, String)
  @Reference(Store)
  @Key()
  storeId!: string;

  @Field(TSType.Value, String)
  @Reference(Item)
  @Key()
  itemId!: string;

  @Field(TSType.Value, Date)
  @EffectiveAt()
  when!: Date;

  @Field(TSType.Value, Money)
  amount!: Money;
}

@Entity({ name: "register" })
class Register {
  @Field(TSType.Value, String)
  @Reference(Store)
  @Key()
  storeId!: string;

  @Field(TSType.Value, Date)
  @EffectiveAt()
  when!: Date;

  @Field(TSType.Value, Money)
  amount!: Money;
}

const retailEntities = [Store, Item, Purchaser, Stock, Sales, Price, Register] as const;

describe("retail ER -> Grain documentation model", () => {
  it("retains ER reference topology at the introspection boundary", () => {
    const sales = describeClass(Sales);
    const storeReference = sales.fields.storeId.annotations.find(
      (annotation) => annotation.namespace === "er" && annotation.name === "reference"
    );
    const purchaserReference = sales.fields.purchaserId.annotations.find(
      (annotation) => annotation.namespace === "er" && annotation.name === "reference"
    );

    expect((storeReference?.value as { target: Function }).target).toBe(Store);
    expect((purchaserReference?.value as { target: Function }).target).toBe(Purchaser);
  });

  it("lowers @Reference metadata into explicit ER relationship IR", () => {
    const model = inferGrainModel(retailEntities);

    expect(model.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceEntity: Sales,
          sourceField: "storeId",
          targetEntity: Store,
          targetField: "id",
        }),
        expect.objectContaining({
          sourceEntity: Sales,
          sourceField: "itemId",
          targetEntity: Item,
          targetField: "id",
        }),
        expect.objectContaining({
          sourceEntity: Price,
          sourceField: "storeId",
          targetEntity: Store,
          targetField: "id",
        }),
      ])
    );
  });

  it("infers the effective-dated Price -> Sales join from @AppliesTo plus shared references", () => {
    const model = inferGrainModel(retailEntities);

    expect(model.temporalJoins).toHaveLength(1);
    expect(model.temporalJoins[0]).toEqual(
      expect.objectContaining({
        providerEntity: Price,
        consumerEntity: Sales,
        providerTimeField: "when",
        consumerTimeField: "when",
        name: "price applicable to sales",
        selects:
          "newest by when of (named set price and when <= their when) per storeId and itemId",
      })
    );
    expect(model.temporalJoins[0].relationshipMappings).toEqual([
      expect.objectContaining({ providerField: "storeId", consumerField: "storeId", targetEntity: Store }),
      expect.objectContaining({ providerField: "itemId", consumerField: "itemId", targetEntity: Item }),
    ]);

    expect(model.narrowing).toEqual([
      expect.objectContaining({ name: "price applicable to sales" }),
    ]);
    expect(model.rows).toEqual([
      expect.objectContaining({
        label: "TJ1",
        selects: "named set sales",
        pattern: "work out",
        parameters:
          "amount: amount of (newest by when of (named set price and when <= their when) per storeId and itemId)",
      }),
    ]);
  });

  it("infers the source events used by the retail Grain graph", () => {
    const model = inferGrainModel(retailEntities);

    expect(model.world.map((event) => event.eventName)).toEqual([
      "set store",
      "set item",
      "set purchaser",
      "set stock",
      "set sales",
      "set price",
      "set register",
    ]);

    const sales = model.entities.find((entity) => entity.entity === Sales)!;
    expect(sales.keys).toEqual(["storeId", "itemId", "purchaserId"]);
    expect(sales.temporal).toEqual({ kind: "effective", field: "when" });
    expect(sales.permissions).toEqual(
      expect.arrayContaining([
        {
          operation: "identity",
          on: "made by world on storeId, itemId, purchaserId, when",
        },
        { operation: "compare", on: "named set sales on when with date" },
        { operation: "compare", on: "named set sales on quantity with number" },
      ])
    );
  });

  it("uses scalar semantics to infer money operations for price and register", () => {
    const model = inferGrainModel(retailEntities);
    const price = model.entities.find((entity) => entity.entity === Price)!;

    expect(price.permissions).toEqual(
      expect.arrayContaining([
        { operation: "compare", on: "named set price on amount with number" },
        {
          operation: "plus",
          on: "named set price on amount with number -> named set price",
        },
        {
          operation: "less",
          on: "named set price on amount with number -> named set price",
        },
      ])
    );
  });

  it("emits the documented Grain world-event table", () => {
    const output = transpileEntitiesToGrain(retailEntities, {
      title: "Retail ER model inferred by TypeMorph",
    }).markdown;

    expect(output).toContain(
      "| set sales | fields: add storeId; add itemId; add purchaserId; add when; add quantity | inferred from TypeMorph ER metadata |"
    );
    expect(output).toContain(
      "| set price | fields: add storeId; add itemId; add when; add amount | inferred from TypeMorph ER metadata |"
    );
    expect(output).toContain(
      "| set register | fields: add storeId; add when; add amount | inferred from TypeMorph ER metadata |"
    );
    expect(output).toContain(
      "| price applicable to sales | made by (work out and amount: amount of (newest by when of (named set price and when <= their when) per storeId and itemId)) from named set sales | inferred from @AppliesTo(sales) and shared @Reference coordinates |"
    );
    expect(output).toContain(
      "| TJ1 | named set sales | work out | amount: amount of (newest by when of (named set price and when <= their when) per storeId and itemId) | inferred from @AppliesTo(sales) and shared @Reference coordinates |"
    );
  });
});
