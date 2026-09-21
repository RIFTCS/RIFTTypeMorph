# TypeMorph ER -> Grain transpilation

TypeMorph classes are treated as **ER entities**, not as Grain events. The Grain event model is inferred from entity identity, scalar semantics, relationships and temporal applicability metadata.

The intended pipeline is:

```text
TypeMorph entity classes
        |
        | describeClass()
        v
ER semantic model
  entities
  keys
  scalar roles
  references
  temporal coordinates
  applicability
        |
        | inferGrainModel()
        v
Grain IR
  world events
  identity / comparison permissions
  relationship IR
  temporal joins
  narrowing words
  derived rows
        |
        | emitGrainMarkdown()
        v
Grain description Markdown
        |
        v
python -m grain ... --plan-only
```

The important boundary is that application code describes the domain. It does not separately declare `set ...` events or hand-write Grain identity and temporal join rules.

## Retail example

Consider the ER shape:

```text
                 Store
                 /   \
                /     \
             stocks   buys
              /         \
             /           \
           Item ------ Purchaser
```

`Stock` is the associative entity for Store--stocks--Item. `Sales` represents Store--buys--Item qualified by Purchaser. `Price` is an effective-dated Store/Item fact, and `Register` is an effective-dated Store fact.

The TypeMorph model is in [`examples/grain_transpilation.ts`](examples/grain_transpilation.ts).

A shortened version is:

```ts
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
```

There is still no Grain event declaration in this code.

## Why `@AppliesTo` exists

`@Reference(...)` tells the compiler **how entities line up**, but not which effective-dated fact a business rule intends to read.

For example, `Sales` shares Store/Item coordinates with both `Price` and `Stock`, and shares Store with `Register`. ER topology alone therefore does not justify choosing Price rather than Stock or Register.

`@AppliesTo(Sales)` is domain metadata saying:

> a Price fact is an effective-dated fact applicable to a Sales fact.

It does not describe a Grain event or Grain syntax. Once that semantic relation is present, the join coordinates and temporal selection are inferred from `@Reference`, `@Key` and `@EffectiveAt`.

## Relationship IR

Every `@Reference(Target)` is lowered into an explicit relationship edge.

For the retail model, part of `model.relationships` is equivalent to:

```text
Sales.storeId      -> Store.id
Sales.itemId       -> Item.id
Sales.purchaserId  -> Purchaser.id

Price.storeId      -> Store.id
Price.itemId       -> Item.id

Register.storeId   -> Store.id
```

The local field names do not need to match. This also works:

```ts
class Sale {
  @Reference(Store)
  @Key()
  shopId!: string;
}

class Price {
  @Reference(Store)
  @Key()
  shop!: string;
}
```

Both fields resolve through the same ER coordinate, `Store.id`, so the Grain join can be inferred as:

```text
shop = their shopId
```

For a target entity with a compound key, the target key must be selected explicitly:

```ts
@Reference(Target, { targetField: "tenantId" })
tenantId!: string;
```

The transpiler refuses ambiguous compound-key references rather than guessing.

## Temporal join inference

`Price` is:

```text
key:          Store, Item
effective at: when
payload:      amount
applies to:   Sales
```

`Sales` is:

```text
key:          Store, Item, Purchaser
effective at: when
payload:      quantity
```

The relationship IR gives the shared dimensions:

```text
Price.storeId -> Store.id <- Sales.storeId
Price.itemId  -> Item.id  <- Sales.itemId
```

The temporal inference pass therefore constructs:

```text
provider:     Price
consumer:     Sales
shared grain: Store, Item
provider time: Price.when
anchor time:   Sales.when
rule:          newest Price.when <= Sales.when
```

The resulting `GrainTemporalJoinIR` is equivalent to:

```ts
{
  providerEntityName: "price",
  consumerEntityName: "sales",
  providerTimeField: "when",
  consumerTimeField: "when",
  relationshipMappings: [
    { providerField: "storeId", consumerField: "storeId", target: "Store.id" },
    { providerField: "itemId", consumerField: "itemId", target: "Item.id" }
  ],
  name: "price applicable to sales",
  selects:
    "newest by when of (named set price and when <= their when) per storeId and itemId"
}
```

The transpiler then materialises the provider payload at the consumer grain with a generated `work out` row.

Conceptually:

```text
set sales --------------------+
                              |
                              v
                    price applicable to sales
                              ^
                              |
set price -- newest <= when --+
```

This is more than a source-event translation: the inferred Grain graph now has a derived product with `set sales` as its principal parent and `set price` supplying the applicable `amount`.

## Exact generated Grain

Running:

```ts
const result = transpileEntitiesToGrain(
  [Store, Item, Purchaser, Stock, Sales, Price, Register],
  { title: "Retail ER model inferred by TypeMorph" }
);
```

currently emits:

