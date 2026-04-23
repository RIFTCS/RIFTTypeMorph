import {describe, it, expect} from "vitest";
import {Field, OptionalField} from "../src";
import {TSType} from "../src/core/TSType";
import {serialiseInstance} from "../src/core/serialiseInstance";
import {createInstance} from "../src/core/createInstance";
import {CustomSerialise} from "../src/decorators/customSerialiser";
import {RIFTError} from "../src/utils/errors";

class DateOnly extends Date {
    private _value: string;

    constructor(value: string | number | Date) {
        const normalized = DateOnly.normaliseUnknownInput(value);
        super(`${normalized}T00:00:00.000Z`);
        this._value = normalized;
    }

    static serialise(value: DateOnly | Date | string | number | null | undefined): string | null {
        if (value === null || value === undefined) {
            return null;
        }

        return DateOnly.normaliseUnknownInput(value);
    }

    static deserialise(value: unknown): DateOnly | null {
        if (value === null || value === undefined) {
            return null;
        }

        return new DateOnly(DateOnly.normaliseUnknownInput(value));
    }

    toPlainString(): string {
        return this._value;
    }

    override toJSON(): string {
        return this._value;
    }

    override toISOString(): string {
        return `${this._value}T00:00:00.000Z`;
    }

    private static normaliseUnknownInput(value: unknown): string {
        if (value instanceof DateOnly) {
            return value.toPlainString();
        }

        if (value instanceof Date) {
            return DateOnly.formatPartsUTC(
                value.getUTCFullYear(),
                value.getUTCMonth(),
                value.getUTCDate()
            );
        }

        if (typeof value === "number") {
            const d = new Date(value);

            if (Number.isNaN(d.getTime())) {
                throw new TypeError(`Invalid DateOnly numeric input: ${value}`);
            }

            return DateOnly.formatPartsUTC(
                d.getUTCFullYear(),
                d.getUTCMonth(),
                d.getUTCDate()
            );
        }

        if (typeof value === "string") {
            const trimmed = value.trim();

            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                return DateOnly.validateDateString(trimmed);
            }

            const parsed = new Date(trimmed);

            if (!Number.isNaN(parsed.getTime())) {
                return DateOnly.formatPartsUTC(
                    parsed.getUTCFullYear(),
                    parsed.getUTCMonth(),
                    parsed.getUTCDate()
                );
            }

            throw new TypeError(`Invalid DateOnly string: "${value}"`);
        }

        throw new TypeError(`Unsupported DateOnly input type: ${value === null ? "null" : typeof value}`);
    }

    private static validateDateString(value: string): string {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

        if (!match) {
            throw new TypeError(`Invalid DateOnly string: "${value}"`);
        }

        const year = Number(match[1]);
        const monthIndex = Number(match[2]) - 1;
        const day = Number(match[3]);

        return DateOnly.formatPartsUTC(year, monthIndex, day);
    }

    private static formatPartsUTC(year: number, monthIndex: number, day: number): string {
        const d = new Date(Date.UTC(year, monthIndex, day));

        if (
            d.getUTCFullYear() !== year ||
            d.getUTCMonth() !== monthIndex ||
            d.getUTCDate() !== day
        ) {
            throw new RangeError(`Invalid calendar date: ${year}-${monthIndex + 1}-${day}`);
        }

        const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");

        return `${yyyy}-${mm}-${dd}`;
    }
}

class UpperString {
    constructor(public readonly value: string) {
    }

    static serialise(value: UpperString): string {
        return value.value.toUpperCase();
    }

    static deserialise(value: string): UpperString {
        return new UpperString(value.toLowerCase());
    }
}

class PrefixNumber {
    constructor(public readonly value: number) {
    }

    static serialise(value: PrefixNumber): string {
        return `n:${value.value}`;
    }

    static deserialise(value: string): PrefixNumber {
        const match = /^n:(-?\d+)$/.exec(value);
        if (!match) {
            throw new Error("Invalid PrefixNumber payload");
        }
        return new PrefixNumber(Number(match[1]));
    }
}

