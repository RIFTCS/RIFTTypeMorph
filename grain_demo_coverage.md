# Grain demo coverage from TypeMorph

This file records which Grain demo concepts are inferred from the TypeMorph ER model and which are expressed through the typed Grain rule DSL.

The design rule is:

```text
If the concept is an ER fact, relationship, identity or temporal fact semantics:
    infer it.

If the concept is a business calculation, dataflow shape or solver rule:
    express it explicitly through the typed DSL.

Do not infer calculations from field names.
```

Representative complete models live in [`examples/grain_demo_coverage.ts`](examples/grain_demo_coverage.ts). They are generated with `transpileEntitiesToGrain()` and were checked against the Grain repository supplied alongside TypeMorph.

## What TypeMorph infers directly

| Grain concept | TypeMorph source | Result |
|---|---|---|
| World event | `@Entity()` | `set <entity>` by default |
| Non-`set` event name | `@Entity({ eventName: "open shop" })` | exact Grain world-event name |
| Fact identity | `@Key()` | Grain `identity` permission |
| Effective/revision coordinate | `@EffectiveAt()` / `@RevisionAt()` | event identity includes time and comparison is granted |
| Current/superseding fact | temporal coordinate + keys | automatic `current <entity>` word using `newest by ... per ...` |
| ER relationship | `@Reference(...)` | explicit relationship IR |
| Effective fact applicable to another entity | `@AppliesTo(...)` + references + temporal coordinates | inferred temporal relationship join |
| Scalar comparison/arithmetic capability | `@Measure`, `@Ordered`, `@ScalarType` | Grain permissions |
| Compound target references | `@Reference(Target, { targetField })` | relationship coordinates without name guessing |

For example, an effective-dated entity:

```ts
@Entity({ name: "price" })
class Price {
  @Field(TSType.Value, String)
  @Key()
  shop!: string;

  @Field(TSType.Value, Number)
  @EffectiveAt()
  when!: number;

  @Field(TSType.Value, Number)
  amount!: number;
}
```

automatically contributes:

```markdown
| current price | newest by when of named set price per shop | inferred from @EffectiveAt() and @Key() |
```

That directly covers the core of Grain demos such as `d08-superseding-figure` and `d17-multi-reduction`.

## Typed Grain DSL surface

The DSL mirrors Grain's own selection and term AST rather than storing arbitrary Markdown fragments.

### Selections

The following are first-class builders:

```ts
grain.named("price")
grain.namedEvent(Price)
grain.madeBy("work out", { from: grain.named("sales") })
grain.downstreamOf(grain.named("order"))
grain.upstreamOf(grain.named("settlement"), grain.without("amount"))
grain.eq("shop", "Hill")
grain.without("amount")
grain.with(grain.named("rate"))
grain.notWith(grain.named("rate"))
grain.not(grain.named("failed invoice"))
grain.and(...)
grain.or(...)
grain.compare(grain.field("when"), "<", grain.their("when"))
grain.newest("when", selection, ["shop"])
grain.first("when", selection, ["shop"])
grain.last("when", selection, ["shop"])
grain.next("when", grain.named("period"))
```

This covers the demo selection vocabulary used for:

- anchored existence and absence (`with`, `not with`)
- optional/error branches (`without`)
- unions and intersections
- lineage walks (`downstream of`, `upstream of`, and `while`)
- lagged/window reads (`newest by ... when < their when`)
- state-machine tests
- maker/source qualification
- recursive narrowing words

### Terms

The DSL supports:

```ts
grain.base()
grain.field("amount")
grain.their("when")
grain.fieldOf("amount", grain.named("price"))
grain.plus(left, right)
grain.less(left, right)
grain.times(left, right)
grain.over(left, right)
grain.op("greater of", left, right)
grain.unary("cents to dollars", grain.field("principal"))
grain.fold("plus", "amount")
grain.fold("greater of", "amount")
grain.then(firstPlace, secondPlace, fallback)
grain.number(1, "cent")
```

This covers arithmetic, default hierarchies/coalesce, reductions, units, adapters and declared operators from the demos.

### All six row patterns

All six Grain patterns have typed builders:

```ts
grain.workOut(...)
grain.accountFor(...)
grain.group(...)
grain.differ(...)
grain.spread(...)
grain.override(...)
```

Fields rows are also supported:

```ts
grain.fields(grain.madeBy("world"), ["amount", "run"])
```

and rule sets can contain supplied events and expected assertions:

```ts
grain.supplied(Price, { shop: "Hill", amount: 7 })
grain.expected(grain.named("takings"), { count: 2 })
```

## Demo coverage matrix

`Compile checked` means the generated Markdown was run through the supplied Grain compiler with `--plan-only`. `Expressible` means the DSL covers the demo's language form, but the example was not used as one of the representative compile-through models. `Grain-limited` means TypeMorph emits the form but the current Grain compiler deliberately refuses that feature.

