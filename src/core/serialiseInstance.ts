import {TSType} from "./TSType";
import {RIFTError} from "../utils/errors";
import {TSField} from "./TSField";

type Constructor<T = any> = new (...args: any[]) => T;

export interface SerialiseInstanceOptions {
    errorForExtraProps?: boolean;
}

export function serialiseInstance(
    instance: any,
    field: TSField | null = null,
    outerType: string = "root",
    config?: SerialiseInstanceOptions
): any {
    if (instance === null || instance === undefined) {
        return null;
    }

    // Prefer static serialise(obj) if present
    const ctor: Constructor | undefined = instance?.constructor;
    const ctorAny = ctor as any;

    if (ctorAny && typeof ctorAny.serialise === "function") {
        try {
            return ctorAny.serialise(instance);
        } catch (e: any) {
            throw new RIFTError(
                `Error during serialise(): ${e?.message ?? e}`,
                outerType
            );
        }
    }

    const objInstance: any = instance as object;
    const output: Record<string, any> = {};

    const proto = Object.getPrototypeOf(objInstance);

    const schemaFields: Record<string, TSField> =
        proto?.__schemaFields ?? {};

    const ignoredFields: Set<string> =
        proto?.__ignoredFields ?? new Set<string>();

    const includedMethods: Set<string> =
        proto?.__includedMethods ?? new Set<string>();

    // Collect own enumerable props only for extra-prop detection
    const ownKeys = Object.keys(objInstance);

    let expandoKey: string | null = null;

    // --- Schema traversal ---
    for (const [key, fieldDef] of Object.entries(schemaFields)) {
        if (ignoredFields.has(key)) {
            continue;
        }

        if (!(fieldDef instanceof TSField)) {
            continue;
        }

        if (fieldDef.fieldType === TSType.Expando) {
            expandoKey = key;
            continue;
        }

        const value = objInstance[key];
        const nestedContextBase = `${outerType}.${key}`;

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
                output[key] = value;
                break;

            case TSType.Object:
                output[key] = serialiseInstance(
                    value,
                    fieldDef,
                    nestedContextBase,
                    config
                );
                break;

            case TSType.Array:
                if (!Array.isArray(value)) {
                    throw new RIFTError(
                        `Invalid type: expected array, got ${typeof value}`,
                        nestedContextBase
                    );
                }

                output[key] = value.map((el, i) =>
                    serialiseInstance(
                        el,
                        fieldDef,
                        `${nestedContextBase}[${i}]`,
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

    // --- Included method support ---
    for (const methodName of includedMethods) {
        if (ignoredFields.has(methodName)) {
            continue;
        }

        const fn = objInstance[methodName];

        if (typeof fn !== "function") {
            continue;
        }

        try {
            output[methodName] = fn.call(objInstance);
        } catch (e: any) {
            throw new RIFTError(
                `Error during @Include method execution: ${methodName}: ${e?.message ?? e}`,
                outerType
            );
        }
    }


    // --- Expando support ---
    if (expandoKey) {
        const expandoValue = objInstance[expandoKey];
        if (expandoValue && typeof expandoValue === "object") {
            for (const [k, v] of Object.entries(expandoValue)) {
                output[k] = v;
            }
        }
    }

    // --- Extra property detection ---
    if (config?.errorForExtraProps) {
        for (const key of ownKeys) {
            if (ignoredFields.has(key)) {
                continue;
            }

            if (schemaFields[key] || includedMethods.has(key)) {
                continue;
            }

            if (expandoKey) {
                const expandoValue = objInstance[expandoKey];
                if (
                    expandoValue &&
                    typeof expandoValue === "object" &&
                    key in expandoValue
                ) {
                    continue;
                }
            }

            throw new RIFTError(
                `Unexpected extra property during serialisation: ${key}`,
                outerType
            );
        }
    }

    return output;
}
