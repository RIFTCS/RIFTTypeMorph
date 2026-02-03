import { describe, it, expect } from "vitest";
import { Field, OptionalField, Ignore } from "../src/decorators/schemaDecorator";
import { TSType } from "../src/core/TSType";
import { serialiseInstance } from "../src/core/serialiseInstance";
import { createInstance } from "../src/core";
import { RIFTError } from "../src/utils/errors";

/* ---------------------------------------------
 * Ignore / extra props serialisation tests
 * --------------------------------------------- */

describe("serialiseInstance - @Ignore and extra prop handling", () => {
    it("does not serialise ignored fields", () => {
        class Model {
            @Field(TSType.Value)
            a!: number;

            @Ignore()
            @Field(TSType.Value)
            b!: number;
        }

        const inst = Object.create(Model.prototype) as Model;
        inst.a = 1;
        inst.b = 2;

        const out = serialiseInstance(inst);

        expect(out).toEqual({ a: 1 });
    });

    it("ignored fields suppress errorForExtraProps", () => {
        class Model {
            @Field(TSType.Value)
            a!: number;

            @Ignore()
            hidden!: string;
        }

        const inst = Object.create(Model.prototype) as Model;
        inst.a = 1;
        inst.hidden = "ok";

        const out = serialiseInstance(inst, null, "root", {
            errorForExtraProps: true
        });

        expect(out).toEqual({ a: 1 });
    });

    it("throws on extra props when errorForExtraProps is true", () => {
        class Model {
            @Field(TSType.Value)
            a!: number;
        }

        const inst = Object.create(Model.prototype) as Model;
        inst.a = 1;
        (inst as any).extra = 123;

        expect(() =>
            serialiseInstance(inst, null, "root", {
                errorForExtraProps: true
            })
        ).toThrow(RIFTError);
    });

    it("does not throw on extra props when errorForExtraProps is false", () => {
        class Model {
            @Field(TSType.Value)
            a!: number;
        }

        const inst = Object.create(Model.prototype) as Model;
        inst.a = 1;
        (inst as any).extra = 123;

        const out = serialiseInstance(inst);

        expect(out).toEqual({ a: 1 });
    });

    it("allows extra props when captured by Expando", () => {
        class Model {
            @Field(TSType.Value)
            known!: number;

            @Field(TSType.Expando)
            extra!: Record<string, any>;
        }

        const inst = createInstance(
            { known: 1, foo: "bar", count: 42 },
            Model,
            null,
            "root"
        ) as Model;

        const out = serialiseInstance(inst, null, "root", {
            errorForExtraProps: true
        });

        expect(out).toEqual({
            known: 1,
            foo: "bar",
            count: 42
        });
    });

    it("throws on extra props not covered by Expando", () => {
        class Model {
            @Field(TSType.Value)
            known!: number;

            @Field(TSType.Expando)
            extra!: Record<string, any>;
        }

        const inst = Object.create(Model.prototype) as Model;
        inst.known = 1;
        inst.extra = { foo: "bar" };
        (inst as any).bad = "nope";

        expect(() =>
            serialiseInstance(inst, null, "root", {
                errorForExtraProps: true
            })
        ).toThrow(RIFTError);
    });

    it("ignored fields are not included even if value exists", () => {
        class Model {
            @Ignore()
            @Field(TSType.Value)
            a!: number;
        }

        const inst = Object.create(Model.prototype) as Model;
        inst.a = 123;

        const out = serialiseInstance(inst);

        expect(out).toEqual({});
    });

    it("nested objects respect ignore and extra prop rules", () => {
        class Inner {
            @Field(TSType.Value)
            x!: number;

            @Ignore()
            secret!: string;
        }

        class Outer {
            @Field(TSType.Object, Inner)
            inner!: Inner;
        }

        const inst = Object.create(Outer.prototype) as Outer;
        inst.inner = Object.create(Inner.prototype) as Inner;
        inst.inner.x = 5;
        inst.inner.secret = "hidden";

        const out = serialiseInstance(inst, null, "root", {
            errorForExtraProps: true
        });

        expect(out).toEqual({
            inner: { x: 5 }
        });
    });

    it("arrays propagate errorForExtraProps to elements", () => {
        class Item {
            @Field(TSType.Value)
            v!: number;
        }

        class Container {
            @Field(TSType.Array, Item)
            items!: Item[];
        }

        const inst = Object.create(Container.prototype) as Container;
        const item = Object.create(Item.prototype) as Item;
        item.v = 1;
        (item as any).extra = 2;

        inst.items = [item];

        expect(() =>
            serialiseInstance(inst, null, "root", {
                errorForExtraProps: true
            })
        ).toThrow(RIFTError);
    });

    it("optional fields still serialize null and do not count as extra", () => {
        class Model {
            @OptionalField(TSType.Value)
            maybe?: number;
        }

        const inst = createInstance({}, Model, null, "root") as Model;

        const out = serialiseInstance(inst, null, "root", {
            errorForExtraProps: true
        });

        expect(out).toEqual({ maybe: null });
    });
});