| Grain demo concept | TypeMorph support | Status |
|---|---|---|
| d01 running chain / fold | recursive word + ordered next + arithmetic + hold entries through `workOut` | Expressible |
| d02 visible touch / decorator | maker/source qualification + field absence + lineage | Expressible |
| d03 default hierarchy / coalesce | `grain.then(...)` | Compile checked |
| d04 gapped set / expectation | `notWith`, recursive word and comparisons | Expressible |
| d05 expected figure / Option | `accountFor` | Compile checked |
| d06 two figures / traversal | `accountFor`, absence propagation, upstream lineage | Expressible |
| d07 lagged read / window | `newest` + `their` comparison | Compile checked |
| d08 superseding figure | automatic temporal current word; anchored version via applicability selection | Inferred / compile checked |
| d09 swappable strategy | narrowing words separate rule identity from implementation row | Expressible |
| d10 adapter | custom unary operator + field remap | Compile checked |
| d11 open/closed state machine | event-name override + `with` / `notWith` temporal tests | Compile checked |
| d12a lagged settling cycle | recursive words + lagged ordered selection | Expressible |
| d12b simultaneous fixed point | `group` + `differ` | Grain-limited: emitted correctly; Grain reports `differ` not implemented this round |
| d13 scenario | Fields rows + `spread` + `override` | Compile checked |
| d14 typed rules/default widths | `then`, field tests and ordinary world facts | Expressible |
| d15 maker-qualified pickup | `madeBy` qualifiers and source | Expressible |
| d16 twins / qualified maker | unions, maker qualifiers and field tests | Expressible |
| d17 current price / multi-reduction | automatic `current <entity>` word | Inferred / compile checked |
| d18 two faces | several narrowing words over one fact kind + arithmetic permission landings | Expressible |
| d19 hand-along | lineage plus `while without` | Expressible |
| d20 minimum charge | declared foldable operator + `group` fold | Compile checked |
| d21 collapse | union + absence + downstream selections | Expressible |
| d22 project grant | nested `then`, folds, groups and mixed literal/selection permission sides | Expressible |
| d23 typed selection | `select` permission can be declared; `only` is supported by spread/override; selection-valued seed cells remain data strings | Expressible |
| d24 upstream read-back | `upstreamOf` and conditional lineage walk | Expressible |
| d25 running model | dates/units represented by Grain literals, custom `years from`, ordered windows, folds and recursive rows | Expressible |
| d26 dense loop | recursive rules can be emitted | Grain decides whether the cycle is lawful/solvable |
| functional Option / Result | anchored absence, `without`, `accountFor`, upstream reason selection | Expressible |
| functional Validation | unions, negative membership, groups and stamps | Expressible |
| functional Writer | lineage is represented by upstream/downstream selections, not a special log structure | Expressible |
| functional Reader | exact/wide fallback through selections and `then` | Expressible |
| functional List | `spread`, ordinary work-out and `group` | Compile surface covered by scenario/group tests |
| functional State | recursive ordered chain | Expressible |
| functional Fixpoint | recursive row + stop selection + ordered axis | Expressible; solver horizon remains a Grain/domain concern |

## Representative compile-through models

`examples/grain_demo_coverage.ts` currently builds these complete Grain descriptions:

```text
defaultHierarchy        d03-style `then` fallback
laggedRead              d07-style prior-value window
adapter                 d10-style custom unary operator
stateMachine            d11-style open/closed existence gating
declaredOperatorAndGroup d20-style custom foldable operator and group
scenario                d13-style Fields rows, spread and override
expectedFigure          d05-style account for
simultaneousFixpoint    d12b-style differ (parsed, then refused by Grain because differ is unimplemented)
```

The first seven plan successfully with the supplied Grain compiler. The simultaneous fixpoint model reaches Grain's explicit `differ is not implemented this round` refusal, confirming that TypeMorph emitted the intended Grain form and that the remaining limitation is in Grain itself rather than in the transpiler.

## Escape hatches

`grain.rawSelection(...)` and `grain.rawTerm(...)` exist for a Grain language addition that has not yet been represented in the TypeScript AST. They should be exceptional. New stable Grain constructs should normally be added to the typed AST instead of spreading raw notation through entity-model code.

## What is not inferred

The transpiler deliberately does not infer these from ER topology alone:

- arithmetic formulas such as `takings = quantity * price`
- state-machine business rules
- default priority order between otherwise valid facts
- validation policy
- scenario adjustments
- aggregation intent
- recursive/fixpoint algorithms

Those are rules, not ER structure. They are now expressible beside the entity model without hand-writing Grain Markdown.

## Preferred executable transform surface

The typed Grain DSL above is now the backend/escape hatch rather than the preferred spelling for ordinary calculations.

`examples/executable_transforms.ts` exercises the transform/event metamodel against several unrelated demo families:

| Executable example | Grain concepts exercised | Native result | Grain plan |
|---|---|---|---|
| default hierarchy | applicable reader, `without`, `then`, arithmetic | checked | checked |
| lagged read | previous ordered fact, anchored comparison | checked | checked |
| lifecycle gate | as-of existence, `with`, `not with`, guard control flow | checked | checked |
| grouped reduction | group/per identity, plus fold | checked | checked |
| custom fold | foldable `greater of`, explicit identity | checked | checked |
| adapter | executable custom unary operator, output identity | checked | checked |
| state chain | recursive word, latest state, next axis, optional input fallback | checked | checked |
| validation | existence guard, field comparison, inferred scalar comparison forms | checked | checked |

The important boundary is that selectors live in method parameter metadata while calculations remain ordinary TypeScript. This lets the same transform execute natively without symbolic proxy values.

See [`transform_metamodel.md`](transform_metamodel.md) for the API and lowering rules.
