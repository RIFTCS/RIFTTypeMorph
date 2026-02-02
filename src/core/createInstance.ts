import {TSType} from "./TSType";
import {RIFTError} from "../utils/errors";
import {TSField} from "./TSField";
import {shouldBypassConstructor} from "./RehydrateOptions";

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

// Overloads for backwards-compatibility:
// 1) Default: returns the instance (throws on first error)
export function createInstance<T = any>(
    data: any,
    instantiator?: Instantiator<T> | null,
    field?: TSField | null,
    outerType?: string
): T;

// 2) With options.collectErrors = true: returns { instance, errors }
export function createInstance<T = any>(
    data: any,
    instantiator: Instantiator<T> | null,
    field: TSField | null,
    outerType: string,
    options: { collectErrors: true | false }
): InstanceResult<T>;


// Implementation
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
            // In collectErrors mode, we'll return a result object at the end.
            return;
        }
        throw err;
    };

    // Guards
    if (field != null && field.fieldType === TSType.Value) {
        fail(new RIFTError("createInstance called on a value type", outerType));
        if (collectErrors) return {instance: null, errors} as InstanceResult<T>;
    }

    if (field != null && field.instantiator) {
        instantiator = field.instantiator as Instantiator<T>;
    }

    if (instantiator == null && field == null) {
        fail(new RIFTError("Must specify either a field or an instantiator", outerType));
        if (collectErrors) return {instance: null, errors} as InstanceResult<T>;
    }

    if (instantiator == null) {
        fail(new RIFTError("Missing instantiator", outerType));
        if (collectErrors) return {instance: null, errors} as InstanceResult<T>;
    }

    // Null/undefined handling
    if (data === null || data === undefined) {
        if (field?.required ?? true) {
            fail(new RIFTError("Field value was null but marked as required", outerType));
            if (collectErrors) return {instance: null, errors} as InstanceResult<T>;
        }
        return collectErrors ? ({instance: null, errors} as InstanceResult<T>) : (null as any as T);
    }

    // Instantiate
    let instance: any = null;
    if (instantiator) {
        if (typeof instantiator === "function" && (instantiator as any).prototype) {
            const ctor = instantiator as Constructor<T>;

            if ((options?.bypassConstructor == undefined && shouldBypassConstructor(ctor)) || options?.bypassConstructor) {
                // Prototype-only instantiation
                instance = Object.create(ctor.prototype);
            } else {
                // Safe no-arg constructor
                instance = new ctor();
            }
        } else if (typeof instantiator === "function") {
            instance = (instantiator as (obj: any) => T)(data);
        } else {
            fail(new RIFTError("Invalid instantiator type", outerType));
            if (collectErrors) return {instance: null, errors} as InstanceResult<T>;
        }
    }

    const objInstance: any = instance as object;

    // Collect instance and prototype keys (supports decorators)
    const allKeys = new Set<string>([
        ...Object.keys(objInstance),
        ...Object.keys(Object.getPrototypeOf(objInstance) ?? {})
    ]);

    const consumedKeys = new Set<string>();
    let expandoKey: string | null = null;

    for (const key of allKeys) {
        let fieldDef =
            (objInstance as any)[key] ?? (Object.getPrototypeOf(objInstance) as any)[key];

        if (fieldDef.fieldType === TSType.Expando) {
            if (expandoKey) {
                fail(new RIFTError(`Multiple expando properties were defined! There can be only one.`));
                continue;
            }
            expandoKey = key;
            continue;
        } else {
            consumedKeys.add(key);
        }

        // If the property is not a TSField, check prototype and decorator metadata
        if (!(fieldDef instanceof TSField)) {
            const proto = Object.getPrototypeOf(objInstance);

            // 1 Check the prototype directly (legacy pattern)
            if (proto && proto[key] instanceof TSField) {
                fieldDef = proto[key];
            }

            // 2 Check decorator metadata map (modern @Field)
            else if (proto?.__schemaFields && proto.__schemaFields[key] instanceof TSField) {
                fieldDef = proto.__schemaFields[key];
            }
        }

        if (!(fieldDef instanceof TSField)) {
            fail(new RIFTError(`Field was not configured properly: ${key}`, outerType));
            // If collecting errors, keep going, otherwise thrown already.
            continue;
        }

        const rawValue = (data as any)[key];

        // Missing property
        if (rawValue === undefined) {
            // VALUE fields may have defaults
            if (
                fieldDef.fieldType === TSType.Value &&
                typeof fieldDef.instantiator === "function"
            ) {
                (objInstance as any)[key] = (fieldDef.instantiator as () => any)();
                continue;
            }

            // OBJECT fields: missing means null (never auto-create)
            if (fieldDef.fieldType === TSType.Object) {
                if (fieldDef.required) {
                    fail(new RIFTError(`Missing required property: ${key}`, outerType));
                }
                (objInstance as any)[key] = null;
                continue;
            }

            // Required value with no default
            if (fieldDef.required) {
                fail(new RIFTError(`Missing required property: ${key}`, outerType));
                (objInstance as any)[key] = null;
                continue;
            }

            // Optional value with no default
            (objInstance as any)[key] = null;
            continue;
        }

        // Type-specific handling with nested error capture
        const nestedContextBase = `${outerType}.${key}`;

        if (fieldDef.fieldType === TSType.Array) {
            if (!Array.isArray(rawValue)) {
                fail(new RIFTError(`Invalid type: expected array, got ${typeof rawValue}`, nestedContextBase));
                (objInstance as any)[key] = null;
                continue;
            }

            const array: any[] = [];
            for (let i = 0; i < rawValue.length; ++i) {
                const elementValue = rawValue[i];
                if (collectErrors) {
                    const res = createInstance(
                        elementValue,
                        null,
                        fieldDef,
                        `${nestedContextBase}[${i}]`,
                        {collectErrors: true}
                    ) as InstanceResult<any>;
                    array.push(res.instance);
                    if (res.errors.length) errors.push(...res.errors);
                } else {
                    const elementInstance = createInstance(
                        elementValue,
                        null,
                        fieldDef,
                        `${nestedContextBase}[${i}]`
                    ) as any;
                    array.push(elementInstance);
                }
            }
            (objInstance as any)[key] = array;
            continue;
        }

        if (fieldDef.fieldType === TSType.Object) {
            if (collectErrors) {
                const res = createInstance(
                    rawValue,
                    null,
                    fieldDef,
                    nestedContextBase,
                    {collectErrors: true}
                ) as InstanceResult<any>;
                (objInstance as any)[key] = res.instance;
                if (res.errors.length) errors.push(...res.errors);
            } else {
                (objInstance as any)[key] = createInstance(
                    rawValue,
                    null,
                    fieldDef,
                    nestedContextBase
                ) as any;
            }
            continue;
        }

        if (fieldDef.fieldType === TSType.Value) {
            (objInstance as any)[key] = rawValue;
            continue;
        }

        // Unknown field type
        fail(new RIFTError(`Unknown field type: ${fieldDef.fieldType}`, outerType));
    }

    if (collectErrors) {
        return {instance, errors} as InstanceResult<T>;
    }

    const extraKeys = Object.keys(data ?? {}).filter(
        (k) => !consumedKeys.has(k)
    );

    const extraValues = extraKeys.length == 0 ? undefined : extraKeys.reduce((acc, k) => {
        acc[k] = (data as any)[k];
        return acc;
    }, {} as Record<string, any>);

    if (expandoKey) {
        console.debug("[createInstance] extra properties:", {
            outerType,
            keys: extraKeys,
            values: extraValues
        });

        (objInstance as any)[expandoKey] = extraValues;
    }

    return instance as T;
}
