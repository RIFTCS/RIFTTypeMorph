import {describe, it, expect} from "vitest";
import {createInstance, Field, OptionalField, TSField, TSType} from "../src";
import {RIFTError} from "../src/utils/errors";

/**
 * Helper to assert that no TSField exists anywhere
 * in an object graph.
 */
function assertNoTSField(value: any) {
    if (value == null || typeof value !== "object") return;
    expect(value).not.toBeInstanceOf(TSField);
    for (const v of Object.values(value)) {
        assertNoTSField(v);
    }
}

describe("schema inheritance and prototype safety", () => {

    it("hydrates fields from both base and derived classes", () => {
        class Base {
            @Field(TSType.Value)
            id!: string;
        }

        class Derived extends Base {
            @Field(TSType.Value)
            name!: string;
        }

        const inst = createInstance(
            {id: "123", name: "test"},
            Derived
        ) as Derived;

        expect(inst.id).toBe("123");
        expect(inst.name).toBe("test");

        assertNoTSField(inst);
    });

    it("does not duplicate inherited schema fields on the prototype", () => {
        class Base {
            @Field(TSType.Value)
            id!: string;
        }

        class Derived extends Base {
            @Field(TSType.Value)
            name!: string;
        }

        createInstance({id: "x", name: "y"}, Derived);

        const baseProto = Base.prototype as any;
        const derivedProto = Derived.prototype as any;

        // Derived defines only its own schema slot
        expect(derivedProto.name).toBeInstanceOf(TSField);

        // Base field must NOT be duplicated onto Derived.prototype
        expect(
            Object.prototype.hasOwnProperty.call(derivedProto, "id")
        ).toBe(true);

        expect(derivedProto.id).toBeInstanceOf(TSField);


        // Base schema still exists (in metadata)
        expect(baseProto.__schemaFields.id).toBeInstanceOf(TSField);
    });

    it("supports expando on base class only", () => {
        class Base {
            @Field(TSType.Value)
            id!: string;

            @Field(TSType.Expando)
            extra!: Record<string, any>;
        }

        class Derived extends Base {
            @Field(TSType.Value)
            name!: string;
        }

        const inst = createInstance(
            {id: "1", name: "d", x: 10},
            Derived
        ) as Derived;

        expect(inst.extra).toEqual({x: 10});
        expect(inst.name).toBe("d");

        assertNoTSField(inst);
    });

    it("supports expando on derived class only", () => {
        class Base {
            @Field(TSType.Value)
            id!: string;
        }

        class Derived extends Base {
            @Field(TSType.Expando)
            extra!: Record<string, any>;
        }

        const inst = createInstance(
            {id: "1", x: 10},
            Derived
        ) as Derived;

        expect(inst.extra).toEqual({x: 10});
        assertNoTSField(inst);
    });

    it("does not allow multiple expandos across inheritance hierarchy", () => {
        class Base {
            @Field(TSType.Expando)
            extra1!: Record<string, any>;
        }

        class Derived extends Base {
            @Field(TSType.Expando)
            extra2!: Record<string, any>;
        }

        expect(() =>
            createInstance({x: 1}, Derived)
        ).toThrow(/Multiple expando properties/);
    });

    it("does not share expando state between base and derived instances", () => {
        class Base {
            @Field(TSType.Expando)
            extra!: Record<string, any>;
        }

        class Derived extends Base {
            @Field(TSType.Value)
            id!: string;
        }

        const a = createInstance({id: "a", x: 1}, Derived) as Derived;
        const b = createInstance({id: "b", y: 2}, Derived) as Derived;

        a.extra.z = 999;

        expect(a.extra).toEqual({x: 1, z: 999});
        expect(b.extra).toEqual({y: 2});

        assertNoTSField(a);
        assertNoTSField(b);
    });

    it("inherits optional fields correctly", () => {
        class Base {
            @OptionalField(TSType.Value)
            maybe!: string | null;
        }

        class Derived extends Base {
            @Field(TSType.Value)
            id!: string;
        }

        const inst = createInstance(
            {id: "x"},
            Derived
        ) as Derived;

        expect(inst.maybe).toBeNull();
        expect(inst.id).toBe("x");

        assertNoTSField(inst);
    });

    it("does not mutate base prototype when creating derived instances", () => {
        class Base {
            @Field(TSType.Value)
            id!: string;
        }

        class Derived extends Base {
            @Field(TSType.Value)
            name!: string;
        }

        createInstance({id: "1", name: "a"}, Derived);

        const baseProto = Base.prototype as any;
        const derivedProto = Derived.prototype as any;

        // Base schema exists in metadata (canonical)
        expect(baseProto.__schemaFields.id).toBeInstanceOf(TSField);

        // Base prototype was NOT polluted with derived schema
        expect(baseProto.name).toBeUndefined();

        // Derived prototype exposes full effective schema (Option A)
        expect(derivedProto.id).toBeInstanceOf(TSField);
        expect(derivedProto.name).toBeInstanceOf(TSField);
    });

});