class BadSerialiseValue {
    constructor(public readonly value: string) {
    }

    static serialise(_value: BadSerialiseValue): symbol {
        return Symbol("bad");
    }

    static deserialise(value: string): BadSerialiseValue {
        return new BadSerialiseValue(value);
    }
}

class ThrowingSerialiseValue {
    constructor(public readonly value: string) {
    }

    static serialise(_value: ThrowingSerialiseValue): string {
        throw new Error("serialise boom");
    }

    static deserialise(value: string): ThrowingSerialiseValue {
        return new ThrowingSerialiseValue(value);
    }
}

class ThrowingDeserialiseValue {
    constructor(public readonly value: string) {
    }

    static serialise(value: ThrowingDeserialiseValue): string {
        return value.value;
    }

    static deserialise(_value: string): ThrowingDeserialiseValue {
        throw new Error("deserialise boom");
    }
}

class OnlySerialise {
    constructor(public readonly value: string) {
    }

    static serialise(value: OnlySerialise): string {
        return value.value;
    }
}

class OnlyDeserialise {
    constructor(public readonly value: string) {
    }

    static deserialise(value: string): OnlyDeserialise {
        return new OnlyDeserialise(value);
    }
}

describe("TypeMorph runtime contract - TSType.Value auto-detection", () => {
    it("serialises a value field using static serialise()", () => {
        class Test {
            @Field(TSType.Value, DateOnly)
            date!: DateOnly;
        }

        const obj = new Test();
        obj.date = new DateOnly("2026-04-23");

        const result = serialiseInstance(obj);

        expect(result.date).toBe("2026-04-23");
    });

    it("deserialises a value field using static deserialise()", () => {
        class Test {
            @Field(TSType.Value, DateOnly)
            date!: DateOnly;
        }

        const restored = createInstance({date: "2026-04-23"}, Test);

        expect(restored.date).toBeInstanceOf(DateOnly);
        expect(restored.date.toPlainString()).toBe("2026-04-23");
    });

    it("migrates legacy ISO Date strings into DateOnly for value fields", () => {
        class Test {
            @Field(TSType.Value, DateOnly)
            date!: DateOnly;
        }

        const restored = createInstance(
            {date: "2026-04-23T18:41:11.000Z"},
            Test
        );

        expect(restored.date).toBeInstanceOf(DateOnly);
        expect(restored.date.toPlainString()).toBe("2026-04-23");
    });

    it("migrates legacy numeric timestamps into DateOnly for value fields", () => {
        class Test {
            @Field(TSType.Value, DateOnly)
            date!: DateOnly;
        }

        const raw = Date.UTC(2026, 3, 23, 15, 30, 0);
        const restored = createInstance({date: raw}, Test);

        expect(restored.date).toBeInstanceOf(DateOnly);
        expect(restored.date.toPlainString()).toBe("2026-04-23");
    });

    it("prefers custom runtime serialise() over generic Date serialisation for Date subclasses", () => {
        class Test {
            @Field(TSType.Value, DateOnly)
            date!: DateOnly;
        }

        const obj = new Test();
        obj.date = new DateOnly("2026-04-23");

        const result = serialiseInstance(obj);

        expect(result.date).toBe("2026-04-23");
        expect(result.date).not.toBe("2026-04-23T00:00:00.000Z");
    });

    it("supports non-Date value objects using the same contract", () => {
        class Test {
            @Field(TSType.Value, UpperString)
            value!: UpperString;
        }

        const obj = new Test();
        obj.value = new UpperString("hello");

        const serialised = serialiseInstance(obj);
        expect(serialised.value).toBe("HELLO");

        const restored = createInstance(serialised, Test);
        expect(restored.value).toBeInstanceOf(UpperString);
        expect(restored.value.value).toBe("hello");
    });

    it("supports arrays of value objects when field itself is a value transformed as a whole", () => {
        class StringBag {
            constructor(public readonly values: string[]) {
            }

            static serialise(value: StringBag): string {
                return JSON.stringify(value.values);
            }

            static deserialise(value: string): StringBag {
                return new StringBag(JSON.parse(value));
            }
        }

        class Test {
            @Field(TSType.Value, StringBag)
            bag!: StringBag;
        }

        const obj = new Test();
        obj.bag = new StringBag(["a", "b", "c"]);

        const serialised = serialiseInstance(obj);
        expect(serialised.bag).toBe("[\"a\",\"b\",\"c\"]");

        const restored = createInstance(serialised, Test);
        expect(restored.bag).toBeInstanceOf(StringBag);
        expect(restored.bag.values).toEqual(["a", "b", "c"]);
    });

    it("supports null for optional value fields without invoking the runtime contract", () => {
        class Test {
            @OptionalField(TSType.Value, DateOnly)
            date!: DateOnly | null;
        }

        const obj = new Test();
        obj.date = null;

        const serialised = serialiseInstance(obj);
        expect(serialised.date).toBeNull();

        const restored = createInstance({date: null}, Test);
        expect(restored.date).toBeNull();
    });

    it("throws when runtime serialise() returns an unsupported wire type", () => {
        class Test {
            @Field(TSType.Value, BadSerialiseValue)
            value!: BadSerialiseValue;
        }

        const obj = new Test();
        obj.value = new BadSerialiseValue("x");

        expect(() => serialiseInstance(obj)).toThrow(RIFTError);
    });

    it("wraps runtime serialise() errors in RIFTError", () => {
        class Test {
            @Field(TSType.Value, ThrowingSerialiseValue)
            value!: ThrowingSerialiseValue;
        }

        const obj = new Test();
        obj.value = new ThrowingSerialiseValue("x");

        expect(() => serialiseInstance(obj)).toThrow(RIFTError);
        expect(() => serialiseInstance(obj)).toThrow(/serialise boom/);
    });

    it("wraps runtime deserialise() errors in RIFTError for value fields", () => {
        class Test {
            @Field(TSType.Value, ThrowingDeserialiseValue)
            value!: ThrowingDeserialiseValue;
        }

        expect(() => createInstance({value: "x"}, Test)).toThrow(RIFTError);
        expect(() => createInstance({value: "x"}, Test)).toThrow(/deserialise boom/);
    });

    it("does not use partial contracts that only define serialise()", () => {
        class Test {
            @Field(TSType.Value, OnlySerialise as any)
            value!: OnlySerialise;
        }

        const obj = new Test();
        obj.value = new OnlySerialise("abc");

        const serialised = serialiseInstance(obj);
        expect(serialised.value).toEqual({value: "abc"});

        const restored = createInstance(serialised, Test);
        expect(restored.value).toBeInstanceOf(OnlySerialise);
        expect(restored.value.value).toEqual({value: "abc"} as any);
    });

    it("does not use partial contracts that only define deserialise()", () => {
        class Test {
            @Field(TSType.Value, OnlyDeserialise as any)
            value!: OnlyDeserialise;
        }

        const obj = new Test();
        obj.value = new OnlyDeserialise("abc");

        const serialised = serialiseInstance(obj);
        expect(serialised.value).toEqual({value: "abc"});

        const restored = createInstance(serialised, Test);
        expect(restored.value).toBeInstanceOf(OnlyDeserialise);
        expect(restored.value.value).toEqual({value: "abc"} as any);
    });

    it("works for included getters because they pass through serialiseValue()", () => {
        class Test {
            @Field(TSType.Value, DateOnly)
            stored!: DateOnly;

            get derived(): DateOnly {
                return new DateOnly("2026-05-01");
            }
        }

        Object.defineProperty(Test.prototype, "__includedMethods", {
            value: new Set(["derived"]),
            configurable: true
        });

        const obj = new Test();
        obj.stored = new DateOnly("2026-04-23");

        const serialised = serialiseInstance(obj);

        expect(serialised.stored).toBe("2026-04-23");
        expect(serialised.derived).toBe("2026-05-01");
    });
});

