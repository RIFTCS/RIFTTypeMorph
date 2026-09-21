import type { Constructor } from "../core/TSField";
import { grainEntityMetadata } from "./entityMetadata";
import type {
  GrainExpectedIR,
  GrainFieldsRowIR,
  GrainFactValue,
  GrainNarrowingIR,
  GrainPermissionIR,
  GrainRowIR,
  GrainSuppliedIR,
} from "./model";

export type GrainCompareOperator = "<" | "<=" | ">" | ">=" | "=";
export type GrainOrdering = "newest" | "first" | "last" | "next";

export type GrainSelection =
  | { node: "selection"; kind: "named"; name: string }
  | {
      node: "selection";
      kind: "madeBy";
      pattern: string;
      qualifiers: ReadonlyArray<readonly [string, GrainHow]>;
      source?: GrainSelection;
    }
  | {
      node: "selection";
      kind: "lineage";
      direction: "downstream" | "upstream";
      selection: GrainSelection;
      while?: GrainSelection;
    }
  | { node: "selection"; kind: "fieldEq"; field: string; value: GrainFactValue }
  | { node: "selection"; kind: "without"; field: string }
  | {
      node: "selection";
      kind: "compare";
      left: GrainTerm;
      op: GrainCompareOperator;
      right: GrainTerm;
    }
  | { node: "selection"; kind: "with"; selection: GrainSelection }
  | { node: "selection"; kind: "not"; selection: GrainSelection }
  | { node: "selection"; kind: "and" | "or"; parts: GrainSelection[] }
  | {
      node: "selection";
      kind: "ordered";
      which: GrainOrdering;
      field: string;
      selection: GrainSelection;
      per: string[];
    }
  | { node: "selection"; kind: "entry"; name: string }
  | { node: "selection"; kind: "raw"; text: string };

export type GrainTerm =
  | { node: "term"; kind: "number"; value: number; unit?: string }
  | { node: "term"; kind: "base" }
  | { node: "term"; kind: "their"; field: string }
  | { node: "term"; kind: "field"; field: string }
  | { node: "term"; kind: "selectionField"; field: string; selection: GrainSelection }
  | {
      node: "term";
      kind: "fold";
      operation: string;
      field: string;
      selection?: GrainSelection;
      per: string[];
    }
  | { node: "term"; kind: "entry"; name: string }
  | {
      node: "term";
      kind: "operator";
      operation: string;
      left: GrainTerm;
      right?: GrainTerm;
    }
  | { node: "term"; kind: "then"; places: GrainTerm[] }
  | { node: "term"; kind: "raw"; text: string };

export type GrainHow = GrainSelection | GrainTerm | string | number;

export interface GrainPermissionSide {
  kind: "selection" | "literal";
  selection?: GrainSelection;
  fields?: string[];
  literal?: string;
}

export interface GrainRuleSet {
  fieldRows: GrainFieldsRowIR[];
  permissions: GrainPermissionIR[];
  narrowing: GrainNarrowingIR[];
  rows: GrainRowIR[];
  supplied: GrainSuppliedIR[];
  expected: GrainExpectedIR[];
}

export interface GrainRuleSetInput {
  fieldRows?: readonly GrainFieldsRowIR[];
  permissions?: readonly GrainPermissionIR[];
  narrowing?: readonly GrainNarrowingIR[];
  rows?: readonly GrainRowIR[];
  supplied?: readonly GrainSuppliedIR[];
  expected?: readonly GrainExpectedIR[];
}

export type GrainExpectedFigures =
  | string
  | { count: number }
  | { field: string; value: number }
  | { keyed: ReadonlyArray<readonly [GrainFactValue, number]> }
  | null;

