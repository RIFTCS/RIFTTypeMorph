import {
  EffectiveAt,
  Entity,
  Field,
  Key,
  Measure,
  Ordered,
  TSType,
  grain,
  grainRules,
  transpileEntitiesToGrain,
} from "../src";

export function defaultHierarchyDemo(): string {
  @Entity({ name: "price" })
  class Price {
    @Field(TSType.Value, String)
    @Key()
    shop!: string;

    @Field(TSType.Value, Number)
    @Measure({ ordered: false })
    amount!: number;
  }

  @Entity({ name: "sales" })
  class Sales {
    @Field(TSType.Value, String)
    @Key()
    shop!: string;

    @Field(TSType.Value, Number)
    @Measure({ ordered: false })
    amount!: number;
  }

  const rules = grainRules({
    permissions: [
      grain.permission("times", grain.side(grain.named("sales"), "amount"), {
        with: grain.side(grain.named("price"), "amount"),
        landing: grain.named("takings"),
      }),
    ],
    narrowing: [
      grain.word(
        "sales",
        grain.madeBy("work out", {
          qualifiers: [["amount", grain.field("amount")]],
          from: grain.namedEvent(Sales),
        })
      ),
      grain.word(
        "price",
        grain.madeBy("work out", {
          qualifiers: [["amount", grain.field("amount")]],
          from: grain.namedEvent(Price),
        })
      ),
      grain.word("takings", grain.madeBy("work out", { from: grain.named("sales") })),
    ],
    rows: [
      grain.workOut("La", grain.namedEvent(Sales), { amount: grain.field("amount") }),
      grain.workOut("Lb", grain.namedEvent(Price), { amount: grain.field("amount") }),
      grain.workOut("1", grain.named("sales"), {
        amount: grain.times(
          grain.base(),
          grain.then(
            grain.fieldOf("amount", grain.named("price")),
            grain.fieldOf("amount", grain.and(grain.named("price"), grain.without("shop")))
          )
        ),
      }),
    ],
    supplied: [
      grain.supplied(Price, { amount: 5 }),
      grain.supplied(Price, { shop: "Hill", amount: 7 }),
      grain.supplied(Sales, { shop: "Hill", amount: 100 }),
      grain.supplied(Sales, { shop: "Dale", amount: 40 }),
    ],
    expected: [grain.expected(grain.named("takings"), { keyed: [["Hill", 700], ["Dale", 200]] })],
  });

  return transpileEntitiesToGrain([Price, Sales], {
    title: "TypeMorph demo coverage - default hierarchy",
    rules,
    inferCurrentWords: false,
  }).markdown;
}

export function laggedReadDemo(): string {
  @Entity({ name: "count" })
  class Count {
    @Field(TSType.Value, String)
    @Key()
    shop!: string;

    @Field(TSType.Value, Number)
    @EffectiveAt()
    when!: number;

    @Field(TSType.Value, Number)
    @Measure({ ordered: false })
    amount!: number;
  }

  const prior = grain.newest(
    "when",
    grain.and(
      grain.named("count"),
      grain.compare(grain.field("when"), "<", grain.their("when"))
    ),
    ["shop"]
  );

  const rules = grainRules({
    permissions: [
      grain.permission("over", grain.side(grain.named("count"), "amount"), {
        with: grain.side(grain.named("count"), "amount"),
        landing: grain.named("growth"),
      }),
    ],
    narrowing: [
      grain.word(
        "count",
        grain.madeBy("work out", {
          qualifiers: [["amount", grain.field("amount")]],
          from: grain.namedEvent(Count),
        })
      ),
      grain.word("growth", grain.madeBy("work out", { from: grain.named("count") })),
    ],
    rows: [
      grain.workOut("L", grain.namedEvent(Count), { amount: grain.field("amount") }),
      grain.workOut("1", grain.named("count"), {
        amount: grain.over(grain.base(), grain.fieldOf("amount", prior)),
      }),
    ],
  });

  return transpileEntitiesToGrain([Count], {
    title: "TypeMorph demo coverage - lagged read",
    rules,
    inferCurrentWords: false,
  }).markdown;
}

