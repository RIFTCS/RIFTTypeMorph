import {createInstance, CreateInstanceOptions} from "./createInstance";
import {serialiseInstance} from "./serialiseInstance";
import {RIFTError} from "../utils/errors";
import {parseClass} from "./schemaDiscovery";

export function duplicateInstance<T>(
    instance: T,
    options?: CreateInstanceOptions
): T {
    if (instance === null || instance === undefined) {
        return instance as T;
    }

    const ctor = (instance as any).constructor;

    return createInstance(
        serialiseInstance(instance),
        ctor,
        null,
        "duplicate",
        options ?? {}
    ) as T;
}

export interface CloneWithOptions {
    removeNullsFromExpando?: boolean;
}


export function cloneWith<T>(
    instance: T,
    changes: Partial<T>,
    options: { removeNullsFromExpando?: boolean } = {}
): T {
    if (instance === null || instance === undefined) {
        return instance as T;
    }

    const { removeNullsFromExpando = true } = options;

    const ctor = (instance as any).constructor;

    // Discover schema from the real instance
    const { fields, expandoKey, includedKeys } = parseClass(instance);

    // Full snapshot of the original instance
    const base = serialiseInstance(instance);

    const ctorAny = ctor as any;
    const hasCustomSerialise = typeof ctorAny.serialise === "function";

    // ---- Split changes into schema vs expando
    const schemaChanges: Record<string, any> = {};
    let expandoChanges: Record<string, any> | null = null;

    for (const key of Object.keys(changes)) {
        if (includedKeys.has(key)) {
            throw new RIFTError(
                `cloneWith: cannot modify included field: ${key}`,
                "cloneWith"
            );
        }

        if (key === expandoKey) {
            const value = (changes as any)[key];

            if (
                value === null ||
                value === undefined ||
                typeof value !== "object" ||
                Array.isArray(value)
            ) {
                throw new RIFTError(
                    `cloneWith: expando updates must be a plain object`,
                    "cloneWith"
                );
            }

            expandoChanges = value as Record<string, any>;
            continue;
        }

        if (!fields[key]) {
            throw new RIFTError(
                `cloneWith: cannot modify non-schema field: ${key}`,
                "cloneWith"
            );
        }

        schemaChanges[key] = (changes as any)[key];
    }

    let merged: any;

    // ---- Apply schema changes
    if (hasCustomSerialise && Object.keys(schemaChanges).length > 0) {
        const interim = duplicateInstance(instance);

        for (const [key, value] of Object.entries(schemaChanges)) {
            (interim as any)[key] = value;
        }

        merged = serialiseInstance(interim);
    } else if (hasCustomSerialise) {
        merged = { ...base };
    } else {
        merged = {};

        for (const key of Object.keys(fields)) {
            if (key in base) {
                merged[key] = base[key];
            }
        }

        if (expandoKey && base[expandoKey] !== undefined) {
            merged[expandoKey] = base[expandoKey];
        }

        for (const [key, value] of Object.entries(schemaChanges)) {
            merged[key] = value;
        }
    }

    // ---- Merge expando (merge-only, null-aware semantics)
    if (expandoKey) {
        const baseExpando =
            base[expandoKey] && typeof base[expandoKey] === "object"
                ? base[expandoKey]
                : {};

        if (expandoChanges) {
            const nextExpando: Record<string, any> = { ...baseExpando };

            for (const [k, v] of Object.entries(expandoChanges)) {
                if (v === null && removeNullsFromExpando) {
                    delete nextExpando[k];
                } else {
                    nextExpando[k] = v;
                }
            }

            merged[expandoKey] = nextExpando;
        } else if (base[expandoKey] !== undefined) {
            merged[expandoKey] = base[expandoKey];
        }
    }

    return createInstance(
        merged,
        ctor,
        null,
        "cloneWith",
        {
            errorForNullRequired: true
        }
    ) as T;
}

