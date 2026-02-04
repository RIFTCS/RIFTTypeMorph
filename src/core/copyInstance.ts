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
    const { fields, expandoKey, includedKeys } = parseClass(instance);

    const base = serialiseInstance(instance);
    const merged: any = { ...base };

    for (const key of Object.keys(changes)) {
        // Disallow included (@Include) fields
        if (includedKeys.has(key)) {
            throw new RIFTError(
                `cloneWith: cannot modify included field: ${key}`,
                "cloneWith"
            );
        }

        // Disallow expando
        if (key === expandoKey) {
            throw new RIFTError(
                `cloneWith: cannot modify expando field: ${key}`,
                "cloneWith"
            );
        }

        // Disallow non-schema fields
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