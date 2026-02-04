import {describe, it, expect} from "vitest";
import {createInstance, Field, TSField, TSType} from "../src";

/**
 * Utility: recursively assert that no TSField appears anywhere
 * in an object graph.
 */
function assertNoTSField(value: any, path = "root"): void {
    if (value == null) return;

    // TSField must never appear as runtime data
    expect(value).not.toBeInstanceOf(TSField);

    if (typeof value !== "object") return;

    for (const [key, v] of Object.entries(value)) {
        assertNoTSField(v, `${path}.${key}`);
    }
}

describe("TSField runtime safety", () => {

    describe("constructor usage", () => {

        it("does not assign TSField values to instance properties when constructed normally", () => {
            class Example {
                @Field(TSType.Value)
                id!: string;

                @Field(TSType.Object)
                child!: any;

                @Field(TSType.Expando)
                extra!: Record<string, any>;
            }

            const inst = new Example();

            // Only own properties are checked — prototype is allowed to hold schema
            for (const [key, value] of Object.entries(inst as any)) {
                expect(value).not.toBeInstanceOf(TSField);
            }

            assertNoTSField(inst);
        });

    });

    describe("createInstance hydration", () => {

        it("does not assign TSField values to instance properties", () => {
            class Child {
                @Field(TSType.Value)
                value!: number;
            }

            class Parent {
                @Field(TSType.Value)
                id!: string;

                @Field(TSType.Object, Child)
                child!: Child;

                @Field(TSType.Expando)
                extra!: Record<string, any>;
            }

            const inst = createInstance(
                {
                    id: "parent",
                    child: {value: 42},
                    extraValue: "x"
                },
                Parent
            ) as Parent;

            // Shallow check
            for (const [key, value] of Object.entries(inst as any)) {
                expect(value).not.toBeInstanceOf(TSField);
            }

            // Deep check
            assertNoTSField(inst);

            // Sanity checks
            expect(inst.child).toBeInstanceOf(Child);
            expect(inst.child.value).toBe(42);
            expect(inst.extra).toEqual({extraValue: "x"});
        });

        it("does not leak TSField when ifEmpty instantiates nested objects", () => {
            class Child {
                @Field(TSType.Value)
                value!: number;
            }

            class Parent {
                @Field(TSType.Object, Child, false, () => ({value: 123}))
                child!: Child;
            }

            const inst = createInstance(
                {child: null},
                Parent
            ) as Parent;

            expect(inst.child).toBeInstanceOf(Child);
            expect(inst.child.value).toBe(123);

            assertNoTSField(inst);
        });


        it("does not leak TSField into arrays", () => {
            class Item {
                @Field(TSType.Value)
                value!: number;
            }

            class Container {
                @Field(TSType.Array, Item)
                items!: Item[];
            }

            const inst = createInstance(
                {items: [{value: 1}, {value: 2}]},
                Container
            ) as Container;

            expect(inst.items.length).toBe(2);
            expect(inst.items[0]).toBeInstanceOf(Item);
            expect(inst.items[1]).toBeInstanceOf(Item);

            assertNoTSField(inst);
        });

        it("does not leak TSField through expandos", () => {
            class WithExpando {
                @Field(TSType.Value)
                id!: string;

                @Field(TSType.Expando)
                extra!: Record<string, any>;
            }

            const inst = createInstance(
                {id: "x", a: 1, b: 2},
                WithExpando
            ) as WithExpando;

            expect(inst.extra).toEqual({a: 1, b: 2});

            assertNoTSField(inst);
        });

    });

});
