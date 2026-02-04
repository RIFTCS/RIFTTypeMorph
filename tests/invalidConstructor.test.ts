import { describe, it, expect } from "vitest";
import { createInstance } from "../src";
import { Field, OptionalField, BypassConstructor, TSType } from "../src";
import { RIFTError } from "../src/utils/errors";

/* -------------------------------------------------
 * Test helpers
 * ------------------------------------------------- */

function expectRIFT(fn: () => any, msg?: RegExp) {
    try {
        fn();
        throw new Error("Expected RIFTError, but nothing was thrown");
    } catch (e: any) {
        expect(e).toBeInstanceOf(RIFTError);
        if (msg) {
            expect(e.message).toMatch(msg);
        }
    }
}

/* -------------------------------------------------
 * Constructor arity guard
 * ------------------------------------------------- */

describe("createInstance – constructor arity safety", () => {

    it("throws when constructor declares parameters and bypass is not enabled", () => {
        class Dangerous {
            constructor({ x }: { x: number }) {}
        }

        expectRIFT(
            () => createInstance({ x: 1 }, Dangerous),
            /requires arguments.*Consider using @BypassConstructor/i
        );
    });

    it("includes class name in the error message", () => {
        class NeedsArgs {
            constructor(a: number) {}
        }

        expectRIFT(
            () => createInstance({}, NeedsArgs),
            /NeedsArgs/
        );
    });

    it("respects collectErrors for constructor arity failure", () => {
        class NeedsArgs {
            constructor(a: number) {}
        }

        const res = createInstance(
            {},
            NeedsArgs,
            null,
            "root",
            { collectErrors: true }
        ) as any;

        expect(res.instance).toBeNull();
        expect(res.errors).toHaveLength(1);
        expect(res.errors[0]).toBeInstanceOf(RIFTError);
        expect(res.errors[0].message).toMatch(/Consider using @BypassConstructor/i);
    });
});

/* -------------------------------------------------
 * bypassConstructor behavior
 * ------------------------------------------------- */

describe("createInstance – bypassConstructor interaction", () => {

    it("allows instantiation when @BypassConstructor is present", () => {
        @BypassConstructor()
        class Bypassed {
            constructor({ x }: { x: number }) {
                throw new Error("should not run");
            }
        }

        const instance = createInstance({ x: 1 }, Bypassed);
        expect(instance).toBeInstanceOf(Bypassed);
    });

    it("allows instantiation when options.bypassConstructor = true", () => {
        class NeedsArgs {
            constructor(a: number) {
                throw new Error("should not run");
            }
        }

        const instance = createInstance(
            { a: 1 },
            NeedsArgs,
            null,
            "root",
            { bypassConstructor: true }
        );

        expect(instance).toBeInstanceOf(NeedsArgs);
    });

    it("does NOT call the constructor when bypassed", () => {
        let called = false;

        @BypassConstructor()
        class Test {
            constructor() {
                called = true;
            }
        }

        createInstance({}, Test);
        expect(called).toBe(false);
    });
});

/* -------------------------------------------------
 * Constructor throwing
 * ------------------------------------------------- */

describe("createInstance – constructor exception handling", () => {

    it("wraps constructor exceptions in a RIFTError", () => {
        class Explodes {
            constructor() {
                throw new Error("boom");
            }
        }

        expectRIFT(
            () => createInstance({}, Explodes),
            /Error during construction.*boom/i
        );
    });

    it("includes class name when constructor throws", () => {
        class NamedExplosion {
            constructor() {
                throw new Error("kaput");
            }
        }

        expectRIFT(
            () => createInstance({}, NamedExplosion),
            /NamedExplosion/
        );
    });

    it("respects collectErrors when constructor throws", () => {
        class Explodes {
            constructor() {
                throw new Error("boom");
            }
        }

        const res = createInstance(
            {},
            Explodes,
            null,
            "root",
            { collectErrors: true }
        ) as any;

        expect(res.instance).toBeNull();
        expect(res.errors).toHaveLength(1);
        expect(res.errors[0].message).toMatch(/Error during construction/i);
    });
});

/* -------------------------------------------------
 * Nested contexts
 * ------------------------------------------------- */

describe("createInstance – nested constructor safety", () => {

    class Child {
        constructor({ value }: { value: number }) {}
    }

    class Parent {
        @Field(TSType.Object, Child)
        child!: Child;
    }

    it("throws with correct path when nested constructor is unsafe", () => {
        expectRIFT(
            () => createInstance({ child: { value: 1 } }, Parent),
            /\broot\.child\b/
        );
    });

    it("collects nested constructor errors with correct path", () => {
        const res = createInstance(
            { child: { value: 1 } },
            Parent,
            null,
            "root",
            { collectErrors: true }
        ) as any;

        expect(res.instance).toBeInstanceOf(Parent);
        expect(res.errors).toHaveLength(1);
        expect(res.errors[0].message).toMatch(/root\.child/);
    });
});

/* -------------------------------------------------
 * Array contexts
 * ------------------------------------------------- */

describe("createInstance – array constructor safety", () => {

    class Item {
        constructor({ x }: { x: number }) {}
    }

    class Container {
        @Field(TSType.Array, Item)
        items!: Item[];
    }

    it("throws when array element constructor is unsafe", () => {
        expectRIFT(
            () => createInstance({ items: [{ x: 1 }] }, Container),
            /\[root\.items\[0\]\]/
        );
    });

    it("collects array element constructor errors", () => {
        const res = createInstance(
            { items: [{ x: 1 }] },
            Container,
            null,
            "root",
            { collectErrors: true }
        ) as any;

        expect(res.instance).toBeInstanceOf(Container);
        expect(res.errors).toHaveLength(1);
        expect(res.errors[0].message).toMatch(/items\[0\]/);
    });
});

/* -------------------------------------------------
 * Sanity: zero-arg constructors still work
 * ------------------------------------------------- */

describe("createInstance – zero-arg constructors", () => {

    class Safe {
        @Field(TSType.Value)
        x!: number;

        constructor() {}
    }

    it("allows zero-arg constructors", () => {
        const inst = createInstance({ x: 5 }, Safe);
        expect(inst).toBeInstanceOf(Safe);
        expect(inst.x).toBe(5);
    });
});