describe("createInstance – type mismatch handling", () => {

    it("throws when Object field receives a primitive", () => {
        class Example {
            @Field(TSType.Object, Example)
            child!: Example;
        }

        expect(() =>
            createInstance({ child: 123 }, Example)
        ).toThrow(RIFTError);
    });

    it("throws when Array field receives a non-array", () => {
        class Example {
            @Field(TSType.Array, Example)
            items!: Example[];
        }

        expect(() =>
            createInstance({ items: {} }, Example)
        ).toThrow(RIFTError);
    });

    it("allows Value field to receive any primitive", () => {
        class Example {
            @Field(TSType.Value)
            value!: any;
        }

        const inst = createInstance({ value: { x: 1 } }, Example) as Example;
        expect(inst.value).toEqual({ x: 1 });
    });

});

/* ------------------------------------------------------------------ */
/* collectErrors deep behavior                                         */
/* ------------------------------------------------------------------ */

describe("createInstance – deep collectErrors behavior", () => {

    it("collects multiple sibling errors instead of throwing", () => {
        class Example {
            @Field(TSType.Value)
            a!: string;

            @Field(TSType.Value)
            b!: string;
        }

        const res = createInstance(
            { a: null, b: null },
            Example,
            null,
            "root",
            { collectErrors: true, errorForNullRequired: true }
        );

        expect(res.errors.length).toBe(2);
        expect(res.instance).toBeTruthy();
    });

    it("continues hydrating valid fields when errors occur", () => {
        class Example {
            @Field(TSType.Value)
            ok!: string;

            @Field(TSType.Value)
            bad!: string;
        }

        const res = createInstance(
            { ok: "yes", bad: null },
            Example,
            null,
            "root",
            { collectErrors: true, errorForNullRequired: true}
        );

        expect(res.instance?.ok).toBe("yes");
        expect(res.instance?.bad).toBeNull();
        expect(res.errors.length).toBe(1);
    });

    it("collects nested array element errors", () => {
        class Child {
            @Field(TSType.Value)
            id!: string;
        }

        class Parent {
            @Field(TSType.Array, Child)
            children!: Child[];
        }

        const res = createInstance(
            {
                children: [
                    { id: "ok" },
                    { id: null },
                    "invalid"
                ]
            },
            Parent,
            null,
            "root",
            { collectErrors: true }
        );

        expect(res.errors.length).toBeGreaterThan(0);
        expect(res.instance?.children.length).toBe(3);
        expect(res.instance?.children[0]?.id).toBe("ok");
    });

});

/* ------------------------------------------------------------------ */
/* bypassConstructor + errors                                          */
/* ------------------------------------------------------------------ */

describe("createInstance – bypassConstructor with errors", () => {

    it("does not call constructor even when errors occur", () => {
        let constructed = false;

        class Example {
            constructor() {
                constructed = true;
            }

            @Field(TSType.Value)
            id!: string;
        }

        const res = createInstance(
            { id: null },
            Example,
            null,
            "root",
            { bypassConstructor: true, collectErrors: true, errorForNullRequired: true}
        );

        expect(constructed).toBe(false);
        expect(res.errors.length).toBe(1);
    });

    it("collects errors when default factory throws under bypassConstructor", () => {
        class Example {
            @Field(TSType.Value, () => {
                throw new Error("boom");
            })
            value!: number;
        }

        const res = createInstance(
            {},
            Example,
            null,
            "root",
            { bypassConstructor: true, collectErrors: true }
        );

        expect(res.errors.length).toBe(1);
        expect(res.instance?.value).toBeNull();
    });

});

/* ------------------------------------------------------------------ */
/* undefined vs missing semantics                                      */
/* ------------------------------------------------------------------ */

describe("createInstance – undefined vs missing semantics", () => {

    it("treats explicit undefined the same as missing", () => {
        class Example {
            @OptionalField(TSType.Value)
            value!: string | null;
        }

        const inst = createInstance(
            { value: undefined },
            Example
        ) as Example;

        expect(inst.value).toBeNull();
    });

    it("handles sparse arrays without crashing", () => {
        class Example {
            @Field(TSType.Array, Example)
            items!: Example[];
        }

        const data: any = [];
        data[1] = {};

        const res = createInstance(
            { items: data },
            Example,
            null,
            "root",
            { collectErrors: true }
        );

        expect(res.instance?.items.length).toBe(2);
    });

});

/* ------------------------------------------------------------------ */
/* instantiator edge cases                                             */
/* ------------------------------------------------------------------ */

describe("createInstance – instantiator edge cases", () => {

    it("throws if instantiator returns undefined for Object field", () => {
        class Child {}

        class Parent {
            @Field(TSType.Object, () => undefined)
            child!: Child;
        }

        expect(() =>
            createInstance({ child: {} }, Parent)
        ).toThrow(RIFTError);
    });

    it("collects error if instantiator throws", () => {
        class Parent {
            @Field(TSType.Object, () => {
                throw new Error("bad");
            })
            child!: any;
        }

        const res = createInstance(
            { child: {} },
            Parent,
            null,
            "root",
            { collectErrors: true }
        );

        expect(res.errors.length).toBe(1);
        expect(res.instance?.child).toBeNull();
    });

});