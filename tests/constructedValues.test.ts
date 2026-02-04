import {describe, it, expect} from "vitest";
import {createInstance} from "../src";
import {Field, OptionalField, BypassConstructor, TSType} from "../src";
import {RIFTError} from "../src/utils/errors";

/* -----------------------------------------
 * Helpers
 * ----------------------------------------- */

function expectRIFT(fn: () => any, message?: RegExp) {
    try {
        fn();
        throw new Error("Expected RIFTError");
    } catch (e: any) {
        expect(e).toBeInstanceOf(RIFTError);
        if (message) {
            expect(e.message).toMatch(message);
        }
    }
}

/* -----------------------------------------
 * Default factory vs input
 * ----------------------------------------- */

@BypassConstructor({bypassConstructor: true})
class IdentityValue {
    @Field(TSType.Value, (v) => v)
    value!: number;
}

describe("TSType.Value – factory identity", () => {
    it("uses input value when provided", () => {
        const inst = createInstance({value: 42}, IdentityValue);
        expect(inst.value).toBe(42);
    });

    it("throws when required value is missing", () => {
        expectRIFT(
            () => createInstance({}, IdentityValue),
            /Missing required property: value/
        );
    });
});

/* -----------------------------------------
 * Default factory misuse
 * ----------------------------------------- */

@BypassConstructor({bypassConstructor: true})
class ConstantFactoryValue {
    @Field(TSType.Value, () => 123)
    value!: number;
}

describe("TSType.Value – constant factory misuse", () => {
    it("overrides provided input when using zero-arg factory", () => {
        const inst = createInstance({value: 999}, ConstantFactoryValue);
        expect(inst.value).toBe(123);
    });

    it("throws when required value is missing", () => {
        expectRIFT(
            () => createInstance({}, ConstantFactoryValue),
            /Missing required property: value/
        );
    });
});

/* -----------------------------------------
 * ifEmpty semantics
 * ----------------------------------------- */

@BypassConstructor({bypassConstructor: true})
class IfEmptyValue {
    @OptionalField(TSType.Value, null, () => 123)
    value!: number;
}

describe("TSType.Value – ifEmpty", () => {
    it("applies default when value is missing", () => {
        const inst = createInstance({}, IfEmptyValue);
        expect(inst.value).toBe(123);
    });

    it("does not override provided input", () => {
        const inst = createInstance({value: 999}, IfEmptyValue);
        expect(inst.value).toBe(999);
    });

    it("calls ifEmpty if value is undefined explicitly", () => {
        const inst = createInstance({value: undefined}, IfEmptyValue);
        expect(inst.value).toBeTruthy();
    });

    it("calls ifEmpty when value is null", () => {
        const inst = createInstance({value: null}, IfEmptyValue);
        expect(inst.value).toBeTruthy();
    });
});

/* -----------------------------------------
 * Constructor transforms (Date)
 * ----------------------------------------- */

@BypassConstructor({bypassConstructor: true})
class DateValue {
    @Field(TSType.Value, Date)
    date!: Date;
}

describe("TSType.Value – constructor transform", () => {
    it("constructs Date from ISO string", () => {
        const inst = createInstance(
            {date: "2025-01-01T00:00:00.000Z"},
            DateValue
        );

        expect(inst.date).toBeInstanceOf(Date);
        expect(inst.date.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    });

    it("creates Invalid Date when Date constructor receives invalid input", () => {
        const inst = createInstance({date: "not-a-date"}, DateValue);

        expect(inst.date).toBeInstanceOf(Date);
        expect(Number.isNaN(inst.date.getTime())).toBe(true);
    });


    it("throws when required Date is missing", () => {
        expectRIFT(
            () => createInstance({}, DateValue),
            /Missing required property: date/
        );
    });
});

/* -----------------------------------------
 * Optional value fields
 * ----------------------------------------- */

@BypassConstructor({bypassConstructor: true})
class OptionalValue {
    @OptionalField(TSType.Value)
    value?: number;
}

describe("TSType.Value – optional fields", () => {
    it("sets missing optional value to null", () => {
        const inst = createInstance({}, OptionalValue);
        expect(inst.value).toBeNull();
    });

    it("accepts provided value", () => {
        const inst = createInstance({value: 5}, OptionalValue);
        expect(inst.value).toBe(5);
    });
});

/* -----------------------------------------
 * Bad factories
 * ----------------------------------------- */

@BypassConstructor({bypassConstructor: true})
class ThrowingFactory {
    @Field(TSType.Value, () => {
        throw new Error("boom");
    })
    value!: number;
}

describe("TSType.Value – bad factories", () => {
    it("always calls zero-arg factory even when input is provided", () => {
        expect(() =>
            createInstance({value: 10}, ThrowingFactory)
        ).toThrowError("boom");
    });

    it("throws when missing required value", () => {
        expectRIFT(
            () => createInstance({}, ThrowingFactory),
            /Missing required property: value/
        );
    });
});

/* -----------------------------------------
 * Null vs undefined semantics
 * ----------------------------------------- */

@BypassConstructor({bypassConstructor: true})
class NullVsUndefined {
    @OptionalField(TSType.Value, null, () => 123)
    value!: number;
}

describe("TSType.Value – null vs undefined", () => {
    it("treats undefined as empty and applies ifEmpty", () => {
        const inst = createInstance({value: undefined}, NullVsUndefined);
        expect(inst.value).toBe(123);
    });

    it("treats null as empty and applies ifEmpty", () => {
        const inst = createInstance({value: null}, NullVsUndefined);
        expect(inst.value).toBe(123);
    });
});
