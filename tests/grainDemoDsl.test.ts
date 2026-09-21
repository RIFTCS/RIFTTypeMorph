import { describe, expect, it } from "vitest";
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
  inferGrainModel,
  renderGrainSelection,
  renderGrainTerm,
  transpileEntitiesToGrain,
} from "../src";

describe("Grain demo-surface DSL", () => {
  it("infers a current word for effective-dated ER entities", () => {
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

    const model = inferGrainModel([Price]);
    expect(model.narrowing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "current price",
          selects: "newest by when of named set price per shop",
        }),
      ])
    );
  });

  it("renders coalesce, window, lineage and state-machine selections without raw Grain strings", () => {
    const fallback = grain.times(
      grain.base(),
      grain.then(
        grain.fieldOf("amount", grain.named("price")),
        grain.fieldOf("amount", grain.and(grain.named("price"), grain.without("shop")))
      )
    );
    expect(renderGrainTerm(fallback)).toBe(
      "base times (amount of named price then amount of (named price and without shop))"
    );

    const prior = grain.newest(
      "when",
      grain.and(
        grain.named("count"),
        grain.compare(grain.field("when"), "<", grain.their("when"))
      ),
      ["shop"]
    );
    expect(renderGrainSelection(prior)).toBe(
      "newest by when of (named count and when < their when) per shop"
    );

    expect(
      renderGrainSelection(
        grain.upstreamOf(grain.named("settlement"), grain.without("amount"))
      )
    ).toBe("upstream of named settlement while without amount");

    const open = grain.and(
      grain.named("open shop"),
      grain.compare(grain.field("when"), "<=", grain.their("when"))
    );
    const closed = grain.and(
      grain.named("close shop"),
      grain.compare(grain.field("when"), "<=", grain.their("when"))
    );
    expect(
      renderGrainSelection(
        grain.and(grain.named("sales"), grain.with(open), grain.notWith(closed))
      )
    ).toBe(
      "named sales and with (named open shop and when <= their when) and not with (named close shop and when <= their when)"
    );
  });

  it("expresses all six Grain row patterns", () => {
    const rows = [
      grain.workOut("W", grain.named("input"), { amount: grain.base() }),
      grain.accountFor("A", grain.named("register"), grain.named("figure")),
      grain.group("G", grain.named("item"), ["order"], {
        amount: grain.fold("plus", "amount"),
      }),
      grain.differ("D", null, {
        left: grain.fieldOf("amount", grain.named("left")),
        right: grain.fieldOf("amount", grain.named("right")),
        apart: grain.number(1, "cent"),
      }),
      grain.spread("S", grain.named("value"), {
        by: "run",
        factors: grain.named("factor"),
        removals: grain.and(grain.named("set value"), grain.without("amount")),
      }),
      grain.override("O", {
        by: "run",
        replacements: grain.named("replacement"),
        removals: grain.and(grain.named("adjustment"), grain.without("amount")),
      }),
    ];

    expect(rows.map((row) => row.pattern)).toEqual([
      "work out",
      "account for",
      "group",
      "differ",
      "spread",
      "override",
    ]);
    expect(rows[3].parameters).toBe(
      "left: amount of named left; right: amount of named right; apart: 1 cent"
    );
  });

  it("supports event-name overrides, Fields rows, declared operators, examples and expected checks", () => {
    @Entity({ name: "shop opening", eventName: "open shop" })
    class Opening {
      @Field(TSType.Value, String)
      @Key()
      shop!: string;

      @Field(TSType.Value, Number)
      @Key()
      @Ordered()
      when!: number;
    }

    @Entity({ name: "reading" })
    class Reading {
      @Field(TSType.Value, String)
      @Key()
      meter!: string;

      @Field(TSType.Value, Number)
      @Measure({ ordered: false })
      amount!: number;
    }

    const rules = grainRules({
      fieldRows: [grain.fields(grain.madeBy("world"), ["run"])],
      permissions: [
        grain.permission("greater of", grain.side(grain.namedEvent(Reading), "amount"), {
          with: grain.literalSide("number"),
          landing: grain.named("peak"),
          evidence: "foldable, identity 0",
        }),
      ],
      narrowing: [grain.word("opening", grain.namedEvent(Opening))],
      rows: [
        grain.workOut("1", grain.namedEvent(Reading), {
          amount: grain.op("greater of", grain.field("amount"), grain.number(0)),
        }),
      ],
      supplied: [grain.supplied(Opening, { shop: "Hill", when: 2020 })],
      expected: [grain.expected(grain.named("opening"), { count: 1 })],
    });

    const output = transpileEntitiesToGrain([Opening, Reading], {
      title: "Demo surface",
      rules,
      inferCurrentWords: false,
    }).markdown;

    expect(output).toContain("| open shop | fields: add shop; add when |");
    expect(output).toContain("## Fields rows");
    expect(output).toContain("| made by world | fields: add run |");
    expect(output).toContain("| greater of | named set reading on amount with number -> named peak | foldable, identity 0 |");
    expect(output).toContain("## Examples: supplied events");
    expect(output).toContain("| open shop | shop: Hill; when: 2020 |");
    expect(output).toContain("| named opening | count 1 |");
  });
});
