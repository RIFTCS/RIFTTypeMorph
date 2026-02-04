import {describe, it, expect} from "vitest";
import {createInstance, Field, TSType} from "../src";
import {Include} from "../src/decorators/serialiseOptions";

describe("createInstance – @Include input handling", () => {

    it("silently ignores input values for @Include methods", () => {
        class Example {
            @Field(TSType.Value)
            id!: string;

            @Include
            computed() {
                return "computed";
            }
        }

        const inst = createInstance(
            {
                id: "123",
                computed: "SHOULD_BE_IGNORED"
            },
            Example
        ) as Example;

        expect(inst.id).toBe("123");
        expect(inst.computed()).toBe("computed");
    });

    it("does not invoke getters during createInstance", () => {
        let getterCalled = false;

        class Test {
            @Field(TSType.Value)
            id = 1;

            @Include
            get computed() {
                getterCalled = true;
                return this.id + 1;
            }
        }

        const obj = createInstance(
            {id: 5},
            Test,
            null,
            "root"
        );

        expect(getterCalled).toBe(false);
        expect(obj.id).toBe(5);
    });


    it("does not treat @Include keys as extra properties when errorForExtraProps is true", () => {
        class Example {
            @Field(TSType.Value)
            id!: string;

            @Include
            computed() {
                return 42;
            }
        }

        expect(() =>
            createInstance(
                {
                    id: "1",
                    computed: "IGNORED"
                },
                Example,
                null,
                "root",
                {errorForExtraProps: true}
            )
        ).not.toThrow();
    });

    it("does not place @Include input values into expando", () => {
        class Example {
            @Field(TSType.Value)
            id!: string;

            @Field(TSType.Expando)
            extra!: Record<string, any>;

            @Include
            computed() {
                return "x";
            }
        }

        const inst = createInstance(
            {
                id: "1",
                computed: "IGNORED",
                other: 99
            },
            Example
        ) as Example;

        expect(inst.extra).toEqual({other: 99});
        expect(inst.computed()).toBe("x");
    });

    it("ignores @Include keys during nested object hydration", () => {
        class Child {
            @Field(TSType.Value)
            id!: string;

            @Include
            label() {
                return "child";
            }
        }

        class Parent {
            @Field(TSType.Object, Child)
            child!: Child;
        }

        const inst = createInstance(
            {
                child: {
                    id: "c1",
                    label: "IGNORED"
                }
            },
            Parent
        ) as Parent;

        expect(inst.child.id).toBe("c1");
        expect(inst.child.label()).toBe("child");
    });

    it("still errors on truly unknown extra keys when no expando exists", () => {
        class Example {
            @Field(TSType.Value)
            id!: string;

            @Include
            computed() {
                return "x";
            }
        }

        expect(() =>
            createInstance(
                {
                    id: "1",
                    computed: "IGNORED",
                    unexpected: 123
                },
                Example,
                null,
                "root",
                {errorForExtraProps: true}
            )
        ).toThrow(/Unexpected properties/);
    });

});