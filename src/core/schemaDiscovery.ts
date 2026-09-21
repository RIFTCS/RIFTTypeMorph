import {TSField} from "./TSField";
import {TSType} from "./TSType";
import {RIFTError} from "../utils/errors";
import {MODERN_SCHEMA_FIELDS_METADATA} from "./metadataKeys";

export interface ParsedSchema {
    fields: Record<string, TSField>;
    expandoKey: string | null;
    includedKeys: Set<string>;
}

const parsedCache = new WeakSet<Function>();

export function ensureParsed(target: any) {
    if (!target) return;

    const ctor =
        typeof target === "function"
            ? target
            : target.constructor;

    if (!ctor || parsedCache.has(ctor)) return;

    parseClass(ctor);

    parsedCache.add(ctor);
}


function hasSchemaDecorators(instance: any): boolean {
    if (!instance || typeof instance !== "object") return false;

    let proto = Object.getPrototypeOf(instance);

    while (proto && proto !== Object.prototype) {
        if (
            proto.__schemaFields ||
            proto.__ignoredFields ||
            proto.__includedMethods
        ) {
            return true;
        }

        proto = Object.getPrototypeOf(proto);
    }

    return false;
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
export function parseClass(target: any): ParsedSchema {
    if (!target) {
        return {fields: {}, expandoKey: null, includedKeys: new Set<string>()};
    }

    const instance = typeof target === "function"
        ? Object.create(target.prototype)
        : target;
    const proto = typeof target === "function"
        ? target.prototype
        : Object.getPrototypeOf(target);
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
    // Modern decorators can expose metadata directly on the constructor when
    // Symbol.metadata is available, avoiding any need to instantiate the class.
    if (typeof target === "function") {
        const symbolMetadata = (Symbol as any).metadata;
        const metadata = symbolMetadata ? (target as any)[symbolMetadata] : undefined;
        const modernFields = metadata?.[MODERN_SCHEMA_FIELDS_METADATA] as Record<string, TSField> | undefined;

        if (modernFields) {
            for (const [key, field] of Object.entries(modernFields)) {
                if (!(field instanceof TSField)) continue;
                if (fields[key]) continue;

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
    }

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

    // Apply pending custom serializers (decorator ordering safety)
    let pendingCursor = proto;

    while (pendingCursor && pendingCursor !== Object.prototype) {

        const pending = pendingCursor.__pendingCustomSerialisers;

        if (pending) {
            for (const [key, meta] of Object.entries(pending)) {

                const field = fields[key];

                if (field && !field.customSerialiser) {
                    field.customSerialiser = meta as any;
                }

            }
        }

        pendingCursor = Object.getPrototypeOf(pendingCursor);
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
