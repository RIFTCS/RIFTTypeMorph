import type { Constructor } from "../core/TSField";

export type GrainArithmeticOperation = "plus" | "less" | "times" | "over";

export interface GrainWorldEventIR {
  entity: Constructor;
  entityName: string;
  eventName: string;
  fields: string[];
}

export interface GrainPermissionIR {
  operation: "identity" | "compare" | GrainArithmeticOperation;
  on: string;
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
  pattern: "work out";
  parameters: string;
  evidence: string;
}

export interface GrainNarrowingIR {
  name: string;
  selects: string;
  evidence: string;
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
  temporalJoins: GrainTemporalJoinIR[];
  narrowing: GrainNarrowingIR[];
  rows: GrainRowIR[];
  permissions: GrainPermissionIR[];
}

export interface GrainTranspileResult {
  model: GrainModelIR;
  markdown: string;
}