describe("TypeMorph runtime contract - precedence with @CustomSerialise", () => {
    it("field-level custom serializer overrides class static serialise()", () => {
        class Test {
            @Field(TSType.Value, DateOnly)
            @CustomSerialise<DateOnly, string>(
                _v => "custom-out",
                _v => "2026-06-30",
                "string"
            )
            date!: DateOnly;
        }

        const obj = new Test();
        obj.date = new DateOnly("2026-04-23");

        const serialised = serialiseInstance(obj);
        expect(serialised.date).toBe("custom-out");

        const restored = createInstance(serialised, Test);
        expect(restored.date).toBeInstanceOf(DateOnly);
        expect(restored.date.toPlainString()).toBe("2026-06-30");
    });

    it("field custom serialiser runs after class static serialise() for value fields, and custom deserialise runs before class static deserialise()", () => {
        class Test {
            @Field(TSType.Value, PrefixNumber)
            @CustomSerialise<string, string>(
                v => `wire:${v}`,
                v => v.replace(/^wire:/, ""),
                "string"
            )
            value!: PrefixNumber;
        }

        const obj = new Test();
        obj.value = new PrefixNumber(7);

        const serialised = serialiseInstance(obj);
        expect(serialised.value).toBe("wire:n:7");

        const restored = createInstance(serialised, Test);
        expect(restored.value).toBeInstanceOf(PrefixNumber);
        expect(restored.value.value).toBe(7);
    });

    it("handles null through field-level custom serializer when handlesNull is true", () => {
        class Test {
            @Field(TSType.Value, DateOnly)
            @CustomSerialise<DateOnly | null, string | null>(
                v => v === null ? "NULL-SENTINEL" : DateOnly.serialise(v),
                v => v === "NULL-SENTINEL" ? null : v,
                "string",
                true
            )
            value!: DateOnly | null;
        }

        const obj = new Test();
        obj.value = null;

        const serialised = serialiseInstance(obj);
        expect(serialised.value).toBe("NULL-SENTINEL");

        expect(() => createInstance(serialised, Test)).toThrow();
    });
});

