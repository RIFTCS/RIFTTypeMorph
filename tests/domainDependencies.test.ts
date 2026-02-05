import { describe, it, expect } from "vitest";

import {
    Field,
    OptionalField,
    Include,
    TSType,
    cloneWith,
    duplicateInstance,
    serialiseInstance,
    createInstance,
    BypassConstructor,
    TSField
} from "../src";

/* ============================================================
   Synthetic Entities
============================================================ */

@BypassConstructor()
class TestChild {

    @Field(TSType.Value)
    id!: string;

    @Field(TSType.Value, Date)
    created!: Date;

    constructor(id: string, created: Date) {
        this.id = id;
        this.created = created;
    }

    get stableIdentifier() {
        return this.id;
    }
}

@BypassConstructor()
class TestParent {

    @Field(TSType.Array, TestChild)
    children!: TestChild[];

    @OptionalField(TSType.Value)
    label!: string | null;

    @Field(TSType.Expando)
    extra!: Record<string, unknown>;

    constructor(children: TestChild[], label?: string | null) {
        this.children = children;
        this.label = label ?? null;
        this.extra = {};
    }

    @Include
    get childCount() {
        return this.children.length;
    }
}

class DerivedParent extends TestParent {

    @OptionalField(TSType.Value)
    derivedField!: string | null;
}

/* ============================================================
   Helpers
============================================================ */

function buildChild(id: string) {
    return createInstance(
        {
            id,
            created: new Date("2026-01-01")
        },
        TestChild
    );
}

function buildParent() {
    return new TestParent([buildChild("c1")], "parent");
}

/* ============================================================
   Constructor Lifecycle Safety
============================================================ */

describe("Constructor lifecycle", () => {

    it("cloneWith works on constructor-created instances", () => {
        const p = buildParent();

        const clone = cloneWith(p, { label: "updated" });

        expect(clone.label).toBe("updated");
        expect(clone).not.toBe(p);
        expect(clone instanceof TestParent).toBe(true);
    });

    it("duplicateInstance deep clones", () => {
        const p = buildParent();

        const dup = duplicateInstance(p);

        expect(dup).not.toBe(p);
        expect(dup.children[0]).not.toBe(p.children[0]);
    });

});

/* ============================================================
   Serialisation Boundary
============================================================ */

describe("Serialisation invariants", () => {

    it("returns plain JSON-compatible objects", () => {
        const json = serialiseInstance(buildParent());

        expect(typeof json).toBe("object");
        expect(json.children.length).toBe(1);
    });

    it("includes computed values", () => {
        const json = serialiseInstance(buildParent());
        expect(json.childCount).toBe(1);
    });

});

/* ============================================================
   Hydration
============================================================ */

describe("Hydration correctness", () => {

    it("rehydrates nested graphs", () => {
        const parent = buildParent();

        const json = serialiseInstance(parent);
        const hydrated = createInstance(json, TestParent);

        expect(hydrated.children[0] instanceof TestChild).toBe(true);
    });

    it("rehydrates Date fields", () => {
        const child = buildChild("1");

        const json = serialiseInstance(child);
        const hydrated = createInstance(json, TestChild);

        expect(hydrated.created instanceof Date).toBe(true);
    });

});

/* ============================================================
   Expando Semantics
============================================================ */

describe("Expando behaviour", () => {

    it("captures unknown properties", () => {

        const instance = createInstance(
            {
                children: [],
                extraValue: 123
            },
            TestParent
        );

        expect(instance.extra.extraValue).toBe(123);
    });

    it("preserves expandos across cloneWith", () => {

        const p = buildParent();
        p.extra.foo = "bar";

        const clone = cloneWith(p, {});

        expect(clone.extra.foo).toBe("bar");
    });

});

/* ============================================================
   Optional + Required Semantics
============================================================ */

describe("Field optionality", () => {

    it("optional fields may be null", () => {
        const p = buildParent();

        const clone = cloneWith(p, { label: null });
        expect(clone.label).toBeNull();
    });

    it("required fields must exist", () => {
        expect(() =>
            createInstance(
                { created: new Date() },
                TestChild
            )
        ).toThrow();
    });

});

/* ============================================================
   Inheritance Safety
============================================================ */

describe("Schema inheritance", () => {

    it("hydrates inherited + derived fields", () => {

        const instance = createInstance(
            {
                children: [],
                derivedField: "hello"
            },
            DerivedParent
        );

        expect(instance.derivedField).toBe("hello");
    });

});

/* ============================================================
   Graph Integrity
============================================================ */

describe("Cross-entity graph cloning", () => {

    it("cloneWith replaces nested arrays safely", () => {

        const p = buildParent();

        const clone = cloneWith(p, {
            children: [...p.children, buildChild("c2")]
        });

        expect(clone.children.length).toBe(2);
        expect(p.children.length).toBe(1);
    });

});

/* ============================================================
   Round Trip Stability
============================================================ */

describe("Round-trip stability", () => {

    it("serialise → createInstance → serialise remains stable", () => {

        const original = buildParent();

        const json1 = serialiseInstance(original);
        const hydrated = createInstance(json1, TestParent);
        const json2 = serialiseInstance(hydrated);

        expect(json2).toStrictEqual(json1);
    });

});

/* ============================================================
   Constructor Bypass Guarantees
============================================================ */

describe("BypassConstructor guarantees", () => {

    it("does not invoke constructor during hydration", () => {

        let called = false;

        @BypassConstructor()
        class Guarded {

            @Field(TSType.Value)
            id!: string;

            constructor() {
                called = true;
            }
        }

        createInstance({ id: "1" }, Guarded);

        expect(called).toBe(false);
    });

});