function normalise(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function renderValue(value: GrainFactValue): string {
  return String(value);
}

function isSelection(value: GrainHow): value is GrainSelection {
  return typeof value === "object" && value !== null && (value as GrainSelection).node === "selection";
}

function isTerm(value: GrainHow): value is GrainTerm {
  return typeof value === "object" && value !== null && (value as GrainTerm).node === "term";
}

export function renderGrainSelection(selection: GrainSelection, top = true): string {
  switch (selection.kind) {
    case "named":
      return `named ${selection.name}`;
    case "madeBy": {
      const head = selection.qualifiers.length
        ? `made by (${selection.pattern} and ${selection.qualifiers
            .map(([entry, value]) => `${entry}: ${renderGrainHow(value)}`)
            .join(" and ")})`
        : `made by ${selection.pattern}`;
      return selection.source
        ? `${head} from ${renderGrainSelection(selection.source, false)}`
        : head;
    }
    case "lineage": {
      const base = `${selection.direction} of ${renderGrainSelection(selection.selection, false)}`;
      return selection.while
        ? `${base} while ${renderGrainSelection(selection.while, false)}`
        : base;
    }
    case "fieldEq":
      return `${selection.field}: ${renderValue(selection.value)}`;
    case "without":
      return `without ${selection.field}`;
    case "compare":
      return `${renderGrainTerm(selection.left)} ${selection.op} ${renderGrainTerm(selection.right)}`;
    case "with":
      return `with ${renderGrainSelection(selection.selection, false)}`;
    case "not":
      return `not ${renderGrainSelection(selection.selection, false)}`;
    case "and":
    case "or": {
      const joiner = selection.kind === "and" ? " and " : " or ";
      const text = selection.parts.map((part) => renderGrainSelection(part, false)).join(joiner);
      return top ? text : `(${text})`;
    }
    case "ordered": {
      const per = selection.per.length ? ` per ${selection.per.join(" and ")}` : "";
      return `${selection.which} by ${selection.field} of ${renderGrainSelection(selection.selection, false)}${per}`;
    }
    case "entry":
      return selection.name;
    case "raw":
      return normalise(selection.text);
  }
}

export function renderGrainTerm(
  term: GrainTerm,
  parentOperation?: string,
  side?: "left" | "right"
): string {
  switch (term.kind) {
    case "number":
      return `${term.value}${term.unit ? ` ${term.unit}` : ""}`;
    case "base":
      return "base";
    case "their":
      return `their ${term.field}`;
    case "field":
      return term.field;
    case "selectionField":
      return `${term.field} of ${renderGrainSelection(term.selection, false)}`;
    case "fold": {
      const source = term.selection
        ? ` of ${renderGrainSelection(term.selection, false)}`
        : "";
      const per = term.per.length ? ` per ${term.per.join(" and ")}` : "";
      return `${term.operation} over ${term.field}${source}${per}`;
    }
    case "entry":
      return term.name;
    case "then": {
      const text = term.places.map((place) => renderGrainTerm(place)).join(" then ");
      return parentOperation ? `(${text})` : text;
    }
    case "operator": {
      if (!term.right) {
        return `${term.operation} of ${renderGrainTerm(term.left, term.operation, "left")}`;
      }
      const text = `${renderGrainTerm(term.left, term.operation, "left")} ${term.operation} ${renderGrainTerm(
        term.right,
        term.operation,
        "right"
      )}`;
      if (!parentOperation) return text;

      const product = term.operation === "times" || term.operation === "over";
      const parentProduct = parentOperation === "times" || parentOperation === "over";
      return (parentProduct && !product) || (product === parentProduct && side === "right")
        ? `(${text})`
        : text;
    }
    case "raw":
      return normalise(term.text);
  }
}

export function renderGrainHow(value: GrainHow): string {
  if (isSelection(value)) return renderGrainSelection(value);
  if (isTerm(value)) return renderGrainTerm(value);
  return String(value);
}

function permissionSideText(side: GrainPermissionSide): string {
  if (side.kind === "literal") {
    if (!side.literal) throw new Error("A literal Grain permission side requires a literal name.");
    return side.literal;
  }
  if (!side.selection) throw new Error("A selection Grain permission side requires a selection.");
  const head = renderGrainSelection(side.selection);
  return side.fields?.length ? `${head} on ${side.fields.join(", ")}` : head;
}

function entriesText(entries: ReadonlyArray<readonly [string, GrainHow]>): string {
  return entries.map(([name, value]) => `${name}: ${renderGrainHow(value)}`).join("; ");
}

function patternRow(
  label: string,
  selects: GrainSelection | null,
  pattern: GrainRowIR["pattern"],
  entries: ReadonlyArray<readonly [string, GrainHow]>,
  evidence = "declared by TypeMorph Grain DSL"
): GrainRowIR {
  return {
    label,
    selects: selects ? renderGrainSelection(selects) : "",
    pattern,
    parameters: entriesText(entries),
    evidence,
  };
}

function eventName(event: string | Constructor): string {
  return typeof event === "string" ? event : grainEntityMetadata(event).eventName;
}

function expectedFiguresText(figures: GrainExpectedFigures): string {
  if (figures === null) return "";
  if (typeof figures === "string") return normalise(figures);
  if ("count" in figures) return `count ${figures.count}`;
  if ("field" in figures) return `${figures.field} ${figures.value}`;
  return figures.keyed.map(([key, value]) => `${renderValue(key)} ${value}`).join("; ");
}

export function grainRules(input: GrainRuleSetInput = {}): GrainRuleSet {
  return {
    fieldRows: [...(input.fieldRows ?? [])],
    permissions: [...(input.permissions ?? [])],
    narrowing: [...(input.narrowing ?? [])],
    rows: [...(input.rows ?? [])],
    supplied: [...(input.supplied ?? [])],
    expected: [...(input.expected ?? [])],
  };
}

export const grain = {
  named(name: string): GrainSelection {
    return { node: "selection", kind: "named", name };
  },

  namedEvent(entity: Constructor): GrainSelection {
    return { node: "selection", kind: "named", name: grainEntityMetadata(entity).eventName };
  },

  madeBy(
    pattern: string,
    options: {
      qualifiers?: ReadonlyArray<readonly [string, GrainHow]>;
      from?: GrainSelection;
    } = {}
  ): GrainSelection {
    return {
      node: "selection",
      kind: "madeBy",
      pattern,
      qualifiers: [...(options.qualifiers ?? [])],
      source: options.from,
    };
  },

  downstreamOf(selection: GrainSelection, whileSelection?: GrainSelection): GrainSelection {
    return {
      node: "selection",
      kind: "lineage",
      direction: "downstream",
      selection,
      while: whileSelection,
    };
  },

  upstreamOf(selection: GrainSelection, whileSelection?: GrainSelection): GrainSelection {
    return {
      node: "selection",
      kind: "lineage",
      direction: "upstream",
      selection,
      while: whileSelection,
    };
  },

  eq(field: string, value: GrainFactValue): GrainSelection {
    return { node: "selection", kind: "fieldEq", field, value };
  },

  without(field: string): GrainSelection {
    return { node: "selection", kind: "without", field };
  },

  compare(left: GrainTerm, op: GrainCompareOperator, right: GrainTerm): GrainSelection {
    return { node: "selection", kind: "compare", left, op, right };
  },

  with(selection: GrainSelection): GrainSelection {
    return { node: "selection", kind: "with", selection };
  },

  not(selection: GrainSelection): GrainSelection {
    return { node: "selection", kind: "not", selection };
  },

  notWith(selection: GrainSelection): GrainSelection {
    return { node: "selection", kind: "not", selection: grain.with(selection) };
  },

  and(...parts: GrainSelection[]): GrainSelection {
    return { node: "selection", kind: "and", parts };
  },

  or(...parts: GrainSelection[]): GrainSelection {
    return { node: "selection", kind: "or", parts };
  },

  ordered(
    which: GrainOrdering,
    field: string,
    selection: GrainSelection,
    per: readonly string[] = []
  ): GrainSelection {
    return { node: "selection", kind: "ordered", which, field, selection, per: [...per] };
  },

  newest(field: string, selection: GrainSelection, per: readonly string[]): GrainSelection {
    return grain.ordered("newest", field, selection, per);
  },

  first(field: string, selection: GrainSelection, per: readonly string[]): GrainSelection {
    return grain.ordered("first", field, selection, per);
  },

  last(field: string, selection: GrainSelection, per: readonly string[]): GrainSelection {
    return grain.ordered("last", field, selection, per);
  },

  next(field: string, selection: GrainSelection): GrainSelection {
    return grain.ordered("next", field, selection, []);
  },

  selectionEntry(name: string): GrainSelection {
    return { node: "selection", kind: "entry", name };
  },

  rawSelection(text: string): GrainSelection {
    return { node: "selection", kind: "raw", text };
  },

  number(value: number, unit?: string): GrainTerm {
    return { node: "term", kind: "number", value, unit };
  },

  base(): GrainTerm {
    return { node: "term", kind: "base" };
  },

  their(field: string): GrainTerm {
    return { node: "term", kind: "their", field };
  },

  field(field: string): GrainTerm {
    return { node: "term", kind: "field", field };
  },

  fieldOf(field: string, selection: GrainSelection): GrainTerm {
    return { node: "term", kind: "selectionField", field, selection };
  },

  fold(
    operation: string,
    field: string,
    selection?: GrainSelection,
    per: readonly string[] = []
  ): GrainTerm {
    return { node: "term", kind: "fold", operation, field, selection, per: [...per] };
  },

  termEntry(name: string): GrainTerm {
    return { node: "term", kind: "entry", name };
  },

  op(operation: string, left: GrainTerm, right?: GrainTerm): GrainTerm {
    return { node: "term", kind: "operator", operation, left, right };
  },

  plus(left: GrainTerm, right: GrainTerm): GrainTerm {
    return grain.op("plus", left, right);
  },

  less(left: GrainTerm, right: GrainTerm): GrainTerm {
    return grain.op("less", left, right);
  },

  times(left: GrainTerm, right: GrainTerm): GrainTerm {
    return grain.op("times", left, right);
  },

  over(left: GrainTerm, right: GrainTerm): GrainTerm {
    return grain.op("over", left, right);
  },

  unary(operation: string, term: GrainTerm): GrainTerm {
    return grain.op(operation, term);
  },

  then(...places: GrainTerm[]): GrainTerm {
    return { node: "term", kind: "then", places };
  },

  rawTerm(text: string): GrainTerm {
    return { node: "term", kind: "raw", text };
  },

  side(selection: GrainSelection, ...fields: string[]): GrainPermissionSide {
    return { kind: "selection", selection, fields };
  },

  literalSide(literal: string): GrainPermissionSide {
    return { kind: "literal", literal };
  },

  fields(
    selection: GrainSelection,
    fields: readonly string[],
    evidence = "declared by TypeMorph Grain DSL"
  ): GrainFieldsRowIR {
    return {
      selects: renderGrainSelection(selection),
      fields: [...fields],
      evidence,
    };
  },

  permission(
    operation: string,
    side: GrainPermissionSide,
    options: {
      with?: GrainPermissionSide;
      landing?: GrainSelection;
      evidence?: string;
    } = {}
  ): GrainPermissionIR {
    const withText = options.with ? ` with ${permissionSideText(options.with)}` : "";
    const landingText = options.landing
      ? ` -> ${renderGrainSelection(options.landing)}`
      : "";
    return {
      operation,
      on: `${permissionSideText(side)}${withText}${landingText}`,
      evidence: options.evidence ?? "declared by TypeMorph Grain DSL",
    };
  },

  word(
    name: string,
    selection: GrainSelection,
    evidence = "declared by TypeMorph Grain DSL"
  ): GrainNarrowingIR {
    return { name, selects: renderGrainSelection(selection), evidence };
  },

  workOut(
    label: string,
    selects: GrainSelection,
    entries: Readonly<Record<string, GrainHow>> = {},
    evidence?: string
  ): GrainRowIR {
    return patternRow(label, selects, "work out", Object.entries(entries), evidence);
  },

  group(
    label: string,
    selects: GrainSelection,
    per: readonly string[],
    entries: Readonly<Record<string, GrainTerm>>,
    evidence?: string
  ): GrainRowIR {
    return patternRow(
      label,
      selects,
      "group",
      [["per", per.join(" and ")], ...Object.entries(entries)],
      evidence
    );
  },

  accountFor(
    label: string,
    selects: GrainSelection,
    figure: GrainSelection,
    evidence?: string
  ): GrainRowIR {
    return patternRow(label, selects, "account for", [["figure", figure]], evidence);
  },

  differ(
    label: string,
    selects: GrainSelection | null,
    entries: { left: GrainTerm; right: GrainTerm; apart: GrainTerm },
    evidence?: string
  ): GrainRowIR {
    return patternRow(
      label,
      selects,
      "differ",
      [
        ["left", entries.left],
        ["right", entries.right],
        ["apart", entries.apart],
      ],
      evidence
    );
  },

  spread(
    label: string,
    selects: GrainSelection,
    entries: {
      by: string;
      factors?: GrainSelection;
      differences?: GrainSelection;
      removals?: GrainSelection;
      only?: string;
    },
    evidence?: string
  ): GrainRowIR {
    const values: Array<readonly [string, GrainHow]> = [["by", entries.by]];
    if (entries.factors) values.push(["factors", entries.factors]);
    if (entries.differences) values.push(["differences", entries.differences]);
    if (entries.removals) values.push(["removals", entries.removals]);
    if (entries.only) values.push(["only", entries.only]);
    return patternRow(label, selects, "spread", values, evidence);
  },

  override(
    label: string,
    entries: {
      by: string;
      factors?: GrainSelection;
      differences?: GrainSelection;
      replacements?: GrainSelection;
      removals?: GrainSelection;
      only?: string;
    },
    options: { selects?: GrainSelection; evidence?: string } = {}
  ): GrainRowIR {
    const values: Array<readonly [string, GrainHow]> = [["by", entries.by]];
    if (entries.factors) values.push(["factors", entries.factors]);
    if (entries.differences) values.push(["differences", entries.differences]);
    if (entries.replacements) values.push(["replacements", entries.replacements]);
    if (entries.removals) values.push(["removals", entries.removals]);
    if (entries.only) values.push(["only", entries.only]);
    return patternRow(label, options.selects ?? null, "override", values, options.evidence);
  },

  supplied(event: string | Constructor, fields: Record<string, GrainFactValue>): GrainSuppliedIR {
    return { event: eventName(event), fields: { ...fields } };
  },

  expected(selection: GrainSelection, figures: GrainExpectedFigures): GrainExpectedIR {
    return { selection: renderGrainSelection(selection), figures: expectedFiguresText(figures) };
  },

  typedField<T extends Constructor, K extends Extract<keyof InstanceType<T>, string>>(
    _entity: T,
    field: K
  ): K {
    return field;
  },
};