```markdown
# Retail ER model inferred by TypeMorph

## World events

| event | fields | evidence |
|---|---|---|
| set store | fields: add id | inferred from TypeMorph ER metadata |
| set item | fields: add id | inferred from TypeMorph ER metadata |
| set purchaser | fields: add id | inferred from TypeMorph ER metadata |
| set stock | fields: add storeId; add itemId; add when; add quantity | inferred from TypeMorph ER metadata |
| set sales | fields: add storeId; add itemId; add purchaserId; add when; add quantity | inferred from TypeMorph ER metadata |
| set price | fields: add storeId; add itemId; add when; add amount | inferred from TypeMorph ER metadata |
| set register | fields: add storeId; add when; add amount | inferred from TypeMorph ER metadata |

## Permissions

| operation | on | evidence |
|---|---|---|
| identity | made by world on id | inferred from TypeMorph ER metadata |
| identity | made by world on storeId, itemId, when | inferred from TypeMorph ER metadata |
| compare | named set stock on when with date | inferred from TypeMorph ER metadata |
| compare | named set stock on quantity with number | inferred from TypeMorph ER metadata |
| plus | named set stock on quantity with number -> named set stock | inferred from TypeMorph ER metadata |
| less | named set stock on quantity with number -> named set stock | inferred from TypeMorph ER metadata |
| identity | made by world on storeId, itemId, purchaserId, when | inferred from TypeMorph ER metadata |
| compare | named set sales on when with date | inferred from TypeMorph ER metadata |
| compare | named set sales on quantity with number | inferred from TypeMorph ER metadata |
| plus | named set sales on quantity with number -> named set sales | inferred from TypeMorph ER metadata |
| less | named set sales on quantity with number -> named set sales | inferred from TypeMorph ER metadata |
| compare | named set price on when with date | inferred from TypeMorph ER metadata |
| compare | named set price on amount with number | inferred from TypeMorph ER metadata |
| plus | named set price on amount with number -> named set price | inferred from TypeMorph ER metadata |
| less | named set price on amount with number -> named set price | inferred from TypeMorph ER metadata |
| identity | made by world on storeId, when | inferred from TypeMorph ER metadata |
| compare | named set register on when with date | inferred from TypeMorph ER metadata |
| compare | named set register on amount with number | inferred from TypeMorph ER metadata |
| plus | named set register on amount with number -> named set register | inferred from TypeMorph ER metadata |
| less | named set register on amount with number -> named set register | inferred from TypeMorph ER metadata |
| compare | named price applicable to sales on amount with number | inferred from TypeMorph ER metadata |
| plus | named price applicable to sales on amount with number -> named price applicable to sales | inferred from TypeMorph ER metadata |
| less | named price applicable to sales on amount with number -> named price applicable to sales | inferred from TypeMorph ER metadata |

## Narrowing table

| name | selects | evidence |
|---|---|---|
| price applicable to sales | made by (work out and amount: amount of (newest by when of (named set price and when <= their when) per storeId and itemId)) from named set sales | inferred from @AppliesTo(sales) and shared @Reference coordinates |

## Rows

| # | selects | pattern | parameters | evidence |
|---|---|---|---|---|
| TJ1 | named set sales | work out | amount: amount of (newest by when of (named set price and when <= their when) per storeId and itemId) | inferred from @AppliesTo(sales) and shared @Reference coordinates |


```

The important generated part is:

```markdown
| price applicable to sales | made by (work out and amount: amount of (newest by when of (named set price and when <= their when) per storeId and itemId)) from named set sales | inferred from @AppliesTo(sales) and shared @Reference coordinates |
```

and its materialising row:

```markdown
| TJ1 | named set sales | work out | amount: amount of (newest by when of (named set price and when <= their when) per storeId and itemId) | inferred from @AppliesTo(sales) and shared @Reference coordinates |
```

The supplied Grain compiler accepts this model with `--plan-only` and records the `TJ1` product as having two parents:

```text
principal parent: set sales
amount parent:    set price
```

## What is inferred now

The transpiler now infers all of the following from the TypeMorph entity model:

```text
@Entity                         Grain world fact kind
@Key                            logical identity coordinate
@EffectiveAt / @RevisionAt      temporal event identity and ordering
@Reference                      relationship IR edge
@ScalarType / @Measure          scalar representation and permitted operations
@AppliesTo                      intended effective-dated provider -> consumer relation
shared @Reference targets       temporal join coordinates
provider + consumer times       newest provider at-or-before consumer time
provider payload fields         derived work-out fields at consumer grain
```

The compiler also validates the relationship semantics. It rejects, rather than guesses, cases such as:

```text
reference to a target with no key
ambiguous compound-key reference
reference scalar representations that disagree
@AppliesTo provider without @EffectiveAt
consumer without a temporal anchor
provider key coordinates that cannot be mapped through relationships
ambiguous duplicate references to the same target key
provider payload colliding with an existing consumer field
```

## What is deliberately not inferred yet

The ER model now contains enough information to infer **which Price applies to a Sale**. It still does not contain enough information to infer a business formula such as:

```text
takings = sales.quantity * applicablePrice.amount
```

That is not an ER relationship; it is a domain computation. Inferring it from field names such as `quantity` and `amount` would be guessing.

The next semantic layer should therefore describe derived measures/formulas in domain terms, for example something in the direction of:

```ts
@DerivedMeasure({
  from: Sales,
  using: Price,
  operation: "times",
  left: "quantity",
  right: "amount"
})
class Takings { ... }
```

or, preferably, a typed expression DSL that can refer to entity fields without embedding Grain syntax. That layer can lower into Grain arithmetic permissions, narrowing words and rows in the same way temporal applicability now does.

## Running the example

Generate the Grain Markdown from the TypeScript example, then pass the result to Grain:

```bash
npm run build
node <compiled example> > retail.md
python3 -m grain retail.md -o build/retail --plan-only
```

The tests covering this path are:

```text
tests/grainTranspilation.test.ts
tests/grainRetailTranspilation.test.ts
tests/grainRelationshipInference.test.ts
```

The retail tests assert the relationship IR, temporal join IR, narrowing word and generated row. The relationship tests also cover differently named local foreign-key fields and verify that shared references alone do not invent an applicability relation.
