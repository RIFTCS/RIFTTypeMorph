import {TSField} from "./TSField";
import {TSType} from "./TSType";
import {RIFTError} from "../utils/errors";

export interface ParsedSchema {
    fields: Record<string, TSField>;
    expandoKey: string | null;
    includedKeys: Set<string>;
}

function materializeSchemaSlot(proto: any, key: string, field: TSField) {
    if (Object.prototype.hasOwnProperty.call(proto, key)) return;

    Object.defineProperty(proto, key, {
        value: field,
        writable: true,
        configurable: true,
        enumerable: false
    });
}

/**
 * Normalizes legacy + decorator-based schemas into a single format.
 * This is the ONLY place where we inspect instance/prototype structure.
 */
export function parseClass(instance: any): ParsedSchema {
    const proto = Object.getPrototypeOf(instance);
    const fields: Record<string, TSField> = {};
    let expandoKey: string | null = null;

    // NEW: included (@Include) keys
    const includedKeys = new Set<string>();

    // 0. Collect @Include metadata (output-only fields)
    let cursor = proto;
    while (cursor && cursor !== Object.prototype) {
        if (cursor.__includedMethods instanceof Set) {
            for (const key of cursor.__includedMethods) {
                includedKeys.add(String(key));
            }
        }
        cursor = Object.getPrototypeOf(cursor);
    }

    // 1. Preferred: decorator metadata
    let decoCursor = proto;
    while (decoCursor && decoCursor !== Object.prototype) {
        if (decoCursor.__schemaFields) {
            for (const [key, field] of Object.entries(decoCursor.__schemaFields)) {
                if (!(field instanceof TSField)) continue;
                if (fields[key]) continue; // child overrides parent

                // ✅ materialize onto the declaring prototype
                materializeSchemaSlot(decoCursor, key, field);

                if (field.fieldType === TSType.Expando) {
                    if (expandoKey && expandoKey !== key) {
                        throw new RIFTError(
                            "Multiple expando properties were defined! There can be only one."
                        );
                    }
                    expandoKey = key;
                } else {
                    fields[key] = field;
                }
            }
        }

        decoCursor = Object.getPrototypeOf(decoCursor);
    }


    // 2. Legacy fallback: TSField directly on prototype or instance
    const legacySources = [proto, instance];
    for (const source of legacySources) {
        if (!source) continue;

        for (const key of Object.keys(source)) {
            const value = source[key];
            if (!(value instanceof TSField)) continue;
            if (fields[key]) continue; // decorator wins

            if (value.fieldType === TSType.Expando) {
                if (expandoKey) {
                    throw new RIFTError(
                        "Multiple expando properties were defined! There can be only one."
                    );
                }
                expandoKey = key;
            } else {
                fields[key] = value;
            }
        }
    }

    return {fields, expandoKey, includedKeys};
}
