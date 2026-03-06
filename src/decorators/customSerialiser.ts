import {Constructor, TSField} from "../core/TSField";
import { RIFTError } from "../utils/errors";

type CustomSerialiseFn<T> = (data: T) => any;
type CustomDeserialiseFn<T> = (data: any) => T;

type SerialisedTypeFor<T> =
    T extends string ? "string" :
    T extends number ? "number" :
    T extends boolean ? "boolean" :
    T extends bigint ? "bigint" :
    T extends symbol ? "symbol" :
    T extends undefined ? "undefined" :
    T extends null ? "null" :
    Constructor<T>;

export function matchesSerialisedType(value: any, type: string): boolean {
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
            if (value === null || value === undefined) return false;

            const ctor = value.constructor;
            return ctor && ctor.name === type;
    }
}

export interface CustomSerialiser<T = any> {
    serialise: CustomSerialiseFn<T>;
    deserialise: CustomDeserialiseFn<T>;
}

export interface CustomSerialiserMeta<T = any> {
    serialiser: CustomSerialiser<T>;
    serialisedType: string;
    handlesNull?: boolean;
}

function resolveTypeString(type: Constructor<any> | string): string {
    if (typeof type === "string") return type;

    if (type === String) return "string";
    if (type === Number) return "number";
    if (type === Boolean) return "boolean";

    return type.name;
}

export function CustomSerialise<T, S>(
    serialise: (data: T) => S,
    deserialise: (data: S) => T,
    serialisedType: SerialisedTypeFor<S>,
    handlesNull: boolean = false
) {
    return function (...args: any[]) {

        const typeString = resolveTypeString(serialisedType as any);

        const meta: CustomSerialiserMeta<T> = {
            serialiser: {
                serialise,
                deserialise
            },
            serialisedType: typeString,
            handlesNull
        };

        // ---- Modern decorators
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

                // Field already exists
                const field = proto?.__schemaFields?.[key];
                if (field) {
                    field.customSerialiser = meta;
                    return;
                }

                // Field not yet created — store pending
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

        // ---- Legacy decorators
        const [target, propertyKey] = args;

        if (!target) return;

        const key = String(propertyKey);

        const field = target.__schemaFields?.[key];

        if (field) {
            field.customSerialiser = meta;
            return;
        }

        // Field not defined yet
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

        if (rawValue === null || rawValue === undefined) continue;

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

export function runFieldCustomSerialiser(
    key: string,
    fieldDef: any,
    objInstance: any,
    output: any,
    outerType: string
): boolean {

    const custom = fieldDef?.customSerialiser;
    if (!custom) return false;

    const value = objInstance[key];

    // Framework default null semantics unless serializer opts in
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