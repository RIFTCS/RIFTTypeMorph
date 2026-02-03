import {describe, it, expect} from "vitest";
import {createInstance, TSType} from "../src/core";
import {RIFTError} from "../src/utils/errors";
import {Field, OptionalField} from "../src/decorators/schemaDecorator";
import {serialiseInstance} from "../src/core/serialiseInstance";

/* ---------------------------------------------
 * Test models (decorator-based)
 * --------------------------------------------- */

class SimpleModel {
    static deserialiseCalled = false;
    static serialiseCalled = false;

    static deserialise(obj: any) {
        SimpleModel.deserialiseCalled = true;
        const m = Object.create(SimpleModel.prototype);
        m.x = obj.x * 2;
        return m;
    }

    static serialise(obj: SimpleModel) {
        SimpleModel.serialiseCalled = true;
        return {x: obj.x / 2};
    }

    @Field(TSType.Value)
    x!: number;
}

class NestedModel {
    @Field(TSType.Value)
    y!: string;
}

class ContainerModel {
    @Field(TSType.Object, SimpleModel)
    a!: SimpleModel;

    @Field(TSType.Object, NestedModel)
    b!: NestedModel;

    @Field(TSType.Array, SimpleModel)
    arr!: SimpleModel[];
}

class ExpandoModel {
    @Field(TSType.Value)
    known!: number;

    @Field(TSType.Expando)
    extra!: Record<string, any>;
}

class FailingSerialise {
    static serialise() {
        throw new Error("boom");
    }

    @Field(TSType.Value)
    x!: number;
}

it("does not serialise fields without @Field", () => {
    class ExtraFieldModel {
        @Field(TSType.Value)
        a!: number;

        // not decorated
        b!: number;
    }

    const inst = Object.create(ExtraFieldModel.prototype) as ExtraFieldModel;
    inst.a = 1;
    inst.b = 2;

    const out = serialiseInstance(inst);

    expect(out).toEqual({a: 1});
});


class OptionalModel {
    @OptionalField(TSType.Value)
    maybe?: number;
}

/* ---------------------------------------------
 * Tests
 * --------------------------------------------- */

describe("serialise / deserialise (decorator-based schemas)", () => {
    it("uses static deserialise instead of constructor", () => {
        SimpleModel.deserialiseCalled = false;

        const inst = createInstance(
            {x: 10},
            SimpleModel,
            null,
            "root"
        ) as SimpleModel;

        expect(SimpleModel.deserialiseCalled).toBe(true);
        expect(inst).toBeInstanceOf(SimpleModel);
        expect(inst.x).toBe(20);
    });

    it("uses static serialise instead of schema walk", () => {
        SimpleModel.serialiseCalled = false;

        const inst = Object.create(SimpleModel.prototype) as SimpleModel;
        inst.x = 20;

        const out = serialiseInstance(inst);

        expect(SimpleModel.serialiseCalled).toBe(true);
        expect(out).toEqual({x: 10});
    });

    it("round-trips cleanly via serialise + deserialise", () => {
        const input = {x: 7};

        const inst = createInstance(
            input,
            SimpleModel,
            null,
            "root"
        ) as SimpleModel;

        const out = serialiseInstance(inst);

        expect(out).toEqual(input);
    });

    it("falls back to schema traversal when no hooks exist", () => {
        const input = {y: "hello"};

        const inst = createInstance(
            input,
            NestedModel,
            null,
            "root"
        ) as NestedModel;

        const out = serialiseInstance(inst);

        expect(out).toEqual(input);
    });

    it("handles nested objects with mixed hook usage", () => {
        const input = {
            a: {x: 2},
            b: {y: "ok"},
            arr: [{x: 1}, {x: 3}]
        };

        const inst = createInstance(
            input,
            ContainerModel,
            null,
            "root"
        ) as ContainerModel;

        expect(inst.a.x).toBe(4);
        expect(inst.arr[1].x).toBe(6);

        const out = serialiseInstance(inst);

        expect(out).toEqual(input);
    });

    it("handles arrays of hooked types", () => {
        const input = [{x: 5}, {x: 8}];

        class ArrayContainer {
            @Field(TSType.Array, SimpleModel)
            items!: SimpleModel[];
        }

        const inst = createInstance(
            {items: input},
            ArrayContainer,
            null,
            "root"
        ) as ArrayContainer;

        expect(inst.items[0].x).toBe(10);
        expect(inst.items[1].x).toBe(16);

        const out = serialiseInstance(inst);

        expect(out).toEqual({
            items: [{x: 5}, {x: 8}]
        });
    });


    it("preserves expando properties during serialisation", () => {
        const input = {
            known: 1,
            foo: "bar",
            count: 42
        };

        const inst = createInstance(
            input,
            ExpandoModel,
            null,
            "root"
        ) as ExpandoModel;

        expect(inst.extra).toEqual({
            foo: "bar",
            count: 42
        });

        const out = serialiseInstance(inst);

        expect(out).toEqual(input);
    });

    it("throws if static serialise throws", () => {
        const inst = Object.create(FailingSerialise.prototype) as FailingSerialise;
        inst.x = 1;

        expect(() =>
            serialiseInstance(inst)
        ).toThrow(RIFTError);
    });

    it("throws if required field is null during serialisation", () => {
        const inst = Object.create(NestedModel.prototype) as NestedModel;
        inst.y = null as any;

        expect(() =>
            serialiseInstance(inst)
        ).toThrow(RIFTError);
    });

    it("allows optional fields to be omitted", () => {
        const inst = createInstance(
            {},
            OptionalModel,
            null,
            "root"
        ) as OptionalModel;

        const out = serialiseInstance(inst);

        expect(out).toEqual({maybe: null});
    });

    it("does not call constructor when deserialise exists", () => {
        let ctorCalled = false;

        class NoCtorCall {
            constructor() {
                ctorCalled = true;
            }

            static deserialise(obj: any) {
                const v = Object.create(NoCtorCall.prototype);
                v.x = obj.x;
                return v;
            }

            @Field(TSType.Value)
            x!: number;
        }

        createInstance({x: 1}, NoCtorCall, null, "root");

        expect(ctorCalled).toBe(false);
    });
});
