import {describe, it, expect} from "vitest";
import {createInstance, Field, Ignore, OptionalField, serialiseInstance, TSField, TSType} from "../src";
import {Include} from "../src/decorators/serialiseOptions";
import {RIFTError} from "../src/utils/errors";

describe("@Include decorator (with @Field)", () => {
    it("includes computed method output using the method name as key", () => {
        class Foo {
            @Field(TSType.Value)
            id = 123;

            @Include
            stableIdentifier() {
                return "A" + this.id;
            }
        }

        const result = serialiseInstance(new Foo());

        expect(result).toEqual({
            id: 123,
            stableIdentifier: "A123"
        });
    });

    it("does not require a @Field entry for included methods", () => {
        class Foo {
            @Field(TSType.Value)
            id = 5;

            @Include
            computed() {
                return this.id * 2;
            }
        }

        const result = serialiseInstance(new Foo());

        expect(result.computed).toBe(10);
    });

    it("allows included methods to return null", () => {
        class Foo {
            @Field(TSType.Value)
            id = 1;

            @Include
            maybeNull() {
                return null;
            }
        }

        const result = serialiseInstance(new Foo());

        expect(result).toHaveProperty("maybeNull");
        expect(result.maybeNull).toBeNull();
    });

    it("executes included methods with correct this binding", () => {
        class Foo {
            @Field(TSType.Value)
            id = 7;

            @Include
            checkThis() {
                return this instanceof Foo && this.id;
            }
        }

        const result = serialiseInstance(new Foo());

        expect(result.checkThis).toBe(7);
    });

    it("supports multiple included methods", () => {
        class Foo {
            @Field(TSType.Value)
            id = 3;

            @Include
            a() {
                return "A" + this.id;
            }

            @Include
            b() {
                return "B" + this.id;
            }
        }

        const result = serialiseInstance(new Foo());

        expect(result).toEqual({
            id: 3,
            a: "A3",
            b: "B3"
        });
    });

    it("does not trigger extra property errors for included methods", () => {
        class Foo {
            @Field(TSType.Value)
            id = 9;

            @Include
            extra() {
                return "ok";
            }
        }

        expect(() =>
            serialiseInstance(new Foo(), null, "root", {
                errorForExtraProps: true
            })
        ).not.toThrow();
    });

    it("throws RIFTError if an included method throws", () => {
        class Foo {
            @Field(TSType.Value)
            id = 1;

            @Include
            explode() {
                throw new Error("boom");
            }
        }

        expect(() => serialiseInstance(new Foo())).toThrow(RIFTError);

        try {
            serialiseInstance(new Foo());
        } catch (e: any) {
            expect(e.message).toContain("explode");
            expect(e.message).toContain("boom");
        }
    });

    it("respects @Ignore for included methods", () => {
        class Foo {
            @Field(TSType.Value)
            id = 2;

            @Ignore()
            @Include
            ignoredComputed() {
                return "nope";
            }
        }

        const result = serialiseInstance(new Foo());

        expect(result).toEqual({
            id: 2
        });
    });

    it("allows included methods to return objects without recursive serialisation", () => {
        class Foo {
            @Field(TSType.Value)
            id = 4;

            @Include
            obj() {
                return {x: this.id};
            }
        }

        const result = serialiseInstance(new Foo());

        expect(result.obj).toEqual({x: 4});
    });

    it("does not treat included prototype methods as own enumerable properties", () => {
        class Foo {
            @Field(TSType.Value)
            id = 1;

            @Include
            computed() {
                return "ok";
            }
        }

        const instance = new Foo();

        expect(Object.keys(instance)).toEqual(["id"]);

        expect(() =>
            serialiseInstance(instance, null, "root", {
                errorForExtraProps: true
            })
        ).not.toThrow();
    });

    it("supports inheritance with included methods on base class", () => {
        class Base {
            @Field(TSType.Value)
            baseId = 10;

            @Include
            baseComputed() {
                return this.baseId + 1;
            }
        }

        class Child extends Base {
            @Field(TSType.Value)
            childId = 20;
        }

        const result = serialiseInstance(new Child());

        expect(result).toEqual({
            baseId: 10,
            childId: 20,
            baseComputed: 11
        });
    });

    it("works with OptionalField when unset", () => {
        class Foo {
            @OptionalField(TSType.Value)
            maybe?: number;

            @Include
            computed() {
                return this.maybe ?? "default";
            }
        }

        const foo = new Foo();
        foo.maybe = undefined;

        const result = serialiseInstance(foo);

        expect(result).toEqual({
            maybe: null,
            computed: "default"
        });
    });

});