export function adapterDemo(): string {
  @Entity({ name: "advance" })
  class Advance {
    @Field(TSType.Value, String)
    provider!: string;

    @Field(TSType.Value, Number)
    principal!: number;
  }

  const rules = grainRules({
    permissions: [
      grain.permission("identity", grain.side(grain.named("loan"), "party")),
      grain.permission("cents to dollars", grain.side(grain.namedEvent(Advance), "principal"), {
        landing: grain.named("loan"),
        evidence: "adapter conversion declared as an operator",
      }),
    ],
    narrowing: [
      grain.word("loan", grain.madeBy("work out", { from: grain.namedEvent(Advance) })),
    ],
    rows: [
      grain.workOut("1", grain.namedEvent(Advance), {
        amount: grain.unary("cents to dollars", grain.field("principal")),
        party: grain.field("provider"),
      }),
    ],
  });

  return transpileEntitiesToGrain([Advance], {
    title: "TypeMorph demo coverage - adapter",
    rules,
    inferCurrentWords: false,
  }).markdown;
}

export function stateMachineDemo(): string {
  @Entity({ name: "sales" })
  class Sales {
    @Field(TSType.Value, String)
    @Key()
    shop!: string;

    @Field(TSType.Value, Number)
    @Key()
    @Ordered()
    when!: number;

    @Field(TSType.Value, Number)
    @Measure({ ordered: false })
    amount!: number;
  }

  @Entity({ name: "shop opening", eventName: "open shop" })
  class ShopOpening {
    @Field(TSType.Value, String)
    @Key()
    shop!: string;

    @Field(TSType.Value, Number)
    @Key()
    @Ordered()
    when!: number;
  }

  @Entity({ name: "shop closing", eventName: "close shop" })
  class ShopClosing {
    @Field(TSType.Value, String)
    @Key()
    shop!: string;

    @Field(TSType.Value, Number)
    @Key()
    @Ordered()
    when!: number;
  }

  const openBefore = grain.and(
    grain.namedEvent(ShopOpening),
    grain.compare(grain.field("when"), "<=", grain.their("when"))
  );
  const closeBefore = grain.and(
    grain.namedEvent(ShopClosing),
    grain.compare(grain.field("when"), "<=", grain.their("when"))
  );

  const rules = grainRules({
    permissions: [
      grain.permission("times", grain.side(grain.named("sales"), "amount"), {
        with: grain.literalSide("number"),
        landing: grain.named("takings"),
      }),
    ],
    narrowing: [
      grain.word(
        "sales",
        grain.madeBy("work out", {
          qualifiers: [["amount", grain.field("amount")]],
          from: grain.namedEvent(Sales),
        })
      ),
      grain.word("takings", grain.madeBy("work out", { from: grain.named("sales") })),
    ],
    rows: [
      grain.workOut("L", grain.namedEvent(Sales), { amount: grain.field("amount") }),
      grain.workOut(
        "1",
        grain.and(grain.named("sales"), grain.with(openBefore), grain.notWith(closeBefore)),
        { amount: grain.times(grain.base(), grain.number(5)) }
      ),
    ],
  });

  return transpileEntitiesToGrain([Sales, ShopOpening, ShopClosing], {
    title: "TypeMorph demo coverage - state machine",
    rules,
    inferCurrentWords: false,
  }).markdown;
}

