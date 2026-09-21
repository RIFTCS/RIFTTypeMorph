export { TSType } from "./core/TSType";
export { TSField } from "./core/TSField";
export { Field, OptionalField, Ignore } from "./decorators/schemaDecorator";
export { BypassConstructor } from "./decorators/rehydrateOptions";
export { createInstance } from "./core/createInstance";
export { serialiseInstance } from "./core/serialiseInstance";
export { validateInstance } from "./core/validateInstance";
export { duplicateInstance, cloneWith } from "./core/copyInstance";
export { Include } from "./decorators/serialiseOptions";
export { parseClass } from "./core/schemaDiscovery";
export { describeClass } from "./core/introspection";
export type { TypeMorphClassDescription, DescribedField } from "./core/introspection";
export {
  classAnnotation,
  fieldAnnotation,
  addClassAnnotation,
  addFieldAnnotation,
  getClassAnnotations,
  getFieldAnnotations,
} from "./core/annotations";
export type { RIFTAnnotation } from "./core/annotations";
export { CustomSerialise } from "./decorators/customSerialiser";
export { TypeMorphSerialisableCtor } from "./core/classCustomSerialiser";
export {
  Entity,
  ScalarType,
  AppliesTo,
  Key,
  EffectiveAt,
  RevisionAt,
  Reference,
  Component,
  Measure,
  Attribute,
  Ordered,
} from "./decorators/entityDecorators";
export type {
  EntityOptions,
  ScalarTypeOptions,
  MeasureOptions,
  ReferenceOptions,
  ComponentOptions,
  AppliesToOptions,
} from "./decorators/entityDecorators";
export {
  inferGrainModel,
  emitGrainMarkdown,
  transpileEntitiesToGrain,
} from "./grain/transpile";
export type {
  GrainArithmeticOperation,
  GrainPattern,
  GrainWorldEventIR,
  GrainFieldsRowIR,
  GrainPermissionIR,
  GrainRelationshipIR,
  GrainRelationshipMappingIR,
  GrainTemporalJoinIR,
  GrainNarrowingIR,
  GrainRowIR,
  GrainEntityIR,
  GrainModelIR,
  GrainTranspileResult,
  GrainFactValue,
  GrainSuppliedIR,
  GrainExpectedIR,
} from "./grain/model";

export { grain, grainRules, renderGrainSelection, renderGrainTerm, renderGrainHow } from "./grain/dsl";
export type {
  GrainCompareOperator,
  GrainOrdering,
  GrainSelection,
  GrainTerm,
  GrainHow,
  GrainPermissionSide,
  GrainRuleSet,
  GrainRuleSetInput,
  GrainExpectedFigures,
} from "./grain/dsl";
export { grainEntityMetadata } from "./grain/entityMetadata";
export type { GrainEntityMetadata } from "./grain/entityMetadata";

export {
  Transform,
  From,
  Current,
  Latest,
  Previous,
  Next,
  Applicable,
  Grouped,
} from "./transforms/decorators";
export type { TransformOptions } from "./transforms/metadata";
export {
  defineTransformOperator,
  getTransformOperator,
  sum,
  maximum,
  minimum,
  count,
} from "./transforms/runtime";
export { compileTransformClass, compileTransformClasses } from "./transforms/compile";
export { lowerTransformsToGrainRules } from "./grain/transformLowering";
export type {
  TransformSourceRef,
  TransformInputKind,
  TransformInputIR,
  TransformValueExpression,
  TransformPredicateExpression,
  TransformOutputFieldIR,
  TransformIR,
  TransformOperatorDefinition,
  TransformCompilation,
} from "./transforms/model";

export { transpileExecutableTransformsToGrain, mergeGrainRuleSets } from "./transforms/transpile";
export type { ExecutableTransformTranspileResult } from "./transforms/transpile";
