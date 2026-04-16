import { TSField, TSType } from "../index";
import type { Constructor } from "../core/TSField";
import {RIFTError} from "../utils/errors";

/**
 * Universal @Field decorator compatible with both legacy (experimentalDecorators)
 * and modern (TC39 Stage 3 / TS 5.6+) decorator semantics.
 */
export function Field(
  type: TSType,
  instantiator?: ((obj: any) => any) | Constructor | null,
  required: boolean = true,
  ifEmpty?: (() => any)
) {
    if(required && ifEmpty){
        throw new RIFTError("Cannot specify both required and ifEmpty");
    }
  return function (...args: any[]) {
    // --- Modern decorator (TS 5.6+, Node 22+) ---
    // Can be (context) or (value, context) depending on transform
    if (
      args.length >= 1 &&
      args.some((a) => a && typeof a === "object" && "kind" in a)
    ) {
      const context = args.find((a) => a && typeof a === "object" && "kind" in a);
      const key = String(context.name);

      context.addInitializer(function (this: any) {
        const proto = Object.getPrototypeOf(this);
        if (!proto.__schemaFields) {
          Object.defineProperty(proto, "__schemaFields", {
            value: {},
            enumerable: false,
            configurable: false,
            writable: true,
          });
        }
        const field = new TSField(type, instantiator ?? null, required, ifEmpty);
        proto.__schemaFields[key] = field;
        //(proto as any)[key] = field;
      });
      return;
    }

    // --- Legacy decorators (experimentalDecorators: true) ---
    const [target, propertyKey] = args;
    if (!target || !propertyKey) return;

    if (!target.__schemaFields) {
      Object.defineProperty(target, "__schemaFields", {
        value: {},
        enumerable: false,
        configurable: false,
        writable: true,
      });
    }

    const field = new TSField(type, instantiator ?? null, required, ifEmpty);
    target.__schemaFields[String(propertyKey)] = field;
    //(target as any)[propertyKey] = field;
  };
}

/**
 * @OptionalField decorator
 * Sets:
 *  - instantiator = null
 *  - required = false
 */
export function OptionalField(type: TSType, instantiator?: ((obj: any) => any) | Constructor | null, ifEmpty?: (() => any)) {
  return Field(type, instantiator, false, ifEmpty);
}

/**
 * @Ignore decorator
 * Marks a property to be skipped during serialisation.
 */
/**
 * @Ignore decorator
 * Marks a property to be skipped during serialisation.
 * passThroughOnClone: if true the value is preserved when cloning.
 */
export function Ignore(passThroughOnClone: boolean = false) {
  return function (...args: any[]) {
    // --- Modern decorators (TS 5.6+) ---
    if (
      args.length >= 1 &&
      args.some((a) => a && typeof a === "object" && "kind" in a)
    ) {
      const context = args.find((a) => a && typeof a === "object" && "kind" in a);
      const key = String(context.name);

      context.addInitializer(function (this: any) {
        const proto = Object.getPrototypeOf(this);
        if (!proto.__ignoredFields) {
          Object.defineProperty(proto, "__ignoredFields", {
            value: new Map<string, { passThroughOnClone: boolean }>(),
            enumerable: false,
            configurable: false,
            writable: false,
          });
        }

        proto.__ignoredFields.set(key, { passThroughOnClone });
      });
      return;
    }

    // --- Legacy decorators ---
    const [target, propertyKey] = args;
    if (!target || !propertyKey) return;

    if (!target.__ignoredFields) {
      Object.defineProperty(target, "__ignoredFields", {
        value: new Map<string, { passThroughOnClone: boolean }>(),
        enumerable: false,
        configurable: false,
        writable: false,
      });
    }

    target.__ignoredFields.set(String(propertyKey), { passThroughOnClone });
  };
}

/** Extracts all @Ignore metadata from a class instance. */
export function getIgnoredFields(
  instance: any
): Map<string, { passThroughOnClone: boolean }> {
  const proto = Object.getPrototypeOf(instance);
  return proto?.__ignoredFields ?? new Map();
}

/** Extracts all @Field metadata from a class instance. */
export function getSchemaFields(instance: any): Record<string, TSField> {
  const proto = Object.getPrototypeOf(instance);
  return proto?.__schemaFields ?? {};
}