export function declaredOperatorAndGroupDemo(): string {
  @Entity({ name: "reading" })
  class Reading {
    @Field(TSType.Value, String)
    @Key()
    meter!: string;

    @Field(TSType.Value, Number)
    @Key()
    when!: number;

    @Field(TSType.Value, Number)
    @Measure({ ordered: false })
    amount!: number;
  }

  @Entity({ name: "minimum" })
  class Minimum {
    @Field(TSType.Value, String)
    @Key()
    meter!: string;

    @Field(TSType.Value, Number)
    @Measure({ ordered: false })
    amount!: number;
  }

  const rules = grainRules({
    permissions: [
      grain.permission("greater of", grain.side(grain.named("reading"), "amount"), {
        with: grain.side(grain.named("minimum"), "amount"),
        landing: grain.named("charge"),
        evidence: "demo, foldable, identity 0",
      }),
      grain.permission("greater of", grain.side(grain.named("reading"), "amount"), {
        with: grain.side(grain.named("reading"), "amount"),
        landing: grain.named("peak"),
        evidence: "demo, foldable, identity 0",
      }),
    ],
    narrowing: [
      grain.word(
        "reading",
        grain.madeBy("work out", {
          qualifiers: [["amount", grain.field("amount")]],
          from: grain.namedEvent(Reading),
        })
      ),
      grain.word(
        "minimum",
        grain.madeBy("work out", {
          qualifiers: [["amount", grain.field("amount")]],
          from: grain.namedEvent(Minimum),
        })
      ),
      grain.word("charge", grain.madeBy("work out", { from: grain.named("reading") })),
      grain.word("peak", grain.madeBy("group", { from: grain.named("reading") })),
    ],
    rows: [
      grain.workOut("L1", grain.namedEvent(Reading), { amount: grain.field("amount") }),
      grain.workOut("L2", grain.namedEvent(Minimum), { amount: grain.field("amount") }),
      grain.workOut("1", grain.named("reading"), {
        amount: grain.op(
          "greater of",
          grain.base(),
          grain.fieldOf("amount", grain.named("minimum"))
        ),
      }),
      grain.group("G", grain.named("reading"), ["meter"], {
        amount: grain.fold("greater of", "amount"),
      }),
    ],
  });

  return transpileEntitiesToGrain([Reading, Minimum], {
    title: "TypeMorph demo coverage - declared operator and group",
    rules,
    inferCurrentWords: false,
  }).markdown;
}

export function scenarioDemo(): string {
  @Entity({ name: "price" })
  class PriceSeed {}

  @Entity({ name: "sales" })
  class SalesSeed {}

  @Entity({ name: "adjustment", eventName: "adjustment" })
  class Adjustment {
    @Field(TSType.Value, String)
    adjusts!: string;

    @Field(TSType.Value, Number)
    factor!: number;

    @Field(TSType.Value, Number)
    difference!: number;
  }

  const setPrice = grain.namedEvent(PriceSeed);
  const setSales = grain.namedEvent(SalesSeed);
  const adjustment = grain.namedEvent(Adjustment);
  const salesOrPrice = grain.or(grain.named("sales"), grain.named("price"));
  const rawSalesOrPrice = grain.or(setSales, setPrice);

  const rules = grainRules({
    fieldRows: [
      grain.fields(grain.madeBy("world"), ["amount", "run"]),
      grain.fields(grain.or(setPrice, setSales, adjustment), ["shop"]),
    ],
    permissions: [
      grain.permission("identity", grain.side(grain.madeBy("world"), "shop", "run", "adjusts")),
      grain.permission("times", grain.side(grain.named("sales"), "amount"), {
        with: grain.side(grain.named("price"), "amount"),
        landing: grain.named("takings"),
      }),
      grain.permission("times", grain.side(grain.named("sales"), "amount"), {
        with: grain.side(grain.named("factor"), "amount"),
        landing: grain.named("sales"),
      }),
      grain.permission("plus", grain.side(grain.named("sales"), "amount"), {
        with: grain.side(grain.named("difference"), "amount"),
        landing: grain.named("sales"),
      }),
      grain.permission("times", grain.side(grain.named("price"), "amount"), {
        with: grain.side(grain.named("factor"), "amount"),
        landing: grain.named("price"),
      }),
      grain.permission("plus", grain.side(grain.named("price"), "amount"), {
        with: grain.side(grain.named("difference"), "amount"),
        landing: grain.named("price"),
      }),
      grain.permission("times", grain.side(grain.named("takings"), "amount"), {
        with: grain.side(grain.named("factor"), "amount"),
        landing: grain.named("takings"),
      }),
      grain.permission("plus", grain.side(grain.named("takings"), "amount"), {
        with: grain.side(grain.named("difference"), "amount"),
        landing: grain.named("takings"),
      }),
    ],
    narrowing: [
      grain.word(
        "sales",
        grain.or(
          grain.madeBy("work out", {
            qualifiers: [["amount", grain.field("amount")]],
            from: setSales,
          }),
          grain.madeBy("spread", { from: grain.named("sales") })
        )
      ),
      grain.word(
        "price",
        grain.or(
          grain.madeBy("work out", {
            qualifiers: [["amount", grain.field("amount")]],
            from: setPrice,
          }),
          grain.madeBy("spread", { from: grain.named("price") })
        )
      ),
      grain.word(
        "factor",
        grain.madeBy("work out", {
          qualifiers: [["amount", grain.field("factor")]],
          from: adjustment,
        })
      ),
      grain.word(
        "difference",
        grain.madeBy("work out", {
          qualifiers: [["amount", grain.field("difference")]],
          from: adjustment,
        })
      ),
      grain.word(
        "replacement",
        grain.madeBy("work out", {
          qualifiers: [["amount", grain.field("amount")]],
          from: adjustment,
        })
      ),
      grain.word(
        "takings",
        grain.or(
          grain.madeBy("override", { from: grain.named("takings") }),
          grain.and(
            grain.madeBy("work out", { from: grain.named("sales") }),
            grain.notWith(grain.and(adjustment, grain.eq("adjusts", "takings")))
          )
        )
      ),
    ],
    rows: [
      grain.workOut("La", setSales, { amount: grain.field("amount") }),
      grain.workOut("Lb", setPrice, { amount: grain.field("amount") }),
      grain.workOut("L2", adjustment, { amount: grain.field("factor") }),
      grain.workOut("L3", adjustment, { amount: grain.field("difference") }),
      grain.workOut("L4", adjustment, { amount: grain.field("amount") }),
      grain.spread("1", salesOrPrice, {
        by: "run",
        factors: grain.named("factor"),
        differences: grain.named("difference"),
        removals: grain.and(rawSalesOrPrice, grain.without("amount")),
      }),
      grain.workOut("2", grain.named("sales"), {
        amount: grain.times(
          grain.base(),
          grain.fieldOf("amount", grain.and(grain.named("price"), grain.without("shop")))
        ),
      }),
      grain.override("3", {
        by: "run",
        factors: grain.named("factor"),
        differences: grain.named("difference"),
        replacements: grain.named("replacement"),
        removals: grain.and(
          adjustment,
          grain.without("factor"),
          grain.without("difference"),
          grain.without("amount")
        ),
      }),
    ],
  });

  return transpileEntitiesToGrain([PriceSeed, SalesSeed, Adjustment], {
    title: "TypeMorph demo coverage - scenario",
    rules,
    inferCurrentWords: false,
  }).markdown;
}


