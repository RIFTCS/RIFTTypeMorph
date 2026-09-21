# Executable transform / event metamodel

The typed `grainRules(...)` API remains the complete Grain AST backend, but it is not intended to be the normal domain authoring surface.

For ordinary business transformations, write an executable TypeScript method. TypeMorph records the semantics of each input with parameter decorators, parses the method body into a small transform IR, and lowers that IR into the existing Grain AST.

```text
TypeMorph ER entities
       |
       | infer identity / relationships / time
       v
Executable TypeScript transform
       |
       | TypeScript AST
       v
Transform IR
       |
       | Grain lowering
       v
Grain AST -> Markdown -> Grain compiler
```

The same transform remains a normal TypeScript function, so its calculation can be unit-tested without Grain.

## Example: fallback pricing

```ts
@Entity({ name: "price" })
class Price {
  @Field(TSType.Value, String)
  @Key()
  shop!: string;

  @Field(TSType.Value, Number)
  amount!: number;
}

@Entity({ name: "sales" })
class Sales {
  @Field(TSType.Value, String)
  @Key()
  shop!: string;

  @Field(TSType.Value, Number)
  amount!: number;
}

class RetailTransforms {
  @Transform("takings")
  static takings(
    @From(Sales) sale: Sales,
    @Applicable(Price) price: Price | undefined,
    @Applicable(Price, { without: ["shop"] }) defaultPrice: Price,
  ) {
    return {
      amount: sale.amount * (price?.amount ?? defaultPrice.amount),
    };
  }
}
```

The implementation is ordinary TypeScript:

```ts
expect(
  RetailTransforms.takings(
    { shop: "Hill", amount: 100 } as Sales,
    { shop: "Hill", amount: 7 } as Price,
    { amount: 5 } as Price,
  )
).toEqual({ amount: 700 });

expect(
  RetailTransforms.takings(
    { shop: "Dale", amount: 40 } as Sales,
    undefined,
    { amount: 5 } as Price,
  )
).toEqual({ amount: 200 });
```

The AST lowering sees:

```text
sale.amount
    times
(price.amount then defaultPrice.amount)
```

and generates the Grain rule:

```text
amount: amount times (
  amount of named set price
  then
  amount of (named set price and without shop)
)
```

It also infers the required `times` permission and the `takings` narrowing word.

## Input semantics

Transform inputs describe *which figure is handed to the function*. The function itself receives ordinary values.

### `@From(T)`

The principal or ordinary source fact.

```ts
@Transform("net")
static net(@From(Sales) sale: Sales) {
  return { amount: sale.amount - 10 };
}
```

### `@Applicable(T)`

A fact applicable to the principal fact.

If both entities have temporal coordinates, TypeMorph infers an as-of read:

```text
newest provider.when <= principal.when
```

using ER identity/reference coordinates.

It is usable for values *and* existence checks, so the same concept handles prices-in-force and lifecycle gates.

```ts
@Transform("takings")
static takings(
  @From(Sales) sale: Sales,
  @Applicable(OpenShop) opened: OpenShop | undefined,
  @Applicable(CloseShop) closed: CloseShop | undefined,
) {
  if (!opened || closed) return;
  return { amount: sale.amount * 5 };
}
```

That lowers to an anchored Grain selection containing `with` the latest opening at-or-before the sale and `not with` the latest closing at-or-before it.

A fallback/wide fact is expressed with ordinary domain metadata:

```ts
@Applicable(Price, { without: ["shop"] }) defaultPrice: Price
```

### `@Previous(T)`

The newest earlier fact relative to the principal anchor.

```ts
@Transform("growth")
static growth(
  @From(Count) current: Count,
  @Previous(Count) previous: Count | undefined,
) {
  if (!previous) return;
  return { amount: current.amount / previous.amount };
}
```

For an effective-dated `Count`, this lowers to:

```text
newest by when of
  (named set count and when < their when)
per shop
```

The `by` field and `per` identity fields are inferred from the entity where possible. They can also be supplied explicitly.

### `@Latest(...)` and `@Next(...)`

These support state/running-chain transforms.

```ts
@Transform("tank", { seed: Tank, identity: ["when"] })
static step(
  @Latest("tank", { by: "when", per: ["car"] }) tank: Tank,
  @Next(Day, { by: "when" }) day: Day,
  @From(Use) use: Use,
  @Applicable(Refill) refill: Refill | undefined,
) {
  return {
    when: day.when,
    amount: tank.amount - use.amount + (refill?.amount ?? 0),
  };
}
```

`seed: Tank` gives the logical word both its source figures and recursively generated figures:

```text
tank := named set tank or made by work out from named tank
```

`day.when` is recognized as the ordered successor coordinate, so it lowers to:

```text
when: next by when of named set day
```

rather than an ordinary field read. The identity permission is generated from the returned identity field, which gives Grain the lawful unwinding axis for the recursive chain.

### `@Current(T)`

Reads the standard current/superseding word inferred from an effective/revision-dated entity.

### `@Grouped(T, { per: [...] })`

The function receives a normal array and can use executable aggregate helpers.

```ts
@Transform("daily total")
static dailyTotal(
  @Grouped(Invoice, { per: ["day"] }) invoices: Invoice[],
) {
  return {
    amount: sum(invoices, invoice => invoice.amount),
  };
}
```

