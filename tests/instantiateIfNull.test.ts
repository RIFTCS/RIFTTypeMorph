import { describe, it, expect } from "vitest";
import { createInstance, TSType } from "../src";
import { RIFTError } from "../src/utils/errors";
import { Field, OptionalField } from "../src";

/* ---------------------------------------------
 * Test models
 * --------------------------------------------- */

class Child {
    @Field(TSType.Value)
    value!: number;

    constructor(value: number = 42) {
        this.value = value;
    }
}

class ParentWithIfEmpty {
    @OptionalField(
        TSType.Object,
        Child,
        () => new Child()
    )
    child!: Child | null;
}

class ParentWithoutIfEmpty {
    @OptionalField(TSType.Object, Child)
    child!: Child | null;
}

class ParentUndefinedCase {
    @OptionalField(
        TSType.Object,
        Child,
        () => new Child()
    )
    child!: Child | null;
}

class ParentMissingFactory {
    @OptionalField(
        TSType.Object,
        null,
        () => (null as any)
    )
    child!: any;
}

/* ---------------------------------------------
 * Tests
 * --------------------------------------------- */

describe("ifEmpty (() => any) behavior (decorator-based)", () => {

    it("instantiates object when value is null and ifEmpty is provided", () => {
        const input = { child: null };

        const inst = createInstance(
            input,
            ParentWithIfEmpty,
            null,
            "root"
        ) as ParentWithIfEmpty;

        expect(inst.child).toBeInstanceOf(Child);
        expect(inst.child?.value).toBe(42);
    });

    it("leaves value as null when ifEmpty is not provided", () => {
        const input = { child: null };

        const inst = createInstance(
            input,
            ParentWithoutIfEmpty,
            null,
            "root"
        ) as ParentWithoutIfEmpty;

        expect(inst.child).toBeNull();
    });

    it("does not call ifEmpty when value is undefined (existing behavior unchanged)", () => {
        const input = {};

        const inst = createInstance(
            input,
            ParentUndefinedCase,
            null,
            "root"
        ) as ParentUndefinedCase;

        expect(inst.child).toBeNull();
    });

    it("calls ifEmpty exactly once for null values", () => {
        let calls = 0;

        class ParentWithCountingIfEmpty {
            @OptionalField(
                TSType.Object,
                Child,
                () => {
                    calls++;
                    return new Child(99);
                }
            )
            child!: Child | null;
        }

        const inst = createInstance(
            { child: null },
            ParentWithCountingIfEmpty,
            null,
            "root"
        ) as ParentWithCountingIfEmpty;

        expect(calls).toBe(1);
        expect(inst.child?.value).toBe(99);
    });

    it("throws if ifEmpty returns an invalid value", () => {
        const input = { child: null };

        expect(() =>
            createInstance(
                input,
                ParentMissingFactory,
                null,
                "root"
            )
        ).toThrow(RIFTError);
    });

    it("collectErrors records ifEmpty errors instead of throwing", () => {
        const input = { child: null };

        const res = createInstance(
            input,
            ParentMissingFactory,
            null,
            "root",
            { collectErrors: true }
        );

        expect(res.instance).toBeDefined();
        expect(res.errors.length).toBe(1);
        expect(res.errors[0]).toBeInstanceOf(RIFTError);
    });
});
