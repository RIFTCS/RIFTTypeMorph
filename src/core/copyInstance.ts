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

export function cloneWith<T>(
    instance: T,
    changes: Partial<T>
): T {
    if (instance === null || instance === undefined) {
        return instance as T;
    }

    const ctor = (instance as any).constructor;

    // Discover schema from the real instance
    const {fields, expandoKey, includedKeys} = parseClass(instance);

    // Full, schema-driven snapshot (includes expando)
    const base = serialiseInstance(instance);

    const ctorAny = ctor as any;
    const hasCustomSerialise = typeof ctorAny.serialise === "function";

    let merged: any;

    if (hasCustomSerialise && Object.keys(changes).length > 0) {
        // ---- Apply schema changes at the instance level
        const interim = duplicateInstance(instance);

        for (const key of Object.keys(changes)) {
            if (includedKeys.has(key)) {
                throw new RIFTError(
                    `cloneWith: cannot modify included field: ${key}`,
                    "cloneWith"
                );
            }

            if (key === expandoKey) {
                throw new RIFTError(
                    `cloneWith: cannot modify expando field: ${key}`,
                    "cloneWith"
                );
            }

            if (!fields[key]) {
                throw new RIFTError(
                    `cloneWith: cannot modify non-schema field: ${key}`,
                    "cloneWith"
                );
            }

            (interim as any)[key] = (changes as any)[key];
        }

        // Re-serialise from updated instance
        merged = serialiseInstance(interim);

    } else if (hasCustomSerialise) {
        // No changes → opaque round-trip
        merged = {...base};

    } else {
        // Schema-driven path (no custom serialise)
        merged = {};

        for (const key of Object.keys(fields)) {
            if (key in base) {
                merged[key] = base[key];
            }
        }

        if (expandoKey && base[expandoKey] !== undefined) {
            merged[expandoKey] = base[expandoKey];
        }

        // Apply schema changes directly
        for (const key of Object.keys(changes)) {
            if (includedKeys.has(key)) {
                throw new RIFTError(
                    `cloneWith: cannot modify included field: ${key}`,
                    "cloneWith"
                );
            }

            if (key === expandoKey) {
                throw new RIFTError(
                    `cloneWith: cannot modify expando field: ${key}`,
                    "cloneWith"
                );
            }

            if (!fields[key]) {
                throw new RIFTError(
                    `cloneWith: cannot modify non-schema field: ${key}`,
                    "cloneWith"
                );
            }

            merged[key] = (changes as any)[key];
        }
    }


    // ---- Preserve expando wholesale (read-only)
    if (expandoKey && base[expandoKey] !== undefined) {
        merged[expandoKey] = base[expandoKey];
    }

    // ---- Apply validated changes
    for (const key of Object.keys(changes)) {
        if (includedKeys.has(key)) {
            throw new RIFTError(
                `cloneWith: cannot modify included field: ${key}`,
                "cloneWith"
            );
        }

        if (key === expandoKey) {
            throw new RIFTError(
                `cloneWith: cannot modify expando field: ${key}`,
                "cloneWith"
            );
        }

        if (!fields[key]) {
            throw new RIFTError(
                `cloneWith: cannot modify non-schema field: ${key}`,
                "cloneWith"
            );
        }

        merged[key] = (changes as any)[key];
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
