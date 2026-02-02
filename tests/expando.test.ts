import {describe, it, expect} from "vitest";
import {createInstance} from "../src/core/createInstance";
import {TSType} from "../src/core/TSType";
import {Field} from "../src/decorators/schemaDecorator";
import {BypassConstructor} from "../src/core/RehydrateOptions";
import {RIFTError} from "../src/utils/errors";
import {TSField} from "../src/core";

/* ------------------------------------------------------------------ */
/* Expando test schemas (decorator-only)                               */

/* ------------------------------------------------------------------ */

@BypassConstructor({bypassConstructor: true})
class WithExpando {
    @Field(TSType.Value)
    id!: string;

    @Field(TSType.Expando)
    extra!: Record<string, any>;
}

@BypassConstructor({bypassConstructor: true})
class WithoutExpando {
    @Field(TSType.Value)
    id!: string;
}

@BypassConstructor({bypassConstructor: true})
class NestedWithExpando {
    @Field(TSType.Object, WithExpando)
    child!: WithExpando;
}

@BypassConstructor({bypassConstructor: true})
class TwoExpandosInvalid {
    @Field(TSType.Expando)
    a!: Record<string, any>;

    @Field(TSType.Expando)
    b!: Record<string, any>;
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe("createInstance – Expando behavior (decorator model)", () => {

    it("captures extra top-level properties into expando", () => {
        const inst = createInstance(
            {id: "x", foo: 1, bar: "yes"},
            WithExpando
        );

        expect(inst.id).toBe("x");
        expect(inst.extra).toEqual({foo: 1, bar: "yes"});
    });

    it("does NOT materialize expando when there are no extra properties", () => {
        const inst = createInstance(
            {id: "only"},
            WithExpando
        );

        expect(inst.id).toBe("only");
        expect(inst.extra).toBeUndefined();
    });

    it("ignores extra properties when no expando is defined", () => {
        const inst = createInstance(
            {id: "x", foo: 123},
            WithoutExpando
        );

        expect(inst.id).toBe("x");
        expect((inst as any).foo).toBeUndefined();
    });

    it("does not affect JSON round-trip when expando is unused", () => {
        const input = {id: "abc"};

        const inst = createInstance(input, WithExpando);
        const serialized = JSON.parse(JSON.stringify(inst));

        expect(serialized).toStrictEqual(input);
    });

    it("round-trips JSON correctly when expando captures extras", () => {
        const input = {id: "abc", x: 1, y: 2};

        const inst = createInstance(input, WithExpando);
        const serialized = JSON.parse(JSON.stringify(inst));

        expect(serialized).toStrictEqual({
            id: "abc",
            extra: {x: 1, y: 2}
        });
    });

    it("captures extras independently per instance", () => {
        const a = createInstance(
            {id: "a", foo: 1},
            WithExpando
        );

        const b = createInstance(
            {id: "b", bar: 2},
            WithExpando
        );

        expect(a.extra).toEqual({foo: 1});
        expect(b.extra).toEqual({bar: 2});
    });

    it("captures extras on nested objects with expando", () => {
        const inst = createInstance(
            {
                child: {
                    id: "nested",
                    extra1: true,
                    extra2: 42
                }
            },
            NestedWithExpando
        );

        expect(inst.child.id).toBe("nested");
        expect(inst.child.extra).toEqual({
            extra1: true,
            extra2: 42
        });
    });

    it("does not leak parent extras into child expandos", () => {
        class Root {
            @Field(TSType.Value)
            id!: string;

            @Field(TSType.Object, WithExpando)
            child!: WithExpando;

            @Field(TSType.Expando)
            extra!: Record<string, any>;
        };

        const inst = createInstance(
            {
                id: "root",
                rootExtra: "x",
                child: {
                    id: "nested"
                }
            },
            Root
        );

        expect(inst.extra).toEqual({rootExtra: "x"});
        expect(inst.child.extra).toBeUndefined();
    });

    it("throws if multiple expandos are defined in the same schema", () => {
        expect(() =>
            createInstance({a: 1}, TwoExpandosInvalid)
        ).toThrow(RIFTError);
    });

    it("does not attach expando to prototype or share it across instances", () => {
        const a = createInstance({id: "a", x: 1}, WithExpando);
        const b = createInstance({id: "b", y: 2}, WithExpando);

        a.extra.z = 999;

        expect(b.extra).toEqual({y: 2});

        expect(
          Object.prototype.hasOwnProperty.call(WithExpando.prototype, "extra")
        ).toBe(true); // schema lives here

        expect(
          Object.getOwnPropertyDescriptor(WithExpando.prototype, "extra")?.value
        ).toBeInstanceOf(TSField);

        expect(a).toHaveProperty("extra");
        expect(b).toHaveProperty("extra");

        expect(a.extra).toEqual({ x: 1, z: 999 });
        expect(b.extra).toEqual({ y: 2 });

        expect((WithExpando.prototype as any).extra).toBeInstanceOf(TSField);

    });

    it("preserves instanceof semantics when using expando", () => {
        const inst = createInstance(
            {id: "x", foo: "bar"},
            WithExpando
        );

        expect(inst).toBeInstanceOf(WithExpando);
        expect(Object.getPrototypeOf(inst)).toBe(WithExpando.prototype);
    });

});
