import type { TransformSourceRef } from "./model";
import {
  setTransformMethodMetadata,
  setTransformParameterMetadata,
  type TransformOptions,
} from "./metadata";

export function Transform(name: string, options: TransformOptions = {}): MethodDecorator {
  return (target, propertyKey) => {
    setTransformMethodMetadata(target, propertyKey, {
      name,
      label: options.label,
      principal: options.principal,
      seed: options.seed,
      identity: options.identity,
    });
  };
}

function inputDecorator(
  metadata: Parameters<typeof setTransformParameterMetadata>[3]
): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (propertyKey === undefined) {
      throw new Error("Transform input decorators can only be used on methods.");
    }
    setTransformParameterMetadata(target, propertyKey, parameterIndex, metadata);
  };
}

export function From(source: TransformSourceRef): ParameterDecorator {
  return inputDecorator({ kind: "from", source });
}

export function Current(source: TransformSourceRef): ParameterDecorator {
  return inputDecorator({ kind: "current", source });
}

export function Latest(
  source: TransformSourceRef,
  options: { by?: string; per?: readonly string[] } = {}
): ParameterDecorator {
  return inputDecorator({
    kind: "latest",
    source,
    by: options.by,
    per: [...(options.per ?? [])],
  });
}

export function Previous(
  source: TransformSourceRef,
  options: { by?: string; per?: readonly string[] } = {}
): ParameterDecorator {
  return inputDecorator({
    kind: "previous",
    source,
    by: options.by,
    per: [...(options.per ?? [])],
  });
}

export function Next(
  source: TransformSourceRef,
  options: { by?: string; per?: readonly string[] } = {}
): ParameterDecorator {
  return inputDecorator({
    kind: "next",
    source,
    by: options.by,
    per: [...(options.per ?? [])],
  });
}

export function Applicable(
  source: TransformSourceRef,
  options: {
    to?: TransformSourceRef;
    without?: readonly string[];
  } = {}
): ParameterDecorator {
  return inputDecorator({
    kind: "applicable",
    source,
    to: options.to,
    without: [...(options.without ?? [])],
  });
}

export function Grouped(
  source: TransformSourceRef,
  options: { per: readonly string[] }
): ParameterDecorator {
  if (!options.per.length) {
    throw new Error("@Grouped(...) requires at least one 'per' field.");
  }
  return inputDecorator({ kind: "group", source, per: [...options.per] });
}