export function expectedFigureDemo(): string {
  @Entity({ name: "count" })
  class Count {
    @Field(TSType.Value, String)
    @Key()
    shop!: string;

    @Field(TSType.Value, Number)
    @Key()
    @Ordered()
    when!: number;

    @Field(TSType.Value, Number)
    @Measure({ ordered: false })
    amount!: number;
  }

  @Entity({ name: "period" })
  class Period {
    @Field(TSType.Value, Number)
    @Key()
    @Ordered()
    when!: number;
  }

  @Entity({ name: "register" })
  class Register {
    @Field(TSType.Value, String)
    @Key()
    shop!: string;

    @Field(TSType.Value, Number)
    @Key()
    when!: number;
  }

  const count = grain.named("count");
  const period = grain.named("period");
  const rules = grainRules({
    permissions: [
      grain.permission(
        "identity",
        grain.side(
          grain.madeBy("work out", {
            qualifiers: [["when", grain.next("when", period)]],
          }),
          "when"
        )
      ),
      grain.permission("compare", grain.side(count, "when"), {
        with: grain.literalSide("number"),
      }),
      grain.permission("compare", grain.side(period, "when"), {
        with: grain.literalSide("number"),
      }),
      grain.permission("times", grain.side(count, "amount"), {
        with: grain.literalSide("number"),
        landing: count,
      }),
    ],
    narrowing: [
      grain.word("period", grain.namedEvent(Period)),
      grain.word(
        "count",
        grain.or(
          grain.madeBy("work out", {
            qualifiers: [["amount", grain.field("amount")]],
            from: grain.namedEvent(Count),
          }),
          grain.madeBy("account for", { from: grain.namedEvent(Register) }),
          grain.madeBy("work out", { from: count })
        )
      ),
      grain.word(
        "unreported",
        grain.and(
          grain.madeBy("account for", { from: grain.namedEvent(Register) }),
          grain.without("amount")
        )
      ),
    ],
    rows: [
      grain.workOut("L", grain.namedEvent(Count), { amount: grain.field("amount") }),
      grain.accountFor(
        "O",
        grain.namedEvent(Register),
        grain.and(
          count,
          grain.madeBy("work out", {
            qualifiers: [["amount", grain.field("amount")]],
          })
        )
      ),
      grain.workOut(
        "1",
        grain.newest(
          "when",
          grain.and(count, grain.downstreamOf(grain.namedEvent(Register))),
          ["shop"]
        ),
        {
          when: grain.next("when", period),
          amount: grain.times(grain.base(), grain.number(2)),
        }
      ),
    ],
  });

  return transpileEntitiesToGrain([Count, Period, Register], {
    title: "TypeMorph demo coverage - expected figure",
    rules,
    inferCurrentWords: false,
  }).markdown;
}

