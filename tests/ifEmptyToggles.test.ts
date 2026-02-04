import { describe, it, expect } from "vitest";
import { RIFTError } from "../src/utils/errors";
import {BypassConstructor, createInstance, Field, OptionalField, TSType} from "../src";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function expectRIFT(fn: () => any, message?: RegExp) {
  try {
    fn();
    throw new Error("Expected RIFTError");
  } catch (e: any) {
    expect(e).toBeInstanceOf(RIFTError);
    if (message) {
      expect(e.message).toMatch(message);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Required vs Optional                                                */
/* ------------------------------------------------------------------ */

describe("TSType.Value – required / optional (full signature)", () => {
  it("throws when required value is missing", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @Field(TSType.Value)
      x!: number;
    }

    expectRIFT(() =>
      createInstance({}, A, null, "root")
    );
  });

  it("sets optional value to null when missing", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @OptionalField(TSType.Value)
      x!: number;
    }

    const inst = createInstance({}, A, null, "root") as A;
    expect(inst.x).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* ifEmpty semantics                                                   */
/* ------------------------------------------------------------------ */

describe("TSType.Value – ifEmpty semantics (full signature)", () => {
  it("applies ifEmpty when value is undefined", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @OptionalField(TSType.Value, null, () => 123)
      x!: number;
    }

    const inst = createInstance({}, A, null, "root") as A;
    expect(inst.x).toBe(123);
  });

  it("applies ifEmpty when value is null by default", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @OptionalField(TSType.Value, null, () => 123)
      x!: number;
    }

    const inst = createInstance({ x: null }, A, null, "root") as A;
    expect(inst.x).toBe(123);
  });

  it("does NOT apply ifEmpty to null when dontReplaceNullWithIfEmpty=true", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @OptionalField(TSType.Value, null, () => 123)
      x!: number;
    }

    const inst = createInstance(
      { x: null },
      A,
      null,
      "root",
      { dontReplaceNullWithIfEmpty: true }
    ) as A;

    expect(inst.x).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* errorForNullRequired                                                */
/* ------------------------------------------------------------------ */

describe("errorForNullRequired (full signature)", () => {
  it("throws when required field is null", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @Field(TSType.Value)
      x!: number;
    }

    expectRIFT(() =>
      createInstance(
        { x: null },
        A,
        null,
        "root",
        { errorForNullRequired: true }
      )
    );
  });

  it("does NOT throw when ifEmpty handles null", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @OptionalField(TSType.Value, null, () => null)
      x!: number;
    }

    const inst = createInstance(
      { x: null },
      A,
      null,
      "root",
      { errorForNullRequired: true }
    ) as A;

    expect(inst.x).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Value instantiator semantics                                        */
/* ------------------------------------------------------------------ */

describe("TSType.Value – instantiator semantics (full signature)", () => {
  it("passes value through identity coercion", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @Field(TSType.Value, (v: number) => v)
      x!: number;
    }

    const inst = createInstance(
      { x: 42 },
      A,
      null,
      "root"
    ) as A;

    expect(inst.x).toBe(42);
  });

  it("constant factory always overrides provided input", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @Field(TSType.Value, () => 123)
      x!: number;
    }

    const inst = createInstance(
      { x: 999 },
      A,
      null,
      "root"
    ) as A;

    expect(inst.x).toBe(123);
  });

  it("throws if value factory throws", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @Field(TSType.Value, () => {
        throw new Error("boom");
      })
      x!: number;
    }

    expectRIFT(() =>
      createInstance({ x: 1 }, A, null, "root")
    );
  });
});

/* ------------------------------------------------------------------ */
/* Constructor coercion (Date, etc.)                                   */
/* ------------------------------------------------------------------ */

describe("TSType.Value – constructor coercion (full signature)", () => {
  it("constructs Date from string", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @Field(TSType.Value, Date)
      d!: Date;
    }

    const inst = createInstance(
      { d: "2025-01-01T00:00:00.000Z" },
      A,
      null,
      "root"
    ) as A;

    expect(inst.d).toBeInstanceOf(Date);
    expect(inst.d.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });


});

/* ------------------------------------------------------------------ */
/* dontReplaceNullWithIfEmpty                                          */
/* ------------------------------------------------------------------ */

describe("dontReplaceNullWithIfEmpty (full signature)", () => {
  it("still replaces undefined with ifEmpty", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @OptionalField(TSType.Value, null, () => 123)
      x!: number;
    }

    const inst = createInstance(
      {},
      A,
      null,
      "root",
      { dontReplaceNullWithIfEmpty: true }
    ) as A;

    expect(inst.x).toBe(123);
  });

  it("preserves explicit null", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @OptionalField(TSType.Value, null, () => 123)
      x!: number;
    }

    const inst = createInstance(
      { x: null },
      A,
      null,
      "root",
      { dontReplaceNullWithIfEmpty: true }
    ) as A;

    expect(inst.x).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Regression guards                                                   */
/* ------------------------------------------------------------------ */

describe("Regression guards (full signature)", () => {
  it("does not call ifEmpty when value is provided", () => {
    let called = false;

    @BypassConstructor({ bypassConstructor: true })
    class A {
      @OptionalField(TSType.Value, null, () => {
        called = true;
        return 123;
      })
      x!: number;
    }

    const inst = createInstance(
      { x: 10 },
      A,
      null,
      "root"
    ) as A;

    expect(inst.x).toBe(10);
    expect(called).toBe(false);
  });

  it("does not allow required value to be defaulted", () => {
    @BypassConstructor({ bypassConstructor: true })
    class A {
      @Field(TSType.Value, () => 123)
      x!: number;
    }

    expectRIFT(() =>
      createInstance({}, A, null, "root")
    );
  });
});