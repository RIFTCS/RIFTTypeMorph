import {
  Applicable,
  EffectiveAt,
  Entity,
  Field,
  From,
  Grouped,
  Key,
  Latest,
  Next,
  Measure,
  TSType,
  Transform,
  Previous,
  defineTransformOperator,
  maximum,
  sum,
  transpileExecutableTransformsToGrain,
} from "../src";

export function defaultHierarchyExecutableExample() {
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
      @Applicable(Price, { without: ["shop"] }) defaultPrice: Price
    ) {
      return {
        amount: sale.amount * (price?.amount ?? defaultPrice.amount),
      };
    }
  }

  const hill = RetailTransforms.takings(
    { shop: "Hill", amount: 100 } as Sales,
    { shop: "Hill", amount: 7 } as Price,
    { amount: 5 } as Price
  );
  const dale = RetailTransforms.takings(
    { shop: "Dale", amount: 40 } as Sales,
    undefined,
    { amount: 5 } as Price
  );

  const generated = transpileExecutableTransformsToGrain(
    [Price, Sales],
    [RetailTransforms],
    { title: "Executable transform - default hierarchy" }
  );

  return { hill, dale, generated };
}

export function laggedReadExecutableExample() {
  @Entity({ name: "count" })
  class Count {
    @Field(TSType.Value, String)
    @Key()
    shop!: string;

    @Field(TSType.Value, Number)
    @EffectiveAt()
    when!: number;

    @Field(TSType.Value, Number)
    amount!: number;
  }

  class CountTransforms {
    @Transform("growth")
    static growth(
      @From(Count) current: Count,
      @Previous(Count) previous: Count | undefined
    ) {
      if (!previous) return;
      return { amount: current.amount / previous.amount };
    }
  }

  const native = CountTransforms.growth(
    { shop: "Hill", when: 2, amount: 20 } as Count,
    { shop: "Hill", when: 1, amount: 10 } as Count
  );
  const generated = transpileExecutableTransformsToGrain(
    [Count],
    [CountTransforms],
    { title: "Executable transform - lagged read" }
  );
  return { native, generated };
}

export function lifecycleExecutableExample() {
  @Entity({ name: "sales", eventName: "log sales" })
  class Sales {
    @Field(TSType.Value, String)
    @Key()
    shop!: string;

    @Field(TSType.Value, Number)
    @EffectiveAt()
    when!: number;

    @Field(TSType.Value, Number)
    amount!: number;
  }

  @Entity({ name: "shop opening", eventName: "open shop" })
  class OpenShop {
    @Field(TSType.Value, String)
    @Key()
    shop!: string;

    @Field(TSType.Value, Number)
    @EffectiveAt()
    when!: number;
  }

  @Entity({ name: "shop closing", eventName: "close shop" })
  class CloseShop {
    @Field(TSType.Value, String)
    @Key()
    shop!: string;

    @Field(TSType.Value, Number)
    @EffectiveAt()
    when!: number;
  }

  class ShopTransforms {
    @Transform("takings")
    static takings(
      @From(Sales) sale: Sales,
      @Applicable(OpenShop) opened: OpenShop | undefined,
      @Applicable(CloseShop) closed: CloseShop | undefined
    ) {
      if (!opened || closed) return;
      return { amount: sale.amount * 5 };
    }
  }

  const nativeOpen = ShopTransforms.takings(
    { shop: "Hill", when: 2, amount: 10 } as Sales,
    { shop: "Hill", when: 1 } as OpenShop,
    undefined
  );
  const nativeClosed = ShopTransforms.takings(
    { shop: "Hill", when: 4, amount: 10 } as Sales,
    { shop: "Hill", when: 1 } as OpenShop,
    { shop: "Hill", when: 3 } as CloseShop
  );
  const generated = transpileExecutableTransformsToGrain(
    [Sales, OpenShop, CloseShop],
    [ShopTransforms],
    { title: "Executable transform - lifecycle gate" }
  );
  return { nativeOpen, nativeClosed, generated };
}

export function groupedReductionExecutableExample() {
  @Entity({ name: "invoice", eventName: "log invoice" })
  class Invoice {
    @Field(TSType.Value, String)
    @Key()
    invoice!: string;

    @Field(TSType.Value, String)
    day!: string;

    @Field(TSType.Value, Number)
    amount!: number;
  }

  class InvoiceTransforms {
    @Transform("daily total")
    static dailyTotal(@Grouped(Invoice, { per: ["day"] }) invoices: Invoice[]) {
      return { amount: sum(invoices, (invoice) => invoice.amount) };
    }
  }

  const native = InvoiceTransforms.dailyTotal([
    { invoice: "a", day: "Mon", amount: 10 } as Invoice,
    { invoice: "b", day: "Mon", amount: 15 } as Invoice,
  ]);
  const generated = transpileExecutableTransformsToGrain(
    [Invoice],
    [InvoiceTransforms],
    { title: "Executable transform - grouped reduction" }
  );
  return { native, generated };
}

