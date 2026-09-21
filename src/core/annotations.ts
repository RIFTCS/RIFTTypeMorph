import { MODERN_FIELD_ANNOTATIONS_METADATA } from "./metadataKeys";

export interface RIFTAnnotation<T = unknown> {
  namespace: string;
  name: string;
  value: T;
}

const CLASS_ANNOTATIONS = Symbol("rifttypemorph.classAnnotations");
const FIELD_ANNOTATIONS = Symbol("rifttypemorph.fieldAnnotations");

type AnnotatedConstructor = Function & {
  [CLASS_ANNOTATIONS]?: RIFTAnnotation[];
};

type AnnotatedPrototype = object & {
  [FIELD_ANNOTATIONS]?: Map<string, RIFTAnnotation[]>;
};

function appendUnique(
  target: RIFTAnnotation[],
  annotation: RIFTAnnotation
): void {
  if (
    target.some(
      (item) =>
        item.namespace === annotation.namespace &&
        item.name === annotation.name &&
        item.value === annotation.value
    )
  ) {
    return;
  }
  target.push(annotation);
}

function ownClassAnnotations(ctor: AnnotatedConstructor): RIFTAnnotation[] {
  if (!Object.prototype.hasOwnProperty.call(ctor, CLASS_ANNOTATIONS)) {
    Object.defineProperty(ctor, CLASS_ANNOTATIONS, {
      value: [],
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  return ctor[CLASS_ANNOTATIONS]!;
}

function ownFieldAnnotations(proto: AnnotatedPrototype): Map<string, RIFTAnnotation[]> {
  if (!Object.prototype.hasOwnProperty.call(proto, FIELD_ANNOTATIONS)) {
    Object.defineProperty(proto, FIELD_ANNOTATIONS, {
      value: new Map<string, RIFTAnnotation[]>(),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  return proto[FIELD_ANNOTATIONS]!;
}

export function addClassAnnotation<T>(
  ctor: Function,
  namespace: string,
  name: string,
  value: T
): void {
  ownClassAnnotations(ctor as AnnotatedConstructor).push({ namespace, name, value });
}

export function addFieldAnnotation<T>(
  proto: object,
  propertyKey: string,
  namespace: string,
  name: string,
  value: T
): void {
  const annotations = ownFieldAnnotations(proto as AnnotatedPrototype);
  const existing = annotations.get(propertyKey) ?? [];
  existing.push({ namespace, name, value });
  annotations.set(propertyKey, existing);
}

export function getClassAnnotations(ctor: Function): RIFTAnnotation[] {
  const chain: Function[] = [];
  let cursor: any = ctor;

  while (cursor && cursor !== Function.prototype) {
    chain.unshift(cursor);
    cursor = Object.getPrototypeOf(cursor);
  }

  const result: RIFTAnnotation[] = [];
  for (const current of chain) {
    if (!Object.prototype.hasOwnProperty.call(current, CLASS_ANNOTATIONS)) continue;
    result.push(...((current as AnnotatedConstructor)[CLASS_ANNOTATIONS] ?? []));
  }

  return result;
}

export function getFieldAnnotations(ctor: Function): Record<string, RIFTAnnotation[]> {
  const protos: object[] = [];
  let cursor = (ctor as any).prototype;

  while (cursor && cursor !== Object.prototype) {
    protos.unshift(cursor);
    cursor = Object.getPrototypeOf(cursor);
  }

  const result: Record<string, RIFTAnnotation[]> = {};

  const symbolMetadata = (Symbol as any).metadata;
  const modernMetadata = symbolMetadata ? (ctor as any)[symbolMetadata] : undefined;
  const modernFields = modernMetadata?.[MODERN_FIELD_ANNOTATIONS_METADATA] as
    | Map<string, RIFTAnnotation[]>
    | undefined;

  if (modernFields) {
    for (const [field, items] of modernFields.entries()) {
      const target = result[field] ?? [];
      for (const item of items) appendUnique(target, item);
      result[field] = target;
    }
  }

  for (const proto of protos) {
    if (!Object.prototype.hasOwnProperty.call(proto, FIELD_ANNOTATIONS)) continue;
    const annotations = (proto as AnnotatedPrototype)[FIELD_ANNOTATIONS];
    if (!annotations) continue;

    for (const [field, items] of annotations.entries()) {
      const target = result[field] ?? [];
      for (const item of items) appendUnique(target, item);
      result[field] = target;
    }
  }

  return result;
}

export function classAnnotation<T = unknown>(
  namespace: string,
  name: string,
  value: T
): ClassDecorator {
  return (target) => {
    addClassAnnotation(target, namespace, name, value);
  };
}

export function fieldAnnotation<T = unknown>(
  namespace: string,
  name: string,
  value: T
) {
  return function (...args: any[]) {
    if (
      args.length >= 1 &&
      args.some((arg) => arg && typeof arg === "object" && "kind" in arg)
    ) {
      const context = args.find(
        (arg) => arg && typeof arg === "object" && "kind" in arg
      );
      const key = String(context.name);
      const annotation: RIFTAnnotation<T> = { namespace, name, value };

      if (context.metadata && typeof context.metadata === "object") {
        const metadata = context.metadata as Record<PropertyKey, any>;
        const inherited = metadata[MODERN_FIELD_ANNOTATIONS_METADATA] as
          | Map<string, RIFTAnnotation[]>
          | undefined;
        const annotations = Object.prototype.hasOwnProperty.call(
          metadata,
          MODERN_FIELD_ANNOTATIONS_METADATA
        )
          ? inherited ?? new Map<string, RIFTAnnotation[]>()
          : new Map(
              [...(inherited?.entries() ?? [])].map(([field, items]) => [field, [...items]])
            );
        const existing = annotations.get(key) ?? [];
        appendUnique(existing, annotation);
        annotations.set(key, existing);
        metadata[MODERN_FIELD_ANNOTATIONS_METADATA] = annotations;
      }

      context.addInitializer(function (this: any) {
        addFieldAnnotation(Object.getPrototypeOf(this), key, namespace, name, value);
      });
      return;
    }

    const [target, propertyKey] = args;
    if (!target || propertyKey === undefined || propertyKey === null) return;
    addFieldAnnotation(target, String(propertyKey), namespace, name, value);
  };
}
