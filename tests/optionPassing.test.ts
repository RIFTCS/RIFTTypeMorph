import {describe, it, expect} from "vitest";
import {createInstance, Field, OptionalField, TSType} from "../src";
import {RIFTError} from "../src/utils/errors";

describe("createInstance option propagation", () => {

    it("propagates errorForNullRequired into nested object fields", () => {
        class Inner {
            @Field(TSType.Value)
            x!: number;
        }

        class Outer {
            @Field(TSType.Object, Inner)
            inner!: Inner;
        }

        expect(() =>
            createInstance(
                {inner: {x: null}},
                Outer,
                null,
                "root",
                {errorForNullRequired: true}
            )
        ).toThrow(RIFTError);
    });

    it("propagates errorForNullRequired into array elements", () => {
        class A {
            @Field(TSType.Array)
            nums!: number[];
        }

        expect(() =>
            createInstance(
                {nums: [1, null, 3]},
                A,
                null,
                "root",
                {errorForNullRequired: true}
            )
        ).toThrow(RIFTError);
    });

    it("propagates errorForExtraProps into nested object fields", () => {
        class Inner {
            @Field(TSType.Value)
            x!: number;
        }

        class Outer {
            @Field(TSType.Object, Inner)
            inner!: Inner;
        }

        expect(() =>
            createInstance(
                {inner: {x: 1, extra: 123}},
                Outer,
                null,
                "root",
                {errorForExtraProps: true}
            )
        ).toThrow(RIFTError);
    });
    it("propagates errorForExtraProps into array elements", () => {
        class Item {
            @Field(TSType.Value)
            x!: number;
        }

        class A {
            @Field(TSType.Array, Item)
            items!: Item[];
        }

        expect(() =>
            createInstance(
                {items: [{x: 1, y: 2}]},
                A,
                null,
                "root",
                {errorForExtraProps: true}
            )
        ).toThrow(RIFTError);
    });

    it("propagates options through ifEmpty recursion", () => {
        class A {
            @OptionalField(TSType.Value, null, () => null)
            x!: number;
        }

        expect(() =>
            createInstance(
                {x: null},
                A,
                null,
                "root",
                {errorForNullRequired: true}
            )
        ).toThrow(RIFTError);
    });

    it("preserves collectErrors while propagating other options", () => {
        class Inner {
            @Field(TSType.Value)
            x!: number;
        }

        class Outer {
            @Field(TSType.Object, Inner)
            inner!: Inner;
        }

        const res = createInstance(
            {inner: {x: null}},
            Outer,
            null,
            "root",
            {
                collectErrors: true,
                errorForNullRequired: true
            }
        ) as any;

        // Instance is still produced
        expect(res.instance).toBeInstanceOf(Outer);
        expect(res.instance.inner).toBeInstanceOf(Inner);
        expect(res.instance.inner.x).toBeNull();

        // Errors are collected
        expect(res.errors.length).toBeGreaterThan(0);
        expect(res.errors[0]).toBeInstanceOf(RIFTError);
    });

});