export function adapterExecutableExample() {
  const centsToDollars = defineTransformOperator(
    "cents to dollars",
    (cents: number) => cents / 100
  );

  @Entity({ name: "advance", eventName: "set advance" })
  class Advance {
    @Field(TSType.Value, String)
    provider!: string;

    @Field(TSType.Value, Number)
    principal!: number;
  }

  class LoanTransforms {
    @Transform("loan", { identity: ["party"] })
    static loan(@From(Advance) advance: Advance) {
      return {
        amount: centsToDollars(advance.principal),
        party: advance.provider,
      };
    }
  }

  const native = LoanTransforms.loan({ provider: "Bank", principal: 1234 } as Advance);
  const generated = transpileExecutableTransformsToGrain(
    [Advance],
    [LoanTransforms],
    { title: "Executable transform - adapter" }
  );
  return { native, generated };
}

export function stateChainExecutableExample() {
  @Entity({ name: "tank" })
  class Tank {
    @Field(TSType.Value, String)
    @Key()
    car!: string;

    @Field(TSType.Value, Number)
    @EffectiveAt()
    when!: number;

    @Field(TSType.Value, Number)
    amount!: number;
  }

  @Entity({ name: "day" })
  class Day {
    @Field(TSType.Value, Number)
    @EffectiveAt()
    when!: number;
  }

  @Entity({ name: "use" })
  class Use {
    @Field(TSType.Value, Number)
    amount!: number;
  }

  @Entity({ name: "refill", eventName: "log refill" })
  class Refill {
    @Field(TSType.Value, String)
    @Key()
    car!: string;

    @Field(TSType.Value, Number)
    @EffectiveAt()
    when!: number;

    @Field(TSType.Value, Number)
    amount!: number;
  }

  class TankTransforms {
    @Transform("tank", { seed: Tank, identity: ["when"] })
    static step(
      @Latest("tank", { by: "when", per: ["car"] }) tank: Tank,
      @Next(Day, { by: "when" }) day: Day,
      @From(Use) use: Use,
      @Applicable(Refill) refill: Refill | undefined
    ) {
      return {
        when: day.when,
        amount: tank.amount - use.amount + (refill?.amount ?? 0),
      };
    }
  }

  const native = TankTransforms.step(
    { car: "van", when: 0, amount: 40 } as Tank,
    { when: 1 } as Day,
    { amount: 10 } as Use,
    undefined
  );
  const generated = transpileExecutableTransformsToGrain(
    [Tank, Day, Use, Refill],
    [TankTransforms],
    { title: "Executable transform - state chain" }
  );
  return { native, generated };
}

export function validationExecutableExample() {
  @Entity({ name: "invoice", eventName: "log invoice" })
  class Invoice {
    @Field(TSType.Value, String)
    @Key()
    customer!: string;

    @Field(TSType.Value, Number)
    amount!: number;
  }

  @Entity({ name: "credit limit" })
  class CreditLimit {
    @Field(TSType.Value, String)
    @Key()
    customer!: string;

    @Field(TSType.Value, Number)
    limit!: number;
  }

  class ValidationTransforms {
    @Transform("approved")
    static approved(
      @From(Invoice) invoice: Invoice,
      @Applicable(CreditLimit) credit: CreditLimit | undefined
    ) {
      if (!credit || invoice.amount > credit.limit) return;
      return { amount: invoice.amount };
    }
  }

  const nativeApproved = ValidationTransforms.approved(
    { customer: "A", amount: 50 } as Invoice,
    { customer: "A", limit: 100 } as CreditLimit
  );
  const nativeRejected = ValidationTransforms.approved(
    { customer: "A", amount: 150 } as Invoice,
    { customer: "A", limit: 100 } as CreditLimit
  );
  const generated = transpileExecutableTransformsToGrain(
    [Invoice, CreditLimit],
    [ValidationTransforms],
    { title: "Executable transform - validation guard" }
  );
  return { nativeApproved, nativeRejected, generated };
}

export function maximumReductionExecutableExample() {
  @Entity({ name: "reading" })
  class Reading {
    @Field(TSType.Value, String)
    @Key()
    meter!: string;

    @Field(TSType.Value, Number)
    amount!: number;
  }

  class ReadingTransforms {
    @Transform("peak")
    static peak(@Grouped(Reading, { per: ["meter"] }) readings: Reading[]) {
      return { amount: maximum(readings, (reading) => reading.amount, 0) };
    }
  }

  const native = ReadingTransforms.peak([
    { meter: "A", amount: 4 } as Reading,
    { meter: "A", amount: 9 } as Reading,
    { meter: "A", amount: 3 } as Reading,
  ]);
  const generated = transpileExecutableTransformsToGrain(
    [Reading],
    [ReadingTransforms],
    { title: "Executable transform - custom fold reduction" }
  );
  return { native, generated };
}
