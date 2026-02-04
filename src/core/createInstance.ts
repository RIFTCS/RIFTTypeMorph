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
        // @ts-ignore
        instance = instantiator(data);
    } else {
        fail(new RIFTError("Invalid instantiator type", outerType));
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
                    {collectErrors: collectErrors}
                ) as any;
                instance[key] = collectErrors ? res.instance : res;
                if (collectErrors && res.errors?.length) errors.push(...res.errors);
            } catch {
                fail(new RIFTError(`Error during ifEmpty instantiation for field: ${key}`, outerType));
                instance[key] = null;
            }
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

            const arr: any[] = [];
            rawValue.forEach((v, i) => {
                const res = createInstance(
                    v,
                    null,
                    fieldDef,
                    `${nestedContext}[${i}]`,
                    {collectErrors: collectErrors}
                ) as any;
                arr.push(collectErrors ? res.instance : res);
                if (collectErrors && res.errors?.length) errors.push(...res.errors);
            });
            instance[key] = arr;
            continue;
        }

        if (fieldDef.fieldType === TSType.Object) {
            const res = createInstance(
                rawValue,
                null,
                fieldDef,
                nestedContext,
                {collectErrors: collectErrors}
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
