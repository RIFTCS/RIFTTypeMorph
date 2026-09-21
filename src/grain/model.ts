import type { Constructor } from "../core/TSField";

export type GrainArithmeticOperation = "plus" | "less" | "times" | "over";
export type GrainPattern = "account for" | "work out" | "group" | "differ" | "spread" | "override";

export interface GrainWorldEventIR {
  entity: Constructor;
  entityName: string;
  eventName: string;
  fields: string[];
}

export interface GrainFieldsRowIR {
  selects: string;
  fields: string[];
  evidence: string;
}

export interface GrainPermissionIR {
  operation: string;
  on: string;
  evidence: string;
}

export interface GrainRelationshipIR {
  sourceEntity: Constructor;
  sourceEntityName: string;
  sourceField: string;
  targetEntity: Constructor;
  targetEntityName: string;
  targetField: string;
}

export interface GrainRelationshipMappingIR {
  providerField: string;
  consumerField: string;
  targetEntity: Constructor;
  targetEntityName: string;
  targetField: string;
}

export interface GrainTemporalJoinIR {
  providerEntity: Constructor;
  providerEntityName: string;
  providerEventName: string;
  consumerEntity: Constructor;
  consumerEntityName: string;
  consumerEventName: string;
  providerTimeField: string;
  consumerTimeField: string;
  relationshipMappings: GrainRelationshipMappingIR[];
  name: string;
  selects: string;
}

export interface GrainRowIR {
  label: string;
  selects: string;
  pattern: GrainPattern;
  parameters: string;
  evidence: string;
}

export interface GrainNarrowingIR {
  name: string;
  selects: string;
  evidence: string;
}

export type GrainFactValue = string | number;

export interface GrainSuppliedIR {
  event: string;
  fields: Record<string, GrainFactValue>;
}

export interface GrainExpectedIR {
  selection: string;
  figures: string;
}

export interface GrainEntityIR {
  entity: Constructor;
  entityName: string;
  eventName: string;
  fields: string[];
  keys: string[];
  temporal:
    | { kind: "effective"; field: string }
    | { kind: "revision"; field: string }
    | null;
  relationships: GrainRelationshipIR[];
  permissions: GrainPermissionIR[];
}

export interface GrainModelIR {
  entities: GrainEntityIR[];
  world: GrainWorldEventIR[];
  relationships: GrainRelationshipIR[];
  fieldRows: GrainFieldsRowIR[];
  temporalJoins: GrainTemporalJoinIR[];
  narrowing: GrainNarrowingIR[];
  rows: GrainRowIR[];
  permissions: GrainPermissionIR[];
  supplied: GrainSuppliedIR[];
  expected: GrainExpectedIR[];
}

export interface GrainTranspileResult {
  model: GrainModelIR;
  markdown: string;
}
