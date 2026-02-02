import { TSField, TSType } from "../core";
import type { Constructor } from "../core/TSField";

/**
 * Universal @Field decorator compatible with both legacy (experimentalDecorators)
 * and modern (TC39 Stage 3 / TS 5.6+) decorator semantics.
 */
export function Field(
  type: TSType,
  instantiator?: ((obj: any) => any) | Constructor | null,
  required: boolean = true
) {
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
        const field = new TSField(type, instantiator ?? null, required);
        proto.__schemaFields[key] = field;
        (proto as any)[key] = field;
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

    const field = new TSField(type, instantiator ?? null, required);
    target.__schemaFields[String(propertyKey)] = field;
    (target as any)[propertyKey] = field;
  };
}

/**
 * @OptionalField decorator
 * Sets:
 *  - instantiator = null
 *  - required = false
 */
export function OptionalField(type: TSType, instantiator?: ((obj: any) => any) | Constructor | null) {
  return Field(type, instantiator, false);
}

/** Extracts all @Field metadata from a class instance. */
export function getSchemaFields(instance: any): Record<string, TSField> {
  const proto = Object.getPrototypeOf(instance);
  return proto?.__schemaFields ?? {};
}