describe("TypeMorph runtime contract - TSType.Object compatibility", () => {
    it("still supports top-level object serialise/deserialise hooks", () => {
        class WrappedDate {
            constructor(public readonly value: string) {
            }

            static serialise(value: WrappedDate): string {
                return `wrapped:${value.value}`;
            }

            static deserialise(value: string): WrappedDate {
                return new WrappedDate(value.replace(/^wrapped:/, ""));
            }
        }

        const instance = new WrappedDate("abc");

        const serialised = serialiseInstance(instance);
        expect(serialised).toBe("wrapped:abc");

        const restored = createInstance("wrapped:abc", WrappedDate);
        expect(restored).toBeInstanceOf(WrappedDate);
        expect(restored.value).toBe("abc");
    });

    it("supports object fields whose class defines static serialise/deserialise()", () => {
        class WrappedDate {
            constructor(public readonly value: string) {
            }

            static serialise(value: WrappedDate): string {
                return `wrapped:${value.value}`;
            }

            static deserialise(value: string): WrappedDate {
                return new WrappedDate(value.replace(/^wrapped:/, ""));
            }
        }

        class Test {
            @Field(TSType.Object, WrappedDate)
            value!: WrappedDate;
        }

        const obj = new Test();
        obj.value = new WrappedDate("abc");

        const serialised = serialiseInstance(obj);
        expect(serialised.value).toBe("wrapped:abc");

        const restored = createInstance(serialised, Test);
        expect(restored.value).toBeInstanceOf(WrappedDate);
        expect(restored.value.value).toBe("abc");
    });
});