Native execution performs a JavaScript reduction. Grain lowering generates:

```text
pattern: group
per: day
amount: plus over amount
```

and grants identity on the grouping coordinates.

A custom foldable reduction can carry its Grain identity explicitly:

```ts
@Transform("peak")
static peak(
  @Grouped(Reading, { per: ["meter"] }) readings: Reading[],
) {
  return {
    amount: maximum(readings, reading => reading.amount, 0),
  };
}
```

This emits a foldable `greater of` operator with identity `0` and `greater of over amount`.

## Native control flow

A guard-style early return is part of the transform language:

```ts
if (!credit || invoice.amount > credit.limit) return;
return { amount: invoice.amount };
```

The function behaves normally in TypeScript. The transform compiler negates the early-return condition into the selection that is permitted to produce an output:

```text
with credit limit
and amount <= credit.limit
```

The scalar forms needed by Grain comparisons are inferred from the TypeMorph field representations, so the generated permissions include both numeric fields as `with number`.

Separate transforms should be used for semantically different branches. This keeps the executable subset simple and keeps each derived Grain word explicit.

## Supported expression subset

The initial executable subset intentionally stays small and predictable.

Supported value expressions include:

```ts
a.field
optional?.field
1
-1
left + right
left - right
left * right
left / right
specific ?? fallback
sum(group, x => x.amount)
maximum(group, x => x.amount, identity)
minimum(group, x => x.amount, identity)
registeredOperator(value)
registeredBinaryOperator(left, right)
```

Supported guards include:

```ts
if (!input) return;
if (input) return;
if (!a || b) return;
if (a.amount > b.limit) return;
if (a.when <= b.when) return;
```

`const` bindings can name supported value expressions before the final object-literal return.

The compiler intentionally rejects arbitrary mutation, loops, side effects, unregistered calls, complex destructuring, and value-returning branches instead of pretending to understand them.

## Executable custom operators

Custom Grain adapters/operators can also be normal TypeScript functions:

```ts
const centsToDollars = defineTransformOperator(
  "cents to dollars",
  (cents: number) => cents / 100,
);

class LoanTransforms {
  @Transform("loan", { identity: ["party"] })
  static loan(@From(Advance) advance: Advance) {
    return {
      amount: centsToDollars(advance.principal),
      party: advance.provider,
    };
  }
}
```

Native code gets `12.34` from `1234`; Grain receives the `cents to dollars` operation permission and expression.

## How this maps across the Grain demos

The transform metamodel is intentionally based on several demo families, not only the retail example.

| Grain demo family | Executable transform spelling |
|---|---|
| default hierarchy / Reader | `??` plus `@Applicable(..., { without })` |
| lagged read | `@Previous(...)` |
| superseding/current fact | `@Current(...)` or inferred current word |
| open/closed state | optional `@Applicable(...)` inputs + early-return guard |
| grouped validation/list | `@Grouped(...)` + `sum(...)` |
| minimum/peak custom fold | grouped `maximum(..., identity)` or a registered foldable operator |
| adapter | `defineTransformOperator(...)` |
| state/running chain | `seed`, `@Latest(...)`, `@Next(...)`, optional coalesced inputs |
| validation | comparison guards and early return |
| fixpoint-style ordered iteration | same ordered-state primitives; convergence/solver behavior remains a Grain concern |

The current implementation has compile-through examples for fallback pricing, lagged reads, lifecycle gating, grouped sums, custom folds, adapters, state chains and validation predicates. Each generated model has been passed through the supplied Grain planner.

## Where `grainRules(...)` still belongs

Some Grain concepts are dataflow/provenance operations rather than a natural pure TypeScript function:

- `account for`
- `spread`
- `override`
- `differ`
- arbitrary lineage-only words
- unusual maker-qualified selections that do not correspond to function inputs

Those continue to use the typed Grain AST as an escape hatch. They can be merged with executable transforms in one model.

The intended layering is therefore:

```text
ER annotations              normal domain structure
Executable transforms       normal business calculations/readers/state steps
Typed Grain rules           unusual Grain-native dataflow/provenance operations
Raw Grain notation          last-resort language escape hatch
```

## Compiler boundary

The transform compiler reads an ordinary method body with the TypeScript parser. Selector semantics are preserved separately by parameter decorators, so the function remains directly callable and does not execute symbolic proxy objects.

Transpilation should run before minification/obfuscation. CommonJS helper call shapes produced by the TypeScript compiler are normalized by the parser, but the transform source is intentionally treated as build-time/compiler input rather than opaque production bytecode.

Because the TypeScript AST parser is now part of the public transform compiler, `typescript` is a runtime package dependency of `rifttypemorph` rather than only a development dependency.

### Decorator mode note

The executable input selectors use TypeScript parameter decorators, so this layer currently requires the repository's existing `experimentalDecorators` (legacy decorator) mode. TypeMorph's class/field schema introspection continues to support the modern decorator metadata path, but standard ECMAScript decorators do not currently define parameter decorators. A future build-time `TypeChecker` scanner could offer equivalent selector metadata from generic parameter types if/when the project wants a standard-decorator-only mode.
