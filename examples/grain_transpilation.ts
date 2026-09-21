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

// The Store --stocks-- Item relationship becomes an associative ER entity.
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

// The Store --buys-- Item relationship, qualified by Purchaser, is also
// represented as an associative entity. `when` makes repeated purchases
// distinct facts through time.
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

const result = transpileEntitiesToGrain(
  [Store, Item, Purchaser, Stock, Sales, Price, Register],
  { title: "Retail ER model inferred by TypeMorph" }
);

console.log(result.markdown);
