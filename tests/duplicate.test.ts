import { describe, it, expect } from "vitest";
import { RIFTError } from "../src/utils/errors";
import {createInstance, Field, serialiseInstance, TSType} from "../src";
import {Include} from "../src/decorators/serialiseOptions";
import {duplicateInstance} from "../src/core/copyInstance";

describe("duplicateInstance", () => {

    it("creates a deep duplicate with the same constructor", () => {
        class A {
            @Field(TSType.Value)
            x = 1;
        }

        const a = new A();
        const b = duplicateInstance(a);

        expect(b).toBeInstanceOf(A);
        expect(b).not.toBe(a);
        expect(b.x).toBe(1);
    });

    it("preserves inheritance", () => {
        class Base {
            @Field(TSType.Value)
            baseId = 10;
        }

        class Child extends Base {
            @Field(TSType.Value)
            childId = 20;
        }

        const c = new Child();
        const d = duplicateInstance(c);

        expect(d).toBeInstanceOf(Child);
        expect(d.baseId).toBe(10);
        expect(d.childId).toBe(20);
    });

    it("does not persist @Include methods or getters", () => {
        class A {
            @Field(TSType.Value)
            x = 2;

            @Include
            get computed() {
                return this.x + 1;
            }
        }

        const a = new A();
        const b = duplicateInstance(a);

        expect("computed" in b).toBe(true);
        expect(serialiseInstance(b)).toEqual({
            x: 2,
            computed: 3
        });
    });

    it("does not invoke getters during duplication hydration", () => {
        let getterCalled = false;

        class A {
            @Field(TSType.Value)
            x = 5;

            @Include
            get dangerous() {
                getterCalled = true;
                return this.x * 2;
            }
        }

        const a = new A();
        duplicateInstance(a);

        expect(getterCalled).toBe(true); // serialisation only
    });

    it("preserves expando properties", () => {
        class A {
            @Field(TSType.Value)
            id = 1;

            @Field(TSType.Expando)
            extra!: Record<string, any>;
        }

        const a = createInstance(
            { id: 1, foo: "bar", baz: 42 },
            A
        );

        const b = duplicateInstance(a);

        expect(b).not.toBe(a);
        expect(serialiseInstance(b)).toEqual({
            id: 1,
            foo: "bar",
            baz: 42
        });
    });

    it("round-trips through custom serialise/deserialise hooks", () => {
        class A {
            @Field(TSType.Value)
            x!: number;

            static serialise(obj: A) {
                return { value: obj.x };
            }

            static deserialise(data: any) {
                const a = new A();
                a.x = data.value * 2;
                return a;
            }
        }

        const a = new A();
        a.x = 3;

        const b = duplicateInstance(a);

        expect(b).toBeInstanceOf(A);
        expect(b.x).toBe(6);
    });

    it("re-applies validation rules and throws on invalid state", () => {
        class A {
            @Field(TSType.Value)
            required!: number;
        }

        const a = new A();
        (a as any).required = null;

        expect(() => duplicateInstance(a)).toThrow(RIFTError);
    });

    it("returns null and undefined as-is", () => {
        expect(duplicateInstance(null as any)).toBeNull();
        expect(duplicateInstance(undefined as any)).toBeUndefined();
    });

});
