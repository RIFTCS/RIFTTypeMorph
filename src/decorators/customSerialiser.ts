import { Constructor, TSField } from "../core/TSField";
import { RIFTError } from "../utils/errors";

/*
Transport-layer serializer functions.

They operate on the output of serialiseInstance,
NOT on runtime class instances.
*/

type CustomSerialiseFn = (data: any) => any;
type CustomDeserialiseFn = (data: any) => any;

type SerialisedTypeFor<T> =
    T extends string ? "string" :
    T extends number ? "number" :
    T extends boolean ? "boolean" :
    T extends bigint ? "bigint" :
    T extends symbol ? "symbol" :
    T extends undefined ? "undefined" :
    T extends null ? "null" :
    Constructor<T>;

export type SerialisedRuntimeType = string | Constructor<any>;

export function matchesSerialisedType(value: any, type: SerialisedRuntimeType): boolean {
    if (typeof type === "function") {
        if (value === null || value === undefined) return false;

        return value.constructor === type;
    }

    switch (type) {
        case "string":
        case "number":
        case "boolean":
        case "bigint":
        case "symbol":
        case "undefined":
            return typeof value === type;

        case "null":
            return value === null;

        default:
            // Constructor-backed runtime types are represented by the constructor
            // object itself. Arbitrary class-name strings are intentionally not
            // interpreted as runtime identities because that would reintroduce
            // a dependency on Function.name and break identifier obfuscation.
            return false;
    }
}

export interface CustomSerialiser {
    serialise: CustomSerialiseFn;
    deserialise: CustomDeserialiseFn;
}

export interface CustomSerialiserMeta {
    serialiser: CustomSerialiser;
    serialisedType: SerialisedRuntimeType;
    handlesNull?: boolean;
}

function resolveRuntimeType(type: Constructor<any> | string): SerialisedRuntimeType {
    if (typeof type === "string") return type;

    if (type === String) return "string";
    if (type === Number) return "number";
    if (type === Boolean) return "boolean";

    /*
     * Keep non-primitive constructors as runtime identities.
     *
     * Using a constructor function's display name here makes schema validation dependent on a
     * human-readable JavaScript identifier. Minifiers/obfuscators are free to
     * rename classes, and unrelated constructors may also share the same name.
     * The constructor object is already the stable runtime identity TypeMorph
     * needs, so retaining it makes this path safe under identifier mangling.
     */
    return type;
}

/*
Decorator
*/

export function CustomSerialise<T = any, S = any>(
    serialise: (data: any) => any,
    deserialise: (data: any) => any,
    serialisedType: SerialisedTypeFor<S>,
    handlesNull: boolean = false
) {
    return function (...args: any[]) {

        const runtimeType = resolveRuntimeType(serialisedType as any);

        const meta: CustomSerialiserMeta = {
            serialiser: {
                serialise,
                deserialise
            },
            serialisedType: runtimeType,
            handlesNull
        };

        /*
        Modern decorator support
        */

        if (
            args.length >= 1 &&
            args.some(a => a && typeof a === "object" && "kind" in a)
        ) {

            const context = args.find(
                (a): a is ClassFieldDecoratorContext =>
                    a && typeof a === "object" && "kind" in a
            );

            if (!context) {
                throw new RIFTError("Context could not be found!");
            }

            const key = String(context.name);

            context.addInitializer(function (this: any) {

                const proto = Object.getPrototypeOf(this);

                const field = proto?.__schemaFields?.[key];
                if (field) {
                    field.customSerialiser = meta;
                    return;
                }

                if (!proto.__pendingCustomSerialisers) {
                    Object.defineProperty(proto, "__pendingCustomSerialisers", {
                        value: {},
                        enumerable: false,
                        configurable: false,
                        writable: true
                    });
                }

                proto.__pendingCustomSerialisers[key] = meta;
            });

            return;
        }

        /*
        Legacy decorator support
        */

        const [target, propertyKey] = args;

        if (!target) return;

        const key = String(propertyKey);

        const field = target.__schemaFields?.[key];

        if (field) {
            field.customSerialiser = meta;
            return;
        }

        if (!target.__pendingCustomSerialisers) {
            Object.defineProperty(target, "__pendingCustomSerialisers", {
                value: {},
                enumerable: false,
                configurable: false,
                writable: true
            });
        }

        target.__pendingCustomSerialisers[key] = meta;
    };
}

/*
Custom deserialisation pass

Runs BEFORE createInstance hydration.
Mutates the transport object directly.
*/

export function customDeserialisePass(
    input: any,
    schemaFields: Record<string, TSField>,
    outerType: string
): void {

    if (!input || typeof input !== "object") {
        return;
    }

    for (const [key, fieldDef] of Object.entries(schemaFields)) {

        const custom = fieldDef?.customSerialiser;
        if (!custom) continue;

        const rawValue = input[key];

        if (rawValue === undefined) continue;

        if ((rawValue === null) && custom.handlesNull !== true) {
            continue;
        }

        try {
            input[key] = custom.serialiser.deserialise(rawValue);
        } catch (e: any) {
            throw new RIFTError(
                `Error during custom deserialisation of field "${key}": ${e?.message ?? e}`,
                `${outerType}.${key}`
            );
        }
    }
}

/*
Serialisation pass helper.

serialiseInstance should collect the normal output first,
then this runs as a final transform stage.
*/

export function runFieldCustomSerialiser(
    key: string,
    fieldDef: TSField,
    objInstance: any,
    output: any,
    outerType: string
): boolean {

    const custom = fieldDef?.customSerialiser;
    if (!custom) return false;

    const value = output[key];

    if ((value === null || value === undefined) && custom.handlesNull !== true) {
        output[key] = null;
        return true;
    }

    let transformed: any;

    try {
        transformed = custom.serialiser.serialise(value);
    } catch (e: any) {
        throw new RIFTError(
            `Error during custom serialisation of field "${key}": ${e?.message ?? e}`,
            `${outerType}.${key}`
        );
    }

    if (
        custom.serialisedType &&
        !matchesSerialisedType(transformed, custom.serialisedType)
    ) {
        throw new RIFTError(
            `Custom serialiser returned invalid type for field "${key}"`,
            `${outerType}.${key}`
        );
    }

    output[key] = transformed;

    return true;
}