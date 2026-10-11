import {parseClass} from "./schemaDiscovery";
import {TSType} from "./TSType";
import {RIFTError} from "../utils/errors";

/**
 * Maps identity handles created by updateWith back to their single mutable object.
 * Weak keys avoid retaining handles after React releases them.
 */
const liveTargets = new WeakMap<object, object>();
const boundMethods = new WeakMap<object, Map<PropertyKey, {method: Function; bound: Function}>>();

/** Internal: strip an updateWith identity handle without copying its data. */
export function unwrapUpdateTarget<T>(value: T): T {
    if (value !== null && typeof value === "object") {
        return (liveTargets.get(value) ?? value) as T;
    }
    return value;
}

function newIdentityHandle<T extends object>(target: T): T {
    const view = new Proxy(target, {
        get(original, key) {
            // Use the original as the getter receiver, including for #private state.
            const value = Reflect.get(original, key, original);
            if (key === "constructor" || typeof value !== "function" ||
                Object.prototype.hasOwnProperty.call(original, key)) {
                return value;
            }
            // Prototype methods must execute with the original as `this`.
            let cache = boundMethods.get(original);
            if (!cache) {
                cache = new Map();
                boundMethods.set(original, cache);
            }
            const existing = cache.get(key);
            if (existing?.method === value) return existing.bound;
            const bound = value.bind(original);
            cache.set(key, {method: value, bound});
            return bound;
        },
        set(original, key, value) {
            return Reflect.set(original, key, value, original);
        }
    });
    liveTargets.set(view, target);
    return view;
}

/**
 * Mutates the original schema-backed instance and returns a new identity handle
 * pointing at that *same* instance. Every old reference and previously returned
 * handle observes the changed data. This is intentionally NOT immutable state.
 *
 * Unlike cloneWith, this method does not deep-copy or rehydrate changed fields.
 * Replacement object/array values are stored by reference, not cloned.
 */
export function updateWith<T extends object>(instance: T, changes: Partial<T>): T {
    if (instance === null || instance === undefined) return instance;
    if (typeof instance !== "object" || Array.isArray(instance)) {
        throw new RIFTError("updateWith: expected a class instance", "updateWith");
    }
    if (changes === null || typeof changes !== "object" || Array.isArray(changes)) {
        throw new RIFTError("updateWith: changes must be an object", "updateWith");
    }

    const target = unwrapUpdateTarget(instance);
    const {fields, expandoKey, includedKeys} = parseClass(target);
    const entries = Object.entries(changes);

    // Preflight every key before making any mutation.
    for (const [key, value] of entries) {
        if (includedKeys.has(key)) {
            throw new RIFTError(`updateWith: cannot modify included field: ${key}`, "updateWith");
        }
        if (key === expandoKey) {
            if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
                throw new RIFTError("updateWith: expando updates must be a plain object", "updateWith");
            }
            continue;
        }
        const field = fields[key];
        if (!field) {
            throw new RIFTError(`updateWith: cannot modify non-schema field: ${key}`, "updateWith");
        }
        if ((value === null || value === undefined) && field.required) {
            throw new RIFTError(`updateWith: required field was null: ${key}`, "updateWith");
        }
        if (value !== null && value !== undefined) {
            if (field.fieldType === TSType.Array && !Array.isArray(value)) {
                throw new RIFTError(`updateWith: expected array for field: ${key}`, "updateWith");
            }
            if (field.fieldType === TSType.Object &&
                (typeof value !== "object" || Array.isArray(value))) {
                throw new RIFTError(`updateWith: expected object for field: ${key}`, "updateWith");
            }
        }
    }

    const writable = target as Record<string, unknown>;
    for (const [key, value] of entries) {
        if (key === expandoKey) {
            if (writable[key] === null || writable[key] === undefined) writable[key] = {};
            const current = writable[key] as Record<string, unknown>;
            if (typeof current !== "object" || Array.isArray(current)) {
                throw new RIFTError(`updateWith: invalid existing expando field: ${key}`, "updateWith");
            }
            for (const [name, changed] of Object.entries(value as Record<string, unknown>)) {
                if (changed === null) delete current[name];
                else current[name] = changed;
            }
        } else {
            writable[key] = value;
        }
    }
    return newIdentityHandle(target);
}
