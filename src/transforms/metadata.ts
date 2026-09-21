import type { TransformSourceRef } from "./model";

export interface TransformOptions {
  label?: string;
  principal?: number;
  seed?: TransformSourceRef;
  identity?: readonly string[];
}

export interface TransformMethodMetadata {
  name: string;
  label?: string;
  principal?: number;
  seed?: TransformSourceRef;
  identity?: readonly string[];
}

export type TransformParameterMetadata =
  | { kind: "from" | "current"; source: TransformSourceRef }
  | {
      kind: "latest" | "previous" | "next";
      source: TransformSourceRef;
      by?: string;
      per: string[];
    }
  | {
      kind: "applicable";
      source: TransformSourceRef;
      to?: TransformSourceRef;
      without: string[];
    }
  | { kind: "group"; source: TransformSourceRef; per: string[] };

interface MethodRecord {
  method?: TransformMethodMetadata;
  parameters: Map<number, TransformParameterMetadata>;
}

const records = new WeakMap<object, Map<string | symbol, MethodRecord>>();

function recordFor(target: object, propertyKey: string | symbol): MethodRecord {
  let methods = records.get(target);
  if (!methods) {
    methods = new Map();
    records.set(target, methods);
  }
  let record = methods.get(propertyKey);
  if (!record) {
    record = { parameters: new Map() };
    methods.set(propertyKey, record);
  }
  return record;
}

export function setTransformMethodMetadata(
  target: object,
  propertyKey: string | symbol,
  metadata: TransformMethodMetadata
): void {
  recordFor(target, propertyKey).method = metadata;
}

export function setTransformParameterMetadata(
  target: object,
  propertyKey: string | symbol,
  index: number,
  metadata: TransformParameterMetadata
): void {
  recordFor(target, propertyKey).parameters.set(index, metadata);
}

export function getTransformRecords(target: object): ReadonlyMap<string | symbol, MethodRecord> {
  return records.get(target) ?? new Map();
}
