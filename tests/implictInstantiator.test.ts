import {describe, it, expect, vi, beforeEach} from "vitest";

/* -------------------- mocks -------------------- */

vi.mock("../src/core/schemaDiscovery", () => ({
    parseClass: vi.fn(() => ({
        fields: {},
        expandoKey: null,
        includedKeys: null
    }))
}));

vi.mock("../src/decorators/rehydrateOptions", () => ({
    shouldBypassConstructor: vi.fn()
}));


import {parseClass} from "../src/core/schemaDiscovery";
import {shouldBypassConstructor} from "../src/decorators/rehydrateOptions";

import {createInstance, TSField, TSType} from "../src";
import {RIFTError} from "../src/utils/errors";

/* -------------------- helpers -------------------- */

function field(overrides: Partial<TSField> = {}): TSField {
    return {
        fieldType: TSType.Object,
        required: true,
        instantiator: null,
        ifEmpty: undefined,
        ...overrides
    } as TSField;
}

/* -------------------- test classes -------------------- */

class NormalCtor {
    constructed = true;
}

class BypassCtor {
    constructed = true;
}

/* -------------------- tests -------------------- */

describe("createInstance – instantiator inference and bypass behavior", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(parseClass).mockReturnValue({
            fields: {},
            expandoKey: null,
            includedKeys: new Set<string>()
        });
    });

    /* ---------- baseline behavior ---------- */

    it("throws when instantiator is missing and no inference is possible", () => {
        expect(() =>
            createInstance({}, null, null, "root")
        ).toThrowError(RIFTError);
    });

    it("collects error when instantiator is missing and collectErrors=true", () => {
        const res = createInstance(
            {},
            null,
            null,
            "root",
            {collectErrors: true}
        ) as any;

        expect(res.instance).toBeNull();
        expect(res.errors).toHaveLength(1);
        expect(res.errors[0]).toBeInstanceOf(RIFTError);
        expect(res.errors[0].message).toContain("Missing instantiator");
    });

    /* ---------- negative inference cases ---------- */

    it("falls back to normal construction when bypass is not allowed", () => {
        vi.mocked(shouldBypassConstructor).mockReturnValue(false);

        const f = field({
            instantiator: NormalCtor
        });

        const instance = createInstance({}, null, f, "root") as any;

        expect(instance).toBeInstanceOf(NormalCtor);
    });

    it("treats non-constructor function as factory instantiator", () => {
        vi.mocked(shouldBypassConstructor).mockReturnValue(true);

        const factory = ((_: any) => ({ok: true})) as any;

        const f = field({
            instantiator: factory
        });

        const instance = createInstance({}, null, f, "root") as any;

        expect(instance).toEqual({ok: true});
    });


    /* ---------- positive inference cases ---------- */

    it("infers constructor from field.instantiator when bypass is allowed", () => {
        vi.mocked(shouldBypassConstructor).mockReturnValue(true);

        const f = field({
            instantiator: BypassCtor
        });

        const instance = createInstance({}, null, f, "root") as any;

        expect(instance).toBeInstanceOf(BypassCtor);
    });

    it("creates instance via Object.create when bypassing constructor", () => {
        const ctorSpy = vi.fn();

        class Test {
            constructor() {
                ctorSpy();
            }
        }

        vi.mocked(shouldBypassConstructor).mockReturnValue(true);

        const f = field({
            instantiator: Test
        });

        const instance = createInstance({}, null, f, "root") as any;

        expect(ctorSpy).not.toHaveBeenCalled();
        expect(Object.getPrototypeOf(instance)).toBe(Test.prototype);
    });

    /* ---------- explicit bypassConstructor option ---------- */

    it("forces bypass when options.bypassConstructor=true", () => {
        vi.mocked(shouldBypassConstructor).mockReturnValue(false);

        const ctorSpy = vi.fn();

        class Forced {
            constructor() {
                ctorSpy();
            }
        }

        const f = field({
            instantiator: Forced
        });

        const instance = createInstance(
            {},
            null,
            f,
            "root",
            {bypassConstructor: true}
        ) as any;

        expect(ctorSpy).not.toHaveBeenCalled();
        expect(instance).toBeInstanceOf(Forced);
    });

    it("uses constructor when bypassConstructor=false", () => {
        vi.mocked(shouldBypassConstructor).mockReturnValue(true);

        const ctorSpy = vi.fn();

        class Test {
            constructor() {
                ctorSpy();
            }
        }

        const f = field({
            instantiator: Test
        });

        const instance = createInstance(
            {},
            null,
            f,
            "root",
            {bypassConstructor: false}
        ) as any;

        expect(ctorSpy).toHaveBeenCalled();
        expect(instance).toBeInstanceOf(Test);
    });

    /* ---------- precedence rules ---------- */

    it("field.instantiator overrides provided instantiator", () => {
        vi.mocked(shouldBypassConstructor).mockReturnValue(true);

        class Provided {
        }

        class FromField {
        }

        const f = field({
            instantiator: FromField
        });

        const instance = createInstance(
            {},
            Provided as any,
            f,
            "root"
        ) as any;

        expect(instance).toBeInstanceOf(FromField);
    });

    /* ---------- error collection with inference ---------- */

    it("returns instance and no errors when inference succeeds with collectErrors=true", () => {
        vi.mocked(shouldBypassConstructor).mockReturnValue(true);

        const f = field({
            instantiator: BypassCtor
        });

        const res = createInstance(
            {},
            null,
            f,
            "root",
            {collectErrors: true}
        ) as any;

        expect(res.errors).toHaveLength(0);
        expect(res.instance).toBeInstanceOf(BypassCtor);
    });

    /* ---------- sanity guards ---------- */

    it("fails if inferred instantiator produces null instance", () => {
        vi.mocked(shouldBypassConstructor).mockReturnValue(true);

        class Bad {
        }

        const f = field({
            instantiator: Bad
        });

        vi.spyOn(Object, "create").mockReturnValueOnce(null as any);

        expect(() =>
            createInstance({}, null, f, "root")
        ).toThrowError(RIFTError);
    });
});
