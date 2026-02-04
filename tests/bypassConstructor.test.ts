import { describe, it, expect } from "vitest";
import { createInstance } from "../src";
import { TSType } from "../src";
import { RIFTError } from "../src/utils/errors";
import {BypassConstructor} from "../src";
import {Field} from "../src";

/* ------------------------------------------------------------------ */
/* Test classes (decorator-only schemas)                               */
/* ------------------------------------------------------------------ */

@BypassConstructor({ bypassConstructor: true })
class BypassCounter {
  static ctorCalls = 0;

  @Field(TSType.Value)
  value!: number;

  constructor() {
    BypassCounter.ctorCalls++;
  }

  double(): number {
    return this.value * 2;
  }
}

@BypassConstructor({ bypassConstructor: true })
class NestedBypass {
  @Field(TSType.Object, BypassCounter)
  inner!: BypassCounter;

  getInnerValue(): number {
    return this.inner.value;
  }
}

@BypassConstructor({ bypassConstructor: true })
class DefaultValueExample {
  @Field(TSType.Value, () => 123)
  value!: number;
}



class NormalCounter {
  static ctorCalls = 0;

  @Field(TSType.Value)
  value!: number;

  constructor() {
    NormalCounter.ctorCalls++;
  }

  double(): number {
    return this.value * 2;
  }
}

@BypassConstructor()
class UsesConstructor {
  @Field(TSType.Value)
  value!: number;

  constructor() {
    this.value = 100;
  }
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe("createInstance – bypassConstructor (decorator-only)", () => {

  it("does NOT call the constructor when bypassConstructor = true", () => {
    BypassCounter.ctorCalls = 0;

    const inst = createInstance({ value: 10 }, BypassCounter);

    expect(inst).toBeInstanceOf(BypassCounter);
    expect(BypassCounter.ctorCalls).toBe(0);
    expect(inst.value).toBe(10);
  });

  it("still attaches prototype methods when constructor is bypassed", () => {
    const inst = createInstance({ value: 7 }, BypassCounter);

    expect(typeof inst.double).toBe("function");
    expect(inst.double()).toBe(14);
  });

  it("bypasses constructor for nested objects as well", () => {
    BypassCounter.ctorCalls = 0;

    const inst = createInstance(
      { inner: { value: 5 } },
      NestedBypass
    );

    expect(inst.inner).toBeInstanceOf(BypassCounter);
    expect(inst.getInnerValue()).toBe(5);
    expect(BypassCounter.ctorCalls).toBe(0);
  });

  it("still validates required fields when constructor is bypassed", () => {
    expect(() =>
      createInstance({}, BypassCounter)
    ).toThrow(RIFTError);
  });

  it("does NOT bypass constructor when decorator is absent", () => {
    NormalCounter.ctorCalls = 0;

    const inst = createInstance({ value: 3 }, NormalCounter);

    expect(inst).toBeInstanceOf(NormalCounter);
    expect(NormalCounter.ctorCalls).toBe(1);
    expect(inst.value).toBe(3);
  });

  it("does not leak constructor side effects when bypassing", () => {
    BypassCounter.ctorCalls = 0;

    const a = createInstance({ value: 1 }, BypassCounter);
    const b = createInstance({ value: 2 }, BypassCounter);

    expect(BypassCounter.ctorCalls).toBe(0);
    expect(a.double()).toBe(2);
    expect(b.double()).toBe(4);
  });

  it("preserves instanceof semantics when bypassing constructor", () => {
    const inst = createInstance({ value: 42 }, BypassCounter);

    expect(inst instanceof BypassCounter).toBe(true);
    expect(Object.getPrototypeOf(inst)).toBe(BypassCounter.prototype);
  });

  it("does not share state between bypassed instances", () => {
    const a = createInstance({ value: 2 }, BypassCounter);
    const b = createInstance({ value: 9 }, BypassCounter);

    a.value = 100;

    expect(b.value).toBe(9);
  });
    it("applies default factory when value is missing", () => {
    const inst = createInstance({}, DefaultValueExample);
    expect(inst.value).toBe(123);
  });

  it("overrides default factory when input provides a value", () => {
    const inst = createInstance({ value: 999 }, DefaultValueExample);

    expect(inst.value).toBe(999);
  });

  it("does not call constructor when default factory is used", () => {
    BypassCounter.ctorCalls = 0;

    const inst = createInstance({ value: 5 }, BypassCounter);

    expect(inst.value).toBe(5);
    expect(BypassCounter.ctorCalls).toBe(0);
  });

  it("nested non-required objects when missing are null", () => {
    @BypassConstructor({ bypassConstructor: true })
    class ParentWithDefaultChild {
      @Field(TSType.Object, () => ({ value: 7 }), false)
      child!: BypassCounter;
    }

    const inst = createInstance({}, ParentWithDefaultChild);

    expect(inst.child).toBeNull();
  });

  it("routes constructor instantiator through createInstance", () => {
    @BypassConstructor({ bypassConstructor: true })
    class UsesConstructorInstantiator {
      @Field(TSType.Object, BypassCounter)
      child!: BypassCounter;
    }

    BypassCounter.ctorCalls = 0;

    const inst = createInstance(
      { child: { value: 4 } },
      UsesConstructorInstantiator
    );

    expect(inst.child).toBeInstanceOf(BypassCounter);
    expect(inst.child.value).toBe(4);
    expect(BypassCounter.ctorCalls).toBe(0);
  });

  it("throws when required field has no input and no default factory", () => {
    expect(() =>
      createInstance({}, BypassCounter)
    ).toThrow(RIFTError);
  });

  it("sets optional field to null when missing and no default factory exists", () => {
    @BypassConstructor({ bypassConstructor: true })
    class OptionalFieldExample {
      @Field(TSType.Value, null, false)
      maybe?: string;
    }

    const inst = createInstance({}, OptionalFieldExample);

    expect(inst.maybe).toBeNull();
  });

  it("ignores constructor defaults when bypassConstructor is true", () => {
    @BypassConstructor({ bypassConstructor: true })
    class ConstructorDefaultIgnored {
      @Field(TSType.Value)
      value!: number;

      constructor() {
        this.value = 777;
      }
    }

    expect(() =>
      createInstance({}, ConstructorDefaultIgnored)
    ).toThrow(RIFTError);
  });


});
