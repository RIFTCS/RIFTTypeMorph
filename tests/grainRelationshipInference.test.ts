import { describe, expect, it } from "vitest";
import {
  AppliesTo,
  EffectiveAt,
  Entity,
  Field,
  Key,
  Measure,
  Reference,
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

@Entity({ name: "sale" })
class Sale {
  @Field(TSType.Value, String)
  @Reference(Shop)
  @Key()
  shopId!: string;

  @Field(TSType.Value, Date)
  @EffectiveAt()
  soldAt!: Date;

  @Field(TSType.Value, Number)
  @Measure()
  quantity!: number;
}

@Entity({ name: "price" })
@AppliesTo(Sale)
class PriceWithDifferentCoordinateNames {
  @Field(TSType.Value, String)
  @Reference(Shop)
  @Key()
  shop!: string;

  @Field(TSType.Value, Date)
  @EffectiveAt()
  validFrom!: Date;

  @Field(TSType.Value, Number)
  @Measure()
  amount!: number;
}

@Entity({ name: "stock" })
class StockWithoutApplicability {
  @Field(TSType.Value, String)
  @Reference(Shop)
  @Key()
  shopId!: string;

  @Field(TSType.Value, Date)
  @EffectiveAt()
  when!: Date;

  @Field(TSType.Value, Number)
  quantity!: number;
}

describe("Grain relationship and temporal join inference", () => {
  it("maps references by target entity/key even when local coordinate names differ", () => {
    const model = inferGrainModel([Shop, Sale, PriceWithDifferentCoordinateNames]);
    const join = model.temporalJoins[0];

    expect(join.relationshipMappings).toEqual([
      expect.objectContaining({
        providerField: "shop",
        consumerField: "shopId",
        targetEntity: Shop,
        targetField: "id",
      }),
    ]);
    expect(join.selects).toBe(
      "newest by validFrom of (named set price and validFrom <= their soldAt and shop = their shopId) per shop"
    );
  });

  it("adds compare grants needed for explicit cross-name relationship equality", () => {
    const model = inferGrainModel([Shop, Sale, PriceWithDifferentCoordinateNames]);

    expect(model.permissions).toEqual(
      expect.arrayContaining([
        { operation: "compare", on: "named set price on shop with text" },
        { operation: "compare", on: "named set sale on shopId with text" },
      ])
    );
  });

  it("does not invent an applicability join from shared references alone", () => {
    const model = inferGrainModel([Shop, Sale, StockWithoutApplicability]);
    expect(model.temporalJoins).toEqual([]);
    expect(model.rows).toEqual([]);
    expect(model.narrowing).toEqual([]);
  });


  it("requires explicit target fields for compound-key references and records them in IR", () => {
    @Entity({ name: "region" })
    class Region {
      @Field(TSType.Value, String)
      @Key()
      tenantId!: string;

      @Field(TSType.Value, String)
      @Key()
      code!: string;
    }

    @Entity({ name: "regional sale" })
    class RegionalSale {
      @Field(TSType.Value, String)
      @Reference(Region, { targetField: "tenantId" })
      @Key()
      tenantId!: string;

      @Field(TSType.Value, String)
      @Reference(Region, { targetField: "code" })
      @Key()
      regionCode!: string;
    }

    const model = inferGrainModel([Region, RegionalSale]);
    expect(model.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceEntity: RegionalSale,
          sourceField: "tenantId",
          targetEntity: Region,
          targetField: "tenantId",
        }),
        expect.objectContaining({
          sourceEntity: RegionalSale,
          sourceField: "regionCode",
          targetEntity: Region,
          targetField: "code",
        }),
      ])
    );
  });

  it("materialises the applicable provider payload at the consumer grain", () => {
    const output = transpileEntitiesToGrain(
      [Shop, Sale, PriceWithDifferentCoordinateNames],
      { title: "Renamed relationship coordinates" }
    ).markdown;

    expect(output).toContain(
      "| price applicable to sale | made by (work out and amount: amount of (newest by validFrom of (named set price and validFrom <= their soldAt and shop = their shopId) per shop)) from named set sale |"
    );
    expect(output).toContain(
      "| TJ1 | named set sale | work out | amount: amount of (newest by validFrom of (named set price and validFrom <= their soldAt and shop = their shopId) per shop) |"
    );
  });
});
