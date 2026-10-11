import {createInstance, CreateInstanceOptions} from "./createInstance";
import {serialiseInstance} from "./serialiseInstance";
import {RIFTError} from "../utils/errors";
import {parseClass} from "./schemaDiscovery";
import {getIgnoredFields} from "../decorators/schemaDecorator";
import {CustomSerialiserUsage, usesCustomSerialiser} from "../decorators/customSerialiser";
import {TSType} from "./TSType";

function applyIgnoredPassthrough(source: any, target: any): void {
    if (!source || !target) return;

    if (typeof source !== "object" || typeof target !== "object") {
        return;
    }

    const ignored = getIgnoredFields(source);

    for (const [key, meta] of ignored) {
        if (meta.passThroughOnClone) {
            target[key] = source[key];
        }
    }

    for (const key of Object.keys(source)) {
        const s = source[key];
        const t = target[key];

        if (!s || !t) continue;

        if (Array.isArray(s) && Array.isArray(t)) {
            for (let i = 0; i < s.length; i++) {
                applyIgnoredPassthrough(s[i], t[i]);
            }
        } else if (typeof s === "object" && typeof t === "object") {
            applyIgnoredPassthrough(s, t);
        }
    }
}

function duplicateForUsage<T>(
    instance: T,
    usage: CustomSerialiserUsage,
    options?: CreateInstanceOptions
): T {

    if (instance === null || instance === undefined) {
        return instance as T;
    }

    const ctor = (instance as any).constructor;

    const cloned = createInstance(
        serialiseInstance(instance, {customSerialiserUsage: usage}),
        ctor,
        null,
        "duplicate",
        {...options, customSerialiserUsage: usage}
    ) as T;

    applyIgnoredPassthrough(instance, cloned);

    return cloned;
}

export function duplicateInstance<T>(
    instance: T,
    options?: CreateInstanceOptions
): T {
    return duplicateForUsage(instance, "duplicateInstance", options);
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

    const {removeNullsFromExpando = true} = options;

    const ctor = (instance as any).constructor;

    // Discover schema from the real instance
    const {fields, expandoKey, includedKeys} = parseClass(instance);

    // Full snapshot of the original instance
    const base = serialiseInstance(instance, {customSerialiserUsage: "cloneWith"});

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

    // A changed field that uses a custom wire format must be serialised before
    // the matching hydration pass. The same is true of nested object/array
    // changes, which may themselves contain scoped field serializers.
    const needsReserialise = Object.keys(schemaChanges).some(key =>
        fields[key].fieldType !== TSType.Value ||
        usesCustomSerialiser(fields[key].customSerialiser, "cloneWith")
    );

    // ---- Apply schema changes
    if ((hasCustomSerialise || needsReserialise) && Object.keys(schemaChanges).length > 0) {
        const interim = duplicateForUsage(instance, "cloneWith");

        for (const [key, value] of Object.entries(schemaChanges)) {
            (interim as any)[key] = value;
        }

        merged = serialiseInstance(interim, {customSerialiserUsage: "cloneWith"});
    } else if (hasCustomSerialise) {
        merged = {...base};
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
            const nextExpando: Record<string, any> = {...baseExpando};

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

    const cloned = createInstance(
        merged,
        ctor,
        null,
        "cloneWith",
        {
            errorForNullRequired: true,
            customSerialiserUsage: "cloneWith"
        }
    ) as T;

    applyIgnoredPassthrough(instance, cloned);

    return cloned;
}

