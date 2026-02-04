import { describe, it, expect } from "vitest";
import { RIFTError } from "../src/utils/errors";
import {cloneWith} from "../src/core/copyInstance";
import {createInstance, Field, serialiseInstance, TSType} from "../src";
import {Include} from "../src/decorators/serialiseOptions";

describe("cloneWith (schema-derived)", () => {

    it("returns a new instance with updated fields", () => {
        class A {
            @Field(TSType.Value)
            x = 1;

            @Field(TSType.Value)
            y = 2;
        }

        const a = new A();
        const b = cloneWith(a, { x: 10 });

        expect(b).toBeInstanceOf(A);
        expect(b).not.toBe(a);
        expect(b.x).toBe(10);
        expect(b.y).toBe(2);
    });

    it("preserves inheritance", () => {
        class Base {
            @Field(TSType.Value)
            baseId = 1;
        }

        class Child extends Base {
            @Field(TSType.Value)
            childId = 2;
        }

        const c = new Child();
        const d = cloneWith(c, { childId: 99 });

        expect(d).toBeInstanceOf(Child);
        expect(d.baseId).toBe(1);
        expect(d.childId).toBe(99);
    });

    it("re-applies validation rules", () => {
        class A {
            @Field(TSType.Value)
            required!: number;
        }

        const a = new A();
        a.required = 5;

        expect(() =>
            cloneWith(a, { required: null as any })
        ).toThrow(RIFTError);
    });

    it("does not allow modifying non-schema fields", () => {
        class A {
            @Field(TSType.Value)
            x = 1;
        }

        const a = new A();

        expect(() =>
            cloneWith(a, { foo: 123 } as any)
        ).toThrow(RIFTError);
    });

    it("does not allow modifying @Include fields", () => {
        class A {
            @Field(TSType.Value)
            x = 1;

            @Include
            get computed() {
                return this.x + 1;
            }
        }

        const a = new A();

        expect(() =>
            cloneWith(a, { computed: 999 } as any)
        ).toThrow(RIFTError);
    });

    it("does not persist included fields onto the clone", () => {
        class A {
            @Field(TSType.Value)
            x = 2;

            @Include
            get computed() {
                return this.x * 2;
            }
        }

        const a = new A();
        const b = cloneWith(a, { x: 3 });

        expect("computed" in b).toBe(true);
        expect(serialiseInstance(b)).toEqual({
            x: 3,
            computed: 6
        });
    });

    it("preserves expando properties", () => {
        class A {
            @Field(TSType.Value)
            id = 1;

            @Field(TSType.Expando)
            extra!: Record<string, any>;
        }

        const a = createInstance(
            { id: 1, foo: "bar", count: 5 },
            A
        );

        const b = cloneWith(a, { id: 2 });

        expect(serialiseInstance(b)).toEqual({
            id: 2,
            foo: "bar",
            count: 5
        });
    });

    it("does not allow modifying the expando key directly", () => {
        class A {
            @Field(TSType.Value)
            id = 1;

            @Field(TSType.Expando)
            extra!: Record<string, any>;
        }

        const a = createInstance(
            { id: 1, foo: "bar" },
            A
        );

        expect(() =>
            cloneWith(a, { extra: {} } as any)
        ).toThrow(RIFTError);
    });

    it("round-trips through custom serialise/deserialise hooks", () => {
        class A {
            @Field(TSType.Value)
            value!: number;

            static serialise(obj: A) {
                return { v: obj.value };
            }

            static deserialise(data: any) {
                const a = new A();
                a.value = data.v * 2;
                return a;
            }
        }

        const a = new A();
        a.value = 5;

        const b = cloneWith(a, {});

        expect(b).toBeInstanceOf(A);
        expect(b.value).toBe(10);
    });

    it("works with array fields", () => {
        class A {
            @Field(TSType.Value)
            nums!: number[];
        }

        const a = createInstance(
            { nums: [1, 2, 3] },
            A
        );

        const b = cloneWith(a, { nums: [4, 5] });

        expect(b.nums).toEqual([4, 5]);
        expect(b.nums).not.toBe(a.nums);
    });

    it("throws if cloneWith produces invalid nested data", () => {
        class Inner {
            @Field(TSType.Value)
            x!: number;
        }

        class Outer {
            @Field(TSType.Object, Inner)
            inner!: Inner;
        }

        const o = createInstance(
            { inner: { x: 1 } },
            Outer
        );

        expect(() =>
            cloneWith(o, { inner: { x: null } as any })
        ).toThrow(RIFTError);
    });

    it("returns null and undefined as-is", () => {
        expect(cloneWith(null as any, {})).toBeNull();
        expect(cloneWith(undefined as any, {})).toBeUndefined();
    });

});
