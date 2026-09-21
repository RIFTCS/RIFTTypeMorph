import type { Constructor } from "../core/TSField";

export type TransformSourceRef = Constructor | string;

export type TransformInputKind =
  | "from"
  | "current"
  | "latest"
  | "previous"
  | "next"
  | "applicable"
  | "group";

export interface TransformInputBase {
  index: number;
  name: string;
  kind: TransformInputKind;
  source: TransformSourceRef;
}

export interface TransformFromInput extends TransformInputBase {
  kind: "from" | "current";
}

export interface TransformOrderedInput extends TransformInputBase {
  kind: "latest" | "previous" | "next";
  by?: string;
  per: string[];
}

export interface TransformApplicableInput extends TransformInputBase {
  kind: "applicable";
  to?: TransformSourceRef;
  without: string[];
}

export interface TransformGroupInput extends TransformInputBase {
  kind: "group";
  per: string[];
}

export type TransformInputIR =
  | TransformFromInput
  | TransformOrderedInput
  | TransformApplicableInput
  | TransformGroupInput;

export type TransformArithmeticOperator = "plus" | "less" | "times" | "over";
export type TransformCompareOperator = "<" | "<=" | ">" | ">=" | "=" | "!=";

export type TransformValueExpression =
  | { kind: "literal"; value: number | string | boolean | null }
  | { kind: "field"; input: string; field: string; optional: boolean }
  | {
      kind: "binary";
      operator: TransformArithmeticOperator;
      left: TransformValueExpression;
      right: TransformValueExpression;
    }
  | { kind: "coalesce"; values: TransformValueExpression[] }
  | {
      kind: "aggregate";
      operation: "plus" | "greater of" | "lesser of" | "count";
      input: string;
      field?: string;
      identity?: number;
    }
  | {
      kind: "operator";
      operation: string;
      args: TransformValueExpression[];
    };

export type TransformPredicateExpression =
  | { kind: "exists"; input: string }
  | {
      kind: "compare";
      operator: TransformCompareOperator;
      left: TransformValueExpression;
      right: TransformValueExpression;
    }
  | { kind: "and" | "or"; parts: TransformPredicateExpression[] }
  | { kind: "not"; predicate: TransformPredicateExpression };

export interface TransformOutputFieldIR {
  field: string;
  expression: TransformValueExpression;
}

export interface TransformIR {
  owner: Function;
  methodName: string;
  name: string;
  label: string;
  seed?: TransformSourceRef;
  identity: string[];
  inputs: TransformInputIR[];
  principalInput: string;
  guards: TransformPredicateExpression[];
  output: TransformOutputFieldIR[];
}

export interface TransformOperatorDefinition {
  codeName: string;
  operation: string;
  arity: 1 | 2;
  runtime: (...args: any[]) => any;
  foldable?: boolean;
  identity?: number;
}

export interface TransformCompilation {
  transforms: TransformIR[];
}