describe("TypeMorph runtime contract - arrays and nesting", () => {
    it("serialises arrays of objects that each use the runtime contract", () => {
        class Test {
            @Field(TSType.Array, DateOnly)
            dates!: DateOnly[];
        }

        const obj = new Test();
        obj.dates = [
            new DateOnly("2026-04-23"),
            new DateOnly("2026-04-24")
        ];

        const serialised = serialiseInstance(obj);
        expect(serialised.dates).toEqual([
            "2026-04-23",
            "2026-04-24"
        ]);

        const restored = createInstance(serialised, Test);
        expect(restored.dates[0]).toBeInstanceOf(DateOnly);
        expect(restored.dates[1]).toBeInstanceOf(DateOnly);
        expect(restored.dates[0].toPlainString()).toBe("2026-04-23");
        expect(restored.dates[1].toPlainString()).toBe("2026-04-24");
    });

    it("supports nested value-object fields inside ordinary schema classes", () => {
        class Inner {
            @Field(TSType.Value, DateOnly)
            date!: DateOnly;
        }

        class Outer {
            @Field(TSType.Object, Inner)
            inner!: Inner;
        }

        const inner = new Inner();
        inner.date = new DateOnly("2026-07-04");

        const outer = new Outer();
        outer.inner = inner;

        const serialised = serialiseInstance(outer);
        expect(serialised.inner.date).toBe("2026-07-04");

        const restored = createInstance(serialised, Outer);
        expect(restored.inner.date).toBeInstanceOf(DateOnly);
        expect(restored.inner.date.toPlainString()).toBe("2026-07-04");
    });
});

describe("TypeMorph runtime contract - required/null behavior", () => {
    it("throws when required runtime-serialisable value field is null", () => {
        class Test {
            @Field(TSType.Value, DateOnly)
            date!: DateOnly;
        }

        const obj = new Test();
        obj.date = null as any;

        expect(() => serialiseInstance(obj)).toThrow(RIFTError);
        expect(() => serialiseInstance(obj)).toThrow(/Required field was null during serialisation/);
    });

    it("returns null for optional runtime-serialisable value fields when input is missing", () => {
        class Test {
            @OptionalField(TSType.Value, DateOnly)
            date!: DateOnly | null;
        }

        const restored = createInstance({}, Test);
        expect(restored.date).toBeNull();
    });

    it("throws when required runtime-serialisable value field is missing", () => {
        class Test {
            @Field(TSType.Value, DateOnly)
            date!: DateOnly;
        }

        expect(() => createInstance({}, Test)).toThrow(RIFTError);
        expect(() => createInstance({}, Test)).toThrow(/Missing required property: date/);
    });
});

describe("TypeMorph runtime contract - regression checks", () => {
    it("keeps plain primitive value fields unchanged", () => {
        class Test {
            @Field(TSType.Value)
            count!: number;

            @Field(TSType.Value)
            name!: string;

            @Field(TSType.Value)
            enabled!: boolean;
        }

        const obj = new Test();
        obj.count = 5;
        obj.name = "alpha";
        obj.enabled = true;

        const serialised = serialiseInstance(obj);
        expect(serialised).toEqual({
            count: 5,
            name: "alpha",
            enabled: true
        });

        const restored = createInstance(serialised, Test);
        expect(restored.count).toBe(5);
        expect(restored.name).toBe("alpha");
        expect(restored.enabled).toBe(true);
    });

    it("keeps built-in Date value fields working normally", () => {
        class Test {
            @Field(TSType.Value, Date)
            createdAt!: Date;
        }

        const obj = new Test();
        obj.createdAt = new Date("2026-04-23T12:00:00.000Z");

        const serialised = serialiseInstance(obj);
        expect(serialised.createdAt).toBe("2026-04-23T12:00:00.000Z");

        const restored = createInstance(serialised, Test);
        expect(restored.createdAt).toBeInstanceOf(Date);
        expect(restored.createdAt.toISOString()).toBe("2026-04-23T12:00:00.000Z");
    });

    it("keeps ordinary class value coercion working when no runtime contract exists", () => {
        class Box {
            constructor(public readonly value: any) {
            }
        }

        class Test {
            @Field(TSType.Value, Box)
            box!: Box;
        }

        const restored = createInstance({box: "abc"}, Test);

        expect(restored.box).toBeInstanceOf(Box);
        expect(restored.box.value).toBe("abc");

        const obj = new Test();
        obj.box = new Box("abc");

        const serialised = serialiseInstance(obj);
        expect(serialised.box).toEqual({value: "abc"});
    });
});