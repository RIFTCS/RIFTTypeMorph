import {describe, it, expect} from "vitest";
import {CustomSerialise} from "../src/decorators/customSerialiser";
import {serialiseInstance} from "../src/core/serialiseInstance";
import {createInstance} from "../src/core/createInstance";
import {TSType} from "../src/core/TSType";
import {RIFTError} from "../src/utils/errors";
import {Field, OptionalField} from "../src";

/* ---------------- helpers ---------------- */

function encode(obj: any): string {
    return Buffer.from(JSON.stringify(obj)).toString("base64");
}

function decode(str: string): any {
    return JSON.parse(Buffer.from(str, "base64").toString());
}

/* ---------------- tests ---------------- */

describe("CustomSerialise integration", () => {

    it("hydrates plain primitive arrays", () => {
        class Test {
            @Field(TSType.Value)
            values!: number[];
        }

        const restored = createInstance({values: [1, 2, 3, 4]}, Test);
        expect(restored.values).toEqual([1, 2, 3, 4]);
    });

    it("round-trips compressed array of objects via custom serializer", () => {

        class Baseline {

            @Field(TSType.Value)
            name!: string;

            @Field(TSType.Value)
            value!: number;

        }

        class Test {

            @Field(TSType.Array, Baseline)
            @CustomSerialise<Baseline[], string[]>(
                arr => arr.map((v: any) => encode(v)),
                arr => arr.map((v: any) => decode(v)),
                Array
            )
            baselines!: Baseline[];

        }

        const b1 = new Baseline();
        b1.name = "A";
        b1.value = 1;

        const b2 = new Baseline();
        b2.name = "B";
        b2.value = 2;

        const obj = new Test();
        obj.baselines = [b1, b2];

        const serialised = serialiseInstance(obj);

        expect(Array.isArray(serialised.baselines)).toBe(true);
        expect(typeof serialised.baselines[0]).toBe("string");

        const restored = createInstance(serialised, Test);

        expect(restored.baselines).toHaveLength(2);

        expect(restored.baselines[0]).toBeInstanceOf(Baseline);
        expect(restored.baselines[0].name).toBe("A");
        expect(restored.baselines[0].value).toBe(1);

        expect(restored.baselines[1]).toBeInstanceOf(Baseline);
        expect(restored.baselines[1].name).toBe("B");
        expect(restored.baselines[1].value).toBe(2);
    });

    it("round-trips Date → number → Date", () => {

        class Test {

            @Field(TSType.Value, Date)
            @CustomSerialise<string, number>(
                v => new Date(v).getTime(),
                v => new Date(v).toISOString(),
                "number"
            )
            createdAt!: Date;

        }

        const obj = new Test();
        obj.createdAt = new Date(1000);

        const serialised = serialiseInstance(obj);

        expect(serialised.createdAt).toBe(1000);

        const restored = createInstance(serialised, Test);

        expect(restored.createdAt).toBeInstanceOf(Date);
        expect(restored.createdAt.getTime()).toBe(1000);
    });

    it("round-trips nested object through base64 serializer", () => {

        class Inner {

            @Field(TSType.Value)
            name!: string;

            @Field(TSType.Value)
            age!: number;

        }

        class Wrapper {

            @Field(TSType.Object, Inner)
            @CustomSerialise<Inner, string>(
                v => encode(v),
                v => decode(v),
                "string"
            )
            payload!: Inner;

        }

        const inner = new Inner();
        inner.name = "Alice";
        inner.age = 42;

        const wrapper = new Wrapper();
        wrapper.payload = inner;

        const serialised = serialiseInstance(wrapper);

        expect(typeof serialised.payload).toBe("string");

        const restored = createInstance(serialised, Wrapper);

        expect(restored.payload).toBeInstanceOf(Inner);
        expect(restored.payload.name).toBe("Alice");
        expect(restored.payload.age).toBe(42);
    });

    it("round-trips arrays via custom serializer", () => {

        class Test {

            @Field(TSType.Value)
            @CustomSerialise<number[], string>(
                v => encode(v),
                v => decode(v),
                "string"
            )
            values!: number[];

        }

        const obj = new Test();
        obj.values = [1, 2, 3, 4];

        const serialised = serialiseInstance(obj);

        expect(typeof serialised.values).toBe("string");

        const restored = createInstance(serialised, Test);

        expect(restored.values).toEqual([1, 2, 3, 4]);
    });

    it("supports nested schema traversal before serialisation", () => {

        class Inner {

            @Field(TSType.Value)
            value!: number;

        }

        class Test {

            @Field(TSType.Object, Inner)
            @CustomSerialise<Inner, string>(
                v => encode(v),
                v => decode(v),
                "string"
            )
            inner!: Inner;

        }

        const inner = new Inner();
        inner.value = 123;

        const test = new Test();
        test.inner = inner;

        const serialised = serialiseInstance(test);

        const decoded = decode(serialised.inner);

        expect(decoded.value).toBe(123);
    });

    it("supports multiple custom serializers in same object", () => {

        class Test {

            @Field(TSType.Value)
            @CustomSerialise<number, number>(
                v => v + 1,
                v => v - 1,
                "number"
            )
            a!: number;

            @Field(TSType.Value)
            @CustomSerialise<number, number>(
                v => v * 2,
                v => v / 2,
                "number"
            )
            b!: number;

        }

        const obj = new Test();
        obj.a = 5;
        obj.b = 10;

        const serialised = serialiseInstance(obj);

        expect(serialised.a).toBe(6);
        expect(serialised.b).toBe(20);

        const restored = createInstance(serialised, Test);

        expect(restored.a).toBe(5);
        expect(restored.b).toBe(10);
    });

    it("runs custom deserialiser before schema hydration", () => {

        class Inner {

            @Field(TSType.Value)
            value!: number;

        }

        class Test {

            @Field(TSType.Object, Inner)
            @CustomSerialise<Inner, string>(
                v => encode(v),
                v => decode(v),
                "string"
            )
            inner!: Inner;

        }

        const raw = {
            inner: encode({value: 77})
        };

        const instance = createInstance(raw, Test);

        expect(instance.inner).toBeInstanceOf(Inner);
        expect(instance.inner.value).toBe(77);

    });

    it("throws when serializer returns invalid runtime type", () => {

        class Test {

            @Field(TSType.Value)
            @CustomSerialise<number, number>(
                () => "invalid" as any,
                v => v,
                "number"
            )
            value!: number;

        }

        const obj = new Test();
        obj.value = 5;

        expect(() => serialiseInstance(obj)).toThrow(RIFTError);

    });

    it("throws when deserialiser throws", () => {

        class Test {

            @Field(TSType.Value)
            @CustomSerialise<number, number>(
                v => v,
                () => {
                    throw new Error("boom");
                },
                "number"
            )
            value!: number;

        }

        expect(() => createInstance({value: 1}, Test)).toThrow(RIFTError);
    });

    it("throws when value is null and custom serialiser does not handle null", () => {
        class Test {
            @Field(TSType.Value)
            @CustomSerialise<number, number>(
                v => v * 2,
                v => v / 2,
                "number"
            )
            value!: number;
        }

        const obj = new Test();
        obj.value = null as any;

        expect(() => serialiseInstance(obj)).toThrow(
            /Required field was null during serialisation/
        );
    });

});

describe("CustomSerialise - handlesNull behaviour", () => {

    it("skips serializer when value is null by default", () => {

        class Test {

            @OptionalField(TSType.Value)
            @CustomSerialise<number, number>(
                v => v * 2,
                v => v / 2,
                "number"
            )
            value!: number;

        }

        const obj = new Test();
        obj.value = null as any;

        const result = serialiseInstance(obj);

        expect(result.value).toBeNull();
    });

    it("runs serializer for null when handlesNull is true", () => {

        class Test {

            @Field(TSType.Value)
            @CustomSerialise<number | null, number>(
                v => v === null ? -1 : v * 2,
                v => v === -1 ? null : v / 2,
                "number",
                true
            )
            value!: number | null;

        }

        const obj = new Test();
        obj.value = null;

        const result = serialiseInstance(obj);

        expect(result.value).toBe(-1);
    });

    it("throws if custom deserialiser produces null for required field", () => {

        class Test {

            @Field(TSType.Value)
            @CustomSerialise<number | null, number>(
                v => v === null ? -1 : v * 2,
                v => v === -1 ? null : v / 2,
                "number",
                true
            )
            value!: number | null;

        }

        const obj = new Test();
        obj.value = null;

        const serialised = serialiseInstance(obj);

        expect(() => createInstance(serialised, Test)).toThrow();
    });

    it("serializer still runs normally for non-null values", () => {

        class Test {

            @Field(TSType.Value)
            @CustomSerialise<number, number>(
                v => v * 2,
                v => v / 2,
                "number"
            )
            value!: number;

        }

        const obj = new Test();
        obj.value = 10;

        const serialised = serialiseInstance(obj);

        expect(serialised.value).toBe(20);

        const restored = createInstance(serialised, Test);

        expect(restored.value).toBe(10);
    });

    it("null handling works inside arrays when serializer handles null", () => {

        class Test {

            @Field(TSType.Value)
            @CustomSerialise<(number | null)[], string>(
                v => JSON.stringify(v),
                v => JSON.parse(v),
                "string",
                true
            )
            values!: (number | null)[];

        }

        const obj = new Test();
        obj.values = [1, null, 3];

        const serialised = serialiseInstance(obj);

        expect(typeof serialised.values).toBe("string");

        const restored = createInstance(serialised, Test);

        expect(restored.values).toEqual([1, null, 3]);
    });

});