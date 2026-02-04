import { TSType } from "./TSType";
import { RIFTError } from "../utils/errors";
import { TSField } from "./TSField";
import { parseClass } from "./schemaDiscovery";

type Constructor<T = any> = new (...args: any[]) => T;

export interface SerialiseInstanceOptions {
    errorForExtraProps?: boolean;
    flattenExpando?: boolean;
}

function findPropertyDescriptor(
    obj: any,
    key: string
): PropertyDescriptor | undefined {
    let current = obj;

    while (current && current !== Object.prototype) {
        const desc = Object.getOwnPropertyDescriptor(current, key);
        if (desc) return desc;
        current = Object.getPrototypeOf(current);
    }

    return undefined;
}

// ---------- PUBLIC API ----------
export function serialiseInstance(instance: any): any;
export function serialiseInstance(
    instance: any,
    config: SerialiseInstanceOptions
): any;

// ---------- INTERNAL / RECURSIVE ----------
export function serialiseInstance(
    instance: any,
    field: TSField | null,
    outerType: string,
    config?: SerialiseInstanceOptions
): any;

export function serialiseInstance(
    instance: any,
    fieldOrConfig: TSField | SerialiseInstanceOptions | null = null,
    outerType: string = "root",
    configMaybe?: SerialiseInstanceOptions
): any {
    let field: TSField | null = null;
    let config: SerialiseInstanceOptions | undefined;

    if (fieldOrConfig instanceof TSField || fieldOrConfig === null) {
        field = fieldOrConfig;
        config = configMaybe;
    } else {
        field = null;
        config = fieldOrConfig;
    }

    if (instance === null || instance === undefined) {
        return null;
    }

    // ---- Helper: ensure plain data only
    const serialiseValue = (value: any, ctx: string): any => {
        if (value === null || value === undefined) return null;

        if (value instanceof Date) {
            return value.toISOString();
        }

        const t = typeof value;
        if (t === "string" || t === "number" || t === "boolean") {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map((v, i) =>
                serialiseValue(v, `${ctx}[${i}]`)
            );
        }

        if (t === "object") {
            const out: any = {};
            for (const [k, v] of Object.entries(value)) {
                out[k] = serialiseValue(v, `${ctx}.${k}`);
            }
            return out;
        }

        throw new RIFTError(
            `Unsupported value type during serialisation: ${t}`,
            ctx
        );
    };

    // ---- Prefer static serialise(obj) if present
    const ctor: Constructor | undefined = instance?.constructor;
    const ctorAny = ctor as any;

    if (ctorAny && typeof ctorAny.serialise === "function") {
        try {
            return serialiseValue(
                ctorAny.serialise(instance),
                outerType
            );
        } catch (e: any) {
            throw new RIFTError(
                `Error during serialise(): ${e?.message ?? e}`,
                outerType
            );
        }
    }

    const objInstance: any = instance;
    const output: Record<string, any> = {};

    // ---- Schema discovery (single source of truth)
    const {
        fields: schemaFields,
        expandoKey,
        includedKeys
    } = parseClass(objInstance);

    const proto = Object.getPrototypeOf(objInstance);
    const ignoredFields: Set<string> =
        proto?.__ignoredFields ?? new Set<string>();

    const ownKeys = Object.keys(objInstance);

    // ---- Schema traversal
    for (const [key, fieldDef] of Object.entries(schemaFields)) {
        if (ignoredFields.has(key)) continue;

        const value = objInstance[key];
        const ctx = `${outerType}.${key}`;

        if (value === undefined || value === null) {
            if (fieldDef.required) {
                throw new RIFTError(
                    `Required field was null during serialisation: ${key}`,
                    outerType
                );
            }
            output[key] = null;
            continue;
        }

        switch (fieldDef.fieldType) {
            case TSType.Value:
                output[key] = serialiseValue(value, ctx);
                break;

            case TSType.Object:
                output[key] = serialiseInstance(
                    value,
                    fieldDef,
                    ctx,
                    config
                );
                break;

            case TSType.Array:
                if (!Array.isArray(value)) {
                    throw new RIFTError(
                        `Invalid type: expected array, got ${typeof value}`,
                        ctx
                    );
                }

                output[key] = value.map((el, i) =>
                    serialiseInstance(
                        el,
                        fieldDef,
                        `${ctx}[${i}]`,
                        config
                    )
                );
                break;

            default:
                throw new RIFTError(
                    `Unknown field type: ${fieldDef.fieldType}`,
                    outerType
                );
        }
    }

    // ---- Included methods / getters
    for (const key of includedKeys) {
        if (ignoredFields.has(key)) continue;
        if (schemaFields[key]) continue;
        if (key === expandoKey) continue;

        const desc = findPropertyDescriptor(objInstance, key);
        if (!desc) continue;

        try {
            let value: any;

            if (typeof desc.get === "function") {
                value = objInstance[key];
            } else if (typeof desc.value === "function") {
                value = desc.value.call(objInstance);
            } else {
                continue;
            }

            output[key] = serialiseValue(
                value,
                `${outerType}.${key}`
            );
        } catch (e: any) {
            throw new RIFTError(
                `Error during @Include execution: ${key}: ${e?.message ?? e}`,
                outerType
            );
        }
    }

    // ---- Expando
    if (expandoKey) {
        const expandoValue = objInstance[expandoKey];

        if (expandoValue && typeof expandoValue === "object") {
            if (config?.flattenExpando === true) {
                for (const [k, v] of Object.entries(expandoValue)) {
                    output[k] = serialiseValue(
                        v,
                        `${outerType}.${k}`
                    );
                }
            } else {
                output[expandoKey] = serialiseValue(
                    expandoValue,
                    `${outerType}.${expandoKey}`
                );
            }
        }
    }

    // ---- Extra property detection
    if (config?.errorForExtraProps) {
        for (const key of ownKeys) {
            if (ignoredFields.has(key)) continue;
            if (schemaFields[key]) continue;
            if (includedKeys.has(key)) continue;
            if (key === expandoKey) continue;

            throw new RIFTError(
                `Unexpected extra property during serialisation: ${key}`,
                outerType
            );
        }
    }

    return output;
}
