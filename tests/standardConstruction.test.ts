import { describe, it, expect } from "vitest";
import {
    Field,
    OptionalField,
    TSType,
    serialiseInstance,
    createInstance,
    duplicateInstance,
    cloneWith
} from "../src";

/* -------------------------------------------------- */
/* Models                                             */
/* -------------------------------------------------- */

class Inner {

    @Field(TSType.Value)
    value!: number;

}

class Container {

    @Field(TSType.Object, Inner)
    inner!: Inner;

}

class ArrayContainer {

    @Field(TSType.Array, Inner)
    items!: Inner[];

}

class OptionalModel {

    @OptionalField(TSType.Value)
    maybe?: number;

}

/* -------------------------------------------------- */
/* Tests                                              */
/* -------------------------------------------------- */

describe("new() instances integrate with the schema system", () => {

    it("serialises an instance created with new()", () => {

        const obj = new Inner();
        obj.value = 10;

        const out = serialiseInstance(obj);

        expect(out).toEqual({ value: 10 });

    });

    it("serialises nested objects created with new()", () => {

        const inner = new Inner();
        inner.value = 42;

        const container = new Container();
        container.inner = inner;

        const out = serialiseInstance(container);

        expect(out).toEqual({
            inner: { value: 42 }
        });

    });

    it("serialises arrays of instances created with new()", () => {

        const a = new Inner();
        a.value = 1;

        const b = new Inner();
        b.value = 2;

        const container = new ArrayContainer();
        container.items = [a, b];

        const out = serialiseInstance(container);

        expect(out).toEqual({
            items: [
                { value: 1 },
                { value: 2 }
            ]
        });

    });

    it("supports serialise → createInstance roundtrip", () => {

        const inner = new Inner();
        inner.value = 55;

        const container = new Container();
        container.inner = inner;

        const serialised = serialiseInstance(container);

        const restored = createInstance(
            serialised,
            Container,
            null,
            "root"
        ) as Container;

        expect(restored.inner.value).toBe(55);

    });

    it("duplicateInstance works with constructor-created objects", () => {

        const obj = new Inner();
        obj.value = 77;

        const copy = duplicateInstance(obj);

        expect(copy).not.toBe(obj);
        expect(copy.value).toBe(77);

    });

    it("cloneWith modifies schema fields correctly", () => {

        const obj = new Inner();
        obj.value = 5;

        const updated = cloneWith(obj, {
            value: 99
        });

        expect(updated.value).toBe(99);
        expect(obj.value).toBe(5);

    });

});

/* -------------------------------------------------- */
/* Regression guard                                   */
/* -------------------------------------------------- */

describe("constructor-created instances remain compatible with parsing", () => {

    it("schema metadata is discovered from prototype when instance created via new()", () => {

        const obj = new Inner();
        obj.value = 123;

        const out = serialiseInstance(obj);

        expect(out.value).toBe(123);

    });

});