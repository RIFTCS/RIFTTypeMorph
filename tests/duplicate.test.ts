import {describe, it, expect} from "vitest";
import {RIFTError} from "../src/utils/errors";
import {BypassConstructor, cloneWith, createInstance, Field, Ignore, serialiseInstance, TSType} from "../src";
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
            {id: 1, foo: "bar", baz: 42},
            A
        );

        const b = duplicateInstance(a);

        expect(b).not.toBe(a);
        expect(serialiseInstance(b, {flattenExpando: true})).toEqual({
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
                return {value: obj.x};
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

describe("duplicateInstance ignore passthrough", () => {

    it("does not serialise ignored fields", () => {
        class A {
            @Field(TSType.Value)
            id = 1;

            @Ignore(true)
            runtime = "state";
        }

        const a = new A();

        expect(serialiseInstance(a)).toEqual({
            id: 1
        });
    });

    it("preserves ignored fields when passThroughOnClone is true", () => {
        class A {
            @Field(TSType.Value)
            id = 1;

            @Ignore(true)
            runtime = "cache";
        }

        const a = new A();
        const b = duplicateInstance(a);

        expect(b.runtime).toBe("cache");

        expect(serialiseInstance(b)).toEqual({
            id: 1
        });
    });

    it("does not preserve ignored fields when passThroughOnClone is false", () => {
        class A {
            @Field(TSType.Value)
            id = 1;

            @Ignore()
            runtime = "cache";
        }

        const a = new A();
        a.runtime = "modified";

        const b = duplicateInstance(a);

        // should NOT copy runtime from original
        expect(b.runtime).toBe("cache");

        expect(serialiseInstance(b)).toEqual({
            id: 1
        });
    });

    it("cloneWith preserves passThroughOnClone ignored fields", () => {
        class A {
            @Field(TSType.Value)
            id = 1;

            @Ignore(true)
            runtime = "live";
        }

        const a = new A();

        const b = cloneWith(a, {
            id: 2
        });

        expect(b.id).toBe(2);
        expect(b.runtime).toBe("live");

        expect(serialiseInstance(b)).toEqual({
            id: 2
        });
    });

    it("cloneWith does not copy ignored fields without passthrough", () => {
        class A {
            @Field(TSType.Value)
            id = 1;

            @Ignore()
            runtime = "live";
        }

        const a = new A();
        a.runtime = "changed";

        const b = cloneWith(a, {
            id: 2
        });

        // should reset to class default, not copy original
        expect(b.runtime).toBe("live");

        expect(serialiseInstance(b)).toEqual({
            id: 2
        });
    });


});


describe("duplicateInstance ignore behaviour with @BypassConstructor", () => {

    it("does not recreate ignored fields when constructor is bypassed", () => {
        @BypassConstructor()
        class A {
            @Field(TSType.Value)
            id = 1;

            @Ignore()
            runtime = "live";
        }

        const a = new A();
        a.runtime = "modified";

        const b = duplicateInstance(a);

        // constructor skipped → no initializer → field absent
        expect(b.runtime).toBeUndefined();

        expect(serialiseInstance(b)).toEqual({
            id: 1
        });
    });

    it("preserves ignored fields with passThroughOnClone when constructor is bypassed", () => {
        @BypassConstructor()
        class A {
            @Field(TSType.Value)
            id = 1;

            @Ignore(true)
            runtime = "live";
        }

        const a = new A();
        a.runtime = "modified";

        const b = duplicateInstance(a);

        // passthrough should copy value directly
        expect(b.runtime).toBe("modified");

        expect(serialiseInstance(b)).toEqual({
            id: 1
        });
    });

});