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
): InstanceResult<T>;

export function createInstance<T = any>(
    data: any,
    instantiator: Instantiator<T> | null = null,
    field: TSField | null = null,
    outerType: string = "root",
    options?: CreateInstanceOptions
): T | InstanceResult<T> {
    const collectErrors = options?.collectErrors === true;
    const errors: RIFTError[] = [];

    const fail = (err: RIFTError) => {
        if (collectErrors) {
            errors.push(err);
            return;
        }
        throw err;
    };

    if (field && field.fieldType === TSType.Value) {
        fail(new RIFTError("createInstance called on a value type", outerType));
        return collectErrors ? {instance: null, errors} : null as any;
    }

    if (field?.instantiator) {
        instantiator = field.instantiator as Instantiator<T>;
    }

    if (!instantiator) {
        fail(new RIFTError("Missing instantiator", outerType));
        return collectErrors ? {instance: null, errors} : null as any;
    }

    if (data === null || data === undefined) {
        if (field?.required ?? true) {
            fail(new RIFTError("Field value was null but marked as required", outerType));
        }
        return collectErrors ? {instance: null, errors} : null as any;
    }

    let instance: any;

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
            instance = new ctor();
        }
    } else if (typeof instantiator === "function") {
        try {
            // @ts-ignore
            instance = instantiator(data);
        } catch (e: any) {
            fail(
                new RIFTError(
                    `Error during instantiation: ${e?.message ?? e}`,
                    outerType
                )
            );
            return collectErrors ? {instance: null, errors} : null as any;
        }
    } else {
        fail(new RIFTError("Invalid instantiator type", outerType));
        return collectErrors ? {instance: null, errors} : null as any;
    }

    // Guard: instantiator must return a concrete object instance
    if (instance === null || instance === undefined) {
        fail(new RIFTError("Instantiator returned null/undefined", outerType));
        return collectErrors ? {instance: null, errors} : null as any;
    }

    if (typeof instance !== "object") {
        fail(new RIFTError(`Invalid instantiator result type: ${typeof instance}`, outerType));
        return collectErrors ? {instance: null, errors} : null as any;
    }


    const {fields, expandoKey, includedKeys} = parseClass(instance);
    const consumedKeys = new Set<string>();

    for (const [key, fieldDef] of Object.entries(fields)) {
        consumedKeys.add(key);
        const rawValue = data[key];
        const nestedContext = `${outerType}.${key}`;

        if (rawValue === null && typeof fieldDef.ifEmpty === "function") {
            try {
                const res = createInstance(
                    fieldDef.ifEmpty(),
                    null,
                    fieldDef,
                    nestedContext,
                    options ?? {}
                ) as any;
                instance[key] = collectErrors ? res.instance : res;
                if (collectErrors && res.errors?.length) errors.push(...res.errors);
            } catch {
                fail(new RIFTError(`Error during ifEmpty instantiation for field: ${key}`, outerType));
                instance[key] = null;
            }
            continue;
        }

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


        if (rawValue === undefined) {
            // Default factory for value types
            if (
                fieldDef.fieldType === TSType.Value &&
                typeof fieldDef.instantiator === "function"
            ) {
                try {
                    instance[key] = (fieldDef.instantiator as () => any)();
                } catch (e: any) {
                    fail(
                        new RIFTError(
                            `Error during default factory for field: ${key}`,
                            outerType
                        )
                    );
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


        if (fieldDef.fieldType === TSType.Array) {
            if (!Array.isArray(rawValue)) {
                fail(new RIFTError(`Invalid type: expected array`, nestedContext));
                instance[key] = null;
                continue;
            }

            const arr = new Array(rawValue.length);

            for (let i = 0; i < rawValue.length; i++) {
                if (!(i in rawValue)) {
                    // preserve hole
                    arr[i] = undefined;
                    continue;
                }

                const res = createInstance(
                    rawValue[i],
                    null,
                    fieldDef,
                    `${nestedContext}[${i}]`,
                    options ?? {}
                ) as any;

                arr[i] = collectErrors ? res.instance : res;

                if (collectErrors && res.errors?.length) {
                    errors.push(...res.errors);
                }
            }

            instance[key] = arr;

            continue;
        }

        if (fieldDef.fieldType === TSType.Object) {
            const res = createInstance(
                rawValue,
                null,
                fieldDef,
                nestedContext,
                options ?? {}
            ) as any;
            instance[key] = collectErrors ? res.instance : res;
            if (collectErrors && res.errors?.length) errors.push(...res.errors);
            continue;
        }

        if (fieldDef.fieldType === TSType.Value) {
            instance[key] = rawValue;
            continue;
        }

        fail(new RIFTError(`Unknown field type: ${fieldDef.fieldType}`, outerType));
    }

    const extraKeys = Object.keys(data ?? {}).filter(k => {
        if (consumedKeys.has(k)) return false;

        // Silently ignore input values for @Include methods
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
