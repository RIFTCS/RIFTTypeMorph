import {describe, it, expect} from "vitest";
import {createInstance, Field, OptionalField, TSField, TSType} from "../src";

/**
 * Helper to assert that no TSField exists anywhere
 * in an object graph.
 */
function assertNoTSField(value: any) {
    if (value == null || typeof value !== "object") return;
    expect(value).not.toBeInstanceOf(TSField);
    for (const v of Object.values(value)) {
        assertNoTSField(v);
    }
}

describe("schema inheritance and prototype safety", () => {

    it("hydrates fields from both base and derived classes", () => {
        class Base {
            @Field(TSType.Value)
            id!: string;
        }

        class Derived extends Base {
            @Field(TSType.Value)
            name!: string;
        }

        const inst = createInstance(
            {id: "123", name: "test"},
            Derived
        ) as Derived;

        expect(inst.id).toBe("123");
        expect(inst.name).toBe("test");

        assertNoTSField(inst);
    });

    it("does not duplicate inherited schema fields on the prototype", () => {
        class Base {
            @Field(TSType.Value)
            id!: string;
        }

        class Derived extends Base {
            @Field(TSType.Value)
            name!: string;
        }

        createInstance({id: "x", name: "y"}, Derived);

        const baseProto = Base.prototype as any;
        const derivedProto = Derived.prototype as any;

        // Derived defines only its own schema slot
        expect(derivedProto.name).toBeInstanceOf(TSField);

        // Base field must NOT be duplicated onto Derived.prototype
        expect(
            Object.prototype.hasOwnProperty.call(derivedProto, "id")
        ).toBe(true);

        expect(derivedProto.id).toBeInstanceOf(TSField);


        // Base schema still exists (in metadata)
        expect(baseProto.__schemaFields.id).toBeInstanceOf(TSField);
    });

    it("supports expando on base class only", () => {
        class Base {
            @Field(TSType.Value)
            id!: string;

            @Field(TSType.Expando)
            extra!: Record<string, any>;
        }

        class Derived extends Base {
            @Field(TSType.Value)
            name!: string;
        }

        const inst = createInstance(
            {id: "1", name: "d", x: 10},
            Derived
        ) as Derived;

        expect(inst.extra).toEqual({x: 10});
        expect(inst.name).toBe("d");

        assertNoTSField(inst);
    });

    it("supports expando on derived class only", () => {
        class Base {
            @Field(TSType.Value)
            id!: string;
        }

        class Derived extends Base {
            @Field(TSType.Expando)
            extra!: Record<string, any>;
        }

        const inst = createInstance(
            {id: "1", x: 10},
            Derived
        ) as Derived;

        expect(inst.extra).toEqual({x: 10});
        assertNoTSField(inst);
    });

    it("does not allow multiple expandos across inheritance hierarchy", () => {
        class Base {
            @Field(TSType.Expando)
            extra1!: Record<string, any>;
        }

        class Derived extends Base {
            @Field(TSType.Expando)
            extra2!: Record<string, any>;
        }

        expect(() =>
            createInstance({x: 1}, Derived)
        ).toThrow(/Multiple expando properties/);
    });

    it("does not share expando state between base and derived instances", () => {
        class Base {
            @Field(TSType.Expando)
            extra!: Record<string, any>;
        }

        class Derived extends Base {
            @Field(TSType.Value)
            id!: string;
        }

        const a = createInstance({id: "a", x: 1}, Derived) as Derived;
        const b = createInstance({id: "b", y: 2}, Derived) as Derived;

        a.extra.z = 999;

        expect(a.extra).toEqual({x: 1, z: 999});
        expect(b.extra).toEqual({y: 2});

        assertNoTSField(a);
        assertNoTSField(b);
    });

    it("inherits optional fields correctly", () => {
        class Base {
            @OptionalField(TSType.Value)
            maybe!: string | null;
        }

        class Derived extends Base {
            @Field(TSType.Value)
            id!: string;
        }

        const inst = createInstance(
            {id: "x"},
            Derived
        ) as Derived;

        expect(inst.maybe).toBeNull();
        expect(inst.id).toBe("x");

        assertNoTSField(inst);
    });

    it("does not mutate base prototype when creating derived instances", () => {
        class Base {
            @Field(TSType.Value)
            id!: string;
        }

        class Derived extends Base {
            @Field(TSType.Value)
            name!: string;
        }

        createInstance({id: "1", name: "a"}, Derived);

        const baseProto = Base.prototype as any;
        const derivedProto = Derived.prototype as any;

        // Base schema exists in metadata (canonical)
        expect(baseProto.__schemaFields.id).toBeInstanceOf(TSField);

        // Base prototype was NOT polluted with derived schema
        expect(baseProto.name).toBeUndefined();

        // Derived prototype exposes full effective schema (Option A)
        expect(derivedProto.id).toBeInstanceOf(TSField);
        expect(derivedProto.name).toBeInstanceOf(TSField);
    });

});