export function simultaneousFixpointDemo(): string {
  @Entity({ name: "cash" })
  class Cash {
    @Field(TSType.Value, String)
    @Key()
    account!: string;

    @Field(TSType.Value, Number)
    @Key()
    when!: number;

    @Field(TSType.Value, Number)
    @Measure({ ordered: false })
    amount!: number;
  }

  const cash = grain.named("cash");
  const closing = grain.named("closing cash");
  const opening = grain.named("opening cash");
  const interest = grain.named("interest");
  const rules = grainRules({
    permissions: [
      grain.permission("compare", grain.side(closing, "when"), {
        with: grain.literalSide("number"),
      }),
      grain.permission("compare", grain.side(closing, "amount")),
      grain.permission("compare", grain.side(opening, "amount")),
      grain.permission("times", grain.side(closing, "amount"), {
        with: grain.literalSide("number"),
        landing: interest,
      }),
      grain.permission("plus", grain.side(opening, "amount"), {
        with: grain.side(interest, "amount"),
        landing: cash,
      }),
    ],
    narrowing: [
      grain.word(
        "cash",
        grain.or(
          grain.madeBy("work out", {
            qualifiers: [["amount", grain.field("amount")]],
            from: grain.namedEvent(Cash),
          }),
          grain.madeBy("group")
        )
      ),
      grain.word("interest", grain.madeBy("work out", { from: cash })),
      grain.word("closing cash", grain.and(cash, grain.madeBy("group"))),
      grain.word(
        "opening cash",
        grain.newest(
          "when",
          grain.and(
            closing,
            grain.compare(grain.field("when"), "<", grain.their("when"))
          ),
          ["account"]
        )
      ),
    ],
    rows: [
      grain.workOut("L", grain.namedEvent(Cash), { amount: grain.field("amount") }),
      grain.workOut("1", closing, {
        amount: grain.times(grain.base(), grain.number(0.01)),
      }),
      grain.group("2", grain.or(opening, interest), ["account", "when"], {
        amount: grain.fold("plus", "amount"),
      }),
      grain.differ("3", null, {
        left: grain.fieldOf("amount", closing),
        right: grain.plus(
          grain.fieldOf("amount", opening),
          grain.fieldOf("amount", interest)
        ),
        apart: grain.number(1, "cent"),
      }),
    ],
  });

  return transpileEntitiesToGrain([Cash], {
    title: "TypeMorph demo coverage - simultaneous fixpoint",
    rules,
    inferCurrentWords: false,
  }).markdown;
}

export function patternSurfaceExamples() {
  const count = grain.named("count");
  const register = grain.named("set register");

  return {
    accountFor: grain.accountFor(
      "O",
      register,
      grain.and(
        count,
        grain.madeBy("work out", { qualifiers: [["amount", grain.field("amount")]] })
      )
    ),
    differ: grain.differ("D", null, {
      left: grain.fieldOf("amount", grain.named("closing cash")),
      right: grain.plus(
        grain.fieldOf("amount", grain.named("opening cash")),
        grain.fieldOf("amount", grain.named("interest"))
      ),
      apart: grain.number(1, "cent"),
    }),
  };
}

export function allGrainDemoCoverageModels(): Record<string, string> {
  return {
    defaultHierarchy: defaultHierarchyDemo(),
    laggedRead: laggedReadDemo(),
    adapter: adapterDemo(),
    stateMachine: stateMachineDemo(),
    declaredOperatorAndGroup: declaredOperatorAndGroupDemo(),
    scenario: scenarioDemo(),
    expectedFigure: expectedFigureDemo(),
    simultaneousFixpoint: simultaneousFixpointDemo(),
  };
}
