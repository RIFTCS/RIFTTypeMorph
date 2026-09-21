import { classAnnotation, fieldAnnotation } from "../core/annotations";
import type { Constructor } from "../core/TSField";

export const ER_ANNOTATION_NAMESPACE = "er";

export interface EntityOptions {
  name?: string;
}

export interface ScalarTypeOptions {
  literal: string;
  ordered?: boolean;
  operations?: readonly ("plus" | "less" | "times" | "over")[];
}

export interface MeasureOptions {
  unit?: string;
  literal?: string;
  ordered?: boolean;
  operations?: readonly ("plus" | "less" | "times" | "over")[];
}

export interface ReferenceOptions {
  target: Constructor;
  targetField?: string;
}

export interface ComponentOptions {
  target?: Constructor;
}

export interface AppliesToOptions {
  target: Constructor;
  name?: string;
}

export function Entity(options: EntityOptions = {}): ClassDecorator {
  return classAnnotation(ER_ANNOTATION_NAMESPACE, "entity", options);
}

export function ScalarType(options: ScalarTypeOptions): ClassDecorator {
  return classAnnotation(ER_ANNOTATION_NAMESPACE, "scalarType", options);
}

export function AppliesTo(target: Constructor, options: { name?: string } = {}): ClassDecorator {
  const value: AppliesToOptions = { target, name: options.name };
  return classAnnotation(ER_ANNOTATION_NAMESPACE, "appliesTo", value);
}

export function Key() {
  return fieldAnnotation(ER_ANNOTATION_NAMESPACE, "key", true);
}

export function EffectiveAt() {
  return fieldAnnotation(ER_ANNOTATION_NAMESPACE, "effectiveAt", true);
}

export function RevisionAt() {
  return fieldAnnotation(ER_ANNOTATION_NAMESPACE, "revisionAt", true);
}

export function Reference(target: Constructor, options: { targetField?: string } = {}) {
  const value: ReferenceOptions = { target, targetField: options.targetField };
  return fieldAnnotation(ER_ANNOTATION_NAMESPACE, "reference", value);
}

export function Component(target?: Constructor) {
  const value: ComponentOptions = { target };
  return fieldAnnotation(ER_ANNOTATION_NAMESPACE, "component", value);
}

export function Measure(options: MeasureOptions = {}) {
  return fieldAnnotation(ER_ANNOTATION_NAMESPACE, "measure", options);
}

export function Attribute() {
  return fieldAnnotation(ER_ANNOTATION_NAMESPACE, "attribute", true);
}

export function Ordered() {
  return fieldAnnotation(ER_ANNOTATION_NAMESPACE, "ordered", true);
}
