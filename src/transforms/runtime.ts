import type { TransformOperatorDefinition } from "./model";

const operators = new Map<string, TransformOperatorDefinition>();
const operatorsByOperation = new Map<string, TransformOperatorDefinition>();

function codeNameFor(operation: string): string {
  return operation
    .trim()
    .replace(/[^A-Za-z0-9]+(.)/g, (_match, next: string) => next.toUpperCase())
    .replace(/^[^A-Za-z_]+/, "");
}

export type TransformOperator<A extends unknown[], R> = ((...args: A) => R) & {
  readonly __riftTransformOperator: TransformOperatorDefinition;
};

export function defineTransformOperator<A extends unknown[], R>(
  operation: string,
  runtime: (...args: A) => R,
  options: { codeName?: string; foldable?: boolean; identity?: number } = {}
): TransformOperator<A, R> {
  const codeName = options.codeName?.trim() || codeNameFor(operation);
  if (!codeName) throw new Error(`Cannot derive a TypeScript operator name from '${operation}'.`);
  if (runtime.length !== 1 && runtime.length !== 2) {
    throw new Error("Transform operators currently support unary and binary functions only.");
  }

  const definition: TransformOperatorDefinition = {
    codeName,
    operation,
    arity: runtime.length as 1 | 2,
    runtime,
    foldable: options.foldable,
    identity: options.identity,
  };

  const wrapped = ((...args: A) => runtime(...args)) as TransformOperator<A, R>;
  Object.defineProperty(wrapped, "name", { value: codeName, configurable: true });
  Object.defineProperty(wrapped, "__riftTransformOperator", {
    value: definition,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  operators.set(codeName, definition);
  operatorsByOperation.set(operation, definition);
  return wrapped;
}

export function getTransformOperator(codeName: string): TransformOperatorDefinition | undefined {
  return operators.get(codeName);
}

export function sum<T>(items: readonly T[], select: (item: T) => number): number {
  return items.reduce((total, item) => total + select(item), 0);
}

export function maximum<T>(
  items: readonly T[],
  select: (item: T) => number,
  identity?: number
): number | undefined {
  if (!items.length) return identity;
  let value = select(items[0]);
  for (let index = 1; index < items.length; index += 1) {
    value = Math.max(value, select(items[index]));
  }
  return value;
}

export function minimum<T>(
  items: readonly T[],
  select: (item: T) => number,
  identity?: number
): number | undefined {
  if (!items.length) return identity;
  let value = select(items[0]);
  for (let index = 1; index < items.length; index += 1) {
    value = Math.min(value, select(items[index]));
  }
  return value;
}

export function count<T>(items: readonly T[]): number {
  return items.length;
}

export function getTransformOperatorByOperation(operation: string): TransformOperatorDefinition | undefined {
  return operatorsByOperation.get(operation);
}
