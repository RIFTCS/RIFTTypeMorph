import {TSType} from "./TSType";
import {RIFTError} from "../utils/errors";
import {TSField} from "./TSField";
import {shouldBypassConstructor} from "../decorators/rehydrateOptions";
import {parseClass} from "./schemaDiscovery";

type Constructor<T = any> = new (...args: any[]) => T;
type Instantiator<T = any> = ((obj: any) => T) | Constructor<T> | null;

export interface InstanceResult<T = any> {
    instance: T | null;
    errors: RIFTError[];
}

export interface CreateInstanceOptions {
    collectErrors?: boolean;
    bypassConstructor?: boolean;
    errorForExtraProps?: boolean;
    errorForNullRequired?: boolean;
    dontReplaceNullWithIfEmpty?: boolean;
}

function inferInstantiatorFromField<T>(
    field: TSField | null
): Constructor<T> | null {
    if (!field?.instantiator) return null;

    const inst = field.instantiator as any;

    if (typeof inst === "function" && inst.prototype) {
        return inst as Constructor<T>;
    }

    return null;
}

export function createInstance<T = any>(
    data: any,
    instantiator?: Instantiator<T> | null,
    field?: TSField | null,
    outerType?: string
): T;

export function createInstance<T = any>(
    data: any,
    instantiator: Instantiator<T> | null,
    field: TSField | null,
    outerType: string,
    options: CreateInstanceOptions
): T | InstanceResult<T>;

export function createInstance<T = any>(
    data: any,
    instantiator: Instantiator<T> | null = null,
    field: TSField | null = null,
    outerType: string = "root",
    options?: CreateInstanceOptions
): T | InstanceResult<T> {

    const dontReplaceNull =
        options?.dontReplaceNullWithIfEmpty === true;

    const isNull = (v: any) => v === null;
    const isUndefined = (v: any) => v === undefined;
    const isEmpty = (v: any) =>
        isUndefined(v) || (isNull(v) && !dontReplaceNull);

    const collectErrors = options?.collectErrors === true;
    const errors: RIFTError[] = [];

    const fail = (err: RIFTError) => {
        if (collectErrors) {
            errors.push(err);
            return;
        }
        throw err;
    };

    // ---- Guard: value fields cannot be hydrated via createInstance
    if (field && field.fieldType === TSType.Value) {
        fail(new RIFTError("createInstance called on a value type", outerType));
        return collectErrors ? {instance: null, errors} : null as any;
    }

    // ---- Field-level instantiator override
    if (field?.instantiator) {
        instantiator = field.instantiator as Instantiator<T>;
    }

    // ---- Resolve instantiator (explicit or inferred)
    if (!instantiator) {
        const inferred = inferInstantiatorFromField<T>(field);

        if (
            inferred &&
            (
                options?.bypassConstructor === true ||
                (options?.bypassConstructor === undefined &&
                    shouldBypassConstructor(inferred))
            )
        ) {
            instantiator = inferred;
        } else {
            fail(new RIFTError("Missing instantiator", outerType));
            return collectErrors ? {instance: null, errors} : null as any;
        }
    }

    // ---- Top-level null/undefined guard
    if (data === null || data === undefined) {
        if (field?.required ?? true) {
            fail(new RIFTError("Field value was null but marked as required", outerType));
        }
        return collectErrors ? {instance: null, errors} : null as any;
    }

    let instance: any;

    // ---- Constructor / factory instantiation
    if (typeof instantiator === "function" && (instantiator as any).prototype) {
        const ctor = instantiator as Constructor<T>;
        const ctorAny = ctor as any;

        if (typeof ctorAny.deserialise === "function") {
            try {
                instance = ctorAny.deserialise(data);
                return collectErrors ? {instance, errors} : instance;
            } catch (e: any) {
                fail(new RIFTError(`Error during deserialise(): ${e?.message ?? e}`, outerType));
                return collectErrors ? {instance: null, errors} : null as any;
            }
        }

        if (
            (options?.bypassConstructor === undefined && shouldBypassConstructor(ctor)) ||
            options?.bypassConstructor
        ) {
            instance = Object.create(ctor.prototype);
        } else {
            if (ctor.length > 0) {
                fail(new RIFTError(
                    `Constructor for ${ctor.name || "anonymous class"} requires arguments and cannot be safely called during hydration. ` +
                    `Consider using @BypassConstructor() or options.bypassConstructor to avoid invoking the constructor.`,
                    outerType
                ));
                return collectErrors ? {instance: null, errors} : null as any;
            }

            try {
                instance = new ctor();
            } catch (e: any) {
                fail(new RIFTError(
                    `Error during construction of ${ctor.name || "anonymous class"}: ${e?.message ?? e}`,
                    outerType
                ));
                return collectErrors ? {instance: null, errors} : null as any;
            }
        }

    } else if (typeof instantiator === "function") {
        try {
            // @ts-ignore
            instance = instantiator(data);
        } catch (e: any) {
            fail(new RIFTError(
                `Error during instantiation: ${e?.message ?? e}`,
                outerType
            ));
            return collectErrors ? {instance: null, errors} : null as any;
        }
    } else {
        fail(new RIFTError("Invalid instantiator type", outerType));
        return collectErrors ? {instance: null, errors} : null as any;
    }

    // ---- Guard: instantiator result validity
    if (instance === null || instance === undefined) {
        fail(new RIFTError("Instantiator returned null/undefined", outerType));
        return collectErrors ? {instance: null, errors} : null as any;
    }

    if (typeof instance !== "object") {
        fail(new RIFTError(`Invalid instantiator result type: ${typeof instance}`, outerType));
        return collectErrors ? {instance: null, errors} : null as any;
    }

    // ---- Schema walk
    const {fields, expandoKey, includedKeys} = parseClass(instance);
    const consumedKeys = new Set<string>();

    for (const [key, fieldDef] of Object.entries(fields)) {
        consumedKeys.add(key);

        const rawValue = data[key];
        const nestedContext = `${outerType}.${key}`;

        // ---- Unified empty handling (undefined + optional null)
        if (isEmpty(rawValue)) {
            if (typeof fieldDef.ifEmpty === "function") {
                try {
                    if (fieldDef.fieldType === TSType.Value) {
                        instance[key] = fieldDef.ifEmpty();
                    } else {
                        const res = createInstance(
                            fieldDef.ifEmpty(),
                            null,
                            fieldDef,
                            nestedContext,
                            options ?? {}
                        ) as any;

                        instance[key] = collectErrors ? res.instance : res;
                        if (collectErrors && res.errors?.length) {
                            errors.push(...res.errors);
                        }
                    }
                } catch (e: any) {
                    fail(new RIFTError(
                        `Error during ifEmpty instantiation for field: ${key}: ${e?.message ?? e}`,
                        nestedContext
                    ));
                    instance[key] = null;
                }
                continue;
            }

            if (fieldDef.required) {
                fail(new RIFTError(`Missing required property: ${key}`, outerType));
            }

            instance[key] = null;
            continue;
        }

        // ---- Explicit null handling (when preserved)
        if (
            rawValue === null &&
            fieldDef.required &&
            options?.errorForNullRequired === true &&
            typeof fieldDef.ifEmpty !== "function"
        ) {
            fail(new RIFTError(
                `Field value was null but marked as required`,
                nestedContext
            ));
            instance[key] = null;
            continue;
        }

        // ---- Array
        if (fieldDef.fieldType === TSType.Array) {
            if (!Array.isArray(rawValue)) {
                fail(new RIFTError(`Invalid type: expected array`, nestedContext));
                instance[key] = null;
                continue;
            }

            const arr = new Array(rawValue.length);

            for (let i = 0; i < rawValue.length; i++) {
                if (!(i in rawValue)) {
                    arr[i] = undefined;
                    continue;
                }

                const elementField = new TSField(
                    fieldDef.fieldType ?? TSType.Object,
                    fieldDef.instantiator ?? null,
                    fieldDef.required
                );

                const res = createInstance(
                    rawValue[i],
                    null,
                    elementField,
                    `${nestedContext}[${i}]`,
                    options ?? {}
                );


                arr[i] = collectErrors ? res.instance : res;

                if (collectErrors && res.errors?.length) {
                    errors.push(...res.errors);
                }
            }

            instance[key] = arr;
            continue;
        }

        // ---- Object
        if (fieldDef.fieldType === TSType.Object) {
            const res = createInstance(
                rawValue,
                null,
                fieldDef,
                nestedContext,
                options ?? {}
            ) as any;

            instance[key] = collectErrors ? res.instance : res;
            if (collectErrors && res.errors?.length) {
                errors.push(...res.errors);
            }
            continue;
        }

        // ---- Value
        if (fieldDef.fieldType === TSType.Value) {
            const inst = fieldDef.instantiator as any;

            try {
                if (typeof inst === "function" && inst.prototype) {
                    // Constructor coercion (Date, BigInt, etc.)
                    instance[key] = new inst(rawValue);
                } else if (typeof inst === "function") {
                    // Functional coercion
                    instance[key] = inst(rawValue);
                } else {
                    // Plain assignment
                    instance[key] = rawValue;
                }
            } catch (e: any) {
                fail(new RIFTError(
                    `Error during value instantiation for field: ${key}: ${e?.message ?? e}`,
                    nestedContext
                ));
                instance[key] = null;
            }

            continue;
        }


        fail(new RIFTError(`Unknown field type: ${fieldDef.fieldType}`, outerType));
    }

    // ---- Extra props / expando
    const extraKeys = Object.keys(data ?? {}).filter(k => {
        if (consumedKeys.has(k)) return false;
        return !(includedKeys && includedKeys.has(k));
    });

    if (expandoKey) {
        Object.defineProperty(instance, expandoKey, {
            value:
                extraKeys.length === 0
                    ? {}
                    : Object.fromEntries(extraKeys.map(k => [k, data[k]])),
            writable: true,
            enumerable: true,
            configurable: true
        });
    } else if (options?.errorForExtraProps && extraKeys.length) {
        fail(new RIFTError(`Unexpected properties: ${extraKeys.join(", ")}`, outerType));
    }

    return collectErrors ? {instance, errors} : instance;
}

