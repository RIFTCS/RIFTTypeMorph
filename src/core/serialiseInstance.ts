import {TSType} from "./TSType";
import {RIFTError} from "../utils/errors";
import {TSField} from "./TSField";

type Constructor<T = any> = new (...args: any[]) => T;

export function serialiseInstance(
    instance: any,
    field: TSField | null = null,
    outerType: string = "root"
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

    // Collect instance + prototype keys (decorators supported)
    const allKeys = new Set<string>([
        ...Object.keys(objInstance),
        ...Object.keys(Object.getPrototypeOf(objInstance) ?? {})
    ]);

    let expandoKey: string | null = null;

    for (const key of allKeys) {
        let fieldDef =
            objInstance[key] ?? (Object.getPrototypeOf(objInstance) as any)?.[key];

        if (!(fieldDef instanceof TSField)) {
            const proto = Object.getPrototypeOf(objInstance);

            if (proto && proto[key] instanceof TSField) {
                fieldDef = proto[key];
            } else if (proto?.__schemaFields && proto.__schemaFields[key] instanceof TSField) {
                fieldDef = proto.__schemaFields[key];
            }
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
                    nestedContextBase
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
                        `${nestedContextBase}[${i}]`
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

    // Expando support
    if (expandoKey) {
        const expandoValue = objInstance[expandoKey];
        if (expandoValue && typeof expandoValue === "object") {
            for (const [k, v] of Object.entries(expandoValue)) {
                output[k] = v;
            }
        }
    }

    return output;
}
