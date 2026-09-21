import type { Constructor } from "../core/TSField";
import { describeClass } from "../core/introspection";
import { ER_ANNOTATION_NAMESPACE, type MeasureOptions, type ScalarTypeOptions } from "../decorators/entityDecorators";
import { RIFTError } from "../utils/errors";
import { grain, grainRules, type GrainHow, type GrainPermissionSide, type GrainRuleSet, type GrainSelection, type GrainTerm } from "./dsl";
import type { GrainEntityIR, GrainModelIR, GrainPermissionIR } from "./model";
import { inferGrainModel } from "./transpile";
import type {
  TransformCompilation,
  TransformInputIR,
  TransformIR,
  TransformPredicateExpression,
  TransformSourceRef,
  TransformValueExpression,
} from "../transforms/model";
import { getTransformOperatorByOperation } from "../transforms/runtime";

function entityForSource(model: GrainModelIR, source: TransformSourceRef): GrainEntityIR | undefined {
  if (typeof source === "string") return undefined;
  return model.entities.find((entity) => entity.entity === source);
}

function sourceSelection(model: GrainModelIR, source: TransformSourceRef): GrainSelection {
  if (typeof source === "string") return grain.named(source);
  const entity = entityForSource(model, source);
  if (!entity) {
    throw new RIFTError(`${source.name} was referenced by a transform but was not included in the Grain entity model.`);
  }
  return grain.named(entity.eventName);
}

function orderedCoordinates(
  model: GrainModelIR,
  input: Extract<TransformInputIR, { kind: "latest" | "previous" | "next" }>
): { by: string; per: string[] } {
  if (typeof input.source === "string") {
    if (!input.by) {
      throw new RIFTError(`@${input.kind}('${input.source}') requires an explicit 'by' field.`);
    }
    return { by: input.by, per: [...input.per] };
  }

  const entity = entityForSource(model, input.source);
  if (!entity) throw new RIFTError(`${input.source.name} was not included in the Grain entity model.`);
  const by = input.by ?? entity.temporal?.field;
  if (!by) {
    throw new RIFTError(
      `${entity.entityName} has no temporal coordinate. Supply { by: "..." } to @${input.kind}(...).`
    );
  }
  const per = input.per.length ? [...input.per] : entity.keys.filter((field) => field !== by);
  return { by, per };
}

function principalEntity(transform: TransformIR, model: GrainModelIR): GrainEntityIR | undefined {
  const principal = transform.inputs.find((input) => input.name === transform.principalInput);
  if (!principal || typeof principal.source === "string") return undefined;
  return entityForSource(model, principal.source);
}

function relationshipSelection(
  provider: GrainEntityIR,
  consumer: GrainEntityIR,
  without: readonly string[],
  model: GrainModelIR
): GrainSelection {
  const parts: GrainSelection[] = [grain.named(provider.eventName)];
  for (const field of without) parts.push(grain.without(field));

  for (const relationship of provider.relationships) {
    if (without.includes(relationship.sourceField)) continue;
    const consumerMatches = consumer.relationships.filter(
      (candidate) =>
        candidate.targetEntity === relationship.targetEntity &&
        candidate.targetField === relationship.targetField
    );
    if (consumerMatches.length > 1) {
      throw new RIFTError(
        `Transform applicability from ${provider.entityName} to ${consumer.entityName} is ambiguous through ` +
          `${relationship.targetEntityName}.${relationship.targetField}.`
      );
    }
    const match = consumerMatches[0];
    if (match && match.sourceField !== relationship.sourceField) {
      parts.push(
        grain.compare(
          grain.field(relationship.sourceField),
          "=",
          grain.their(match.sourceField)
        )
      );
    }
  }

  if (provider.temporal && consumer.temporal) {
    parts.push(
      grain.compare(
        grain.field(provider.temporal.field),
        "<=",
        grain.their(consumer.temporal.field)
      )
    );
    const inside = parts.length === 1 ? parts[0] : grain.and(...parts);
    const per = provider.keys.filter(
      (field) => field !== provider.temporal!.field && !without.includes(field)
    );
    return grain.newest(provider.temporal.field, inside, per);
  }

  const matchingJoin = model.temporalJoins.find(
    (join) => join.providerEntity === provider.entity && join.consumerEntity === consumer.entity
  );
  if (matchingJoin && !without.length) return grain.named(matchingJoin.name);
  return parts.length === 1 ? parts[0] : grain.and(...parts);
}

function inputSelection(input: TransformInputIR, transform: TransformIR, model: GrainModelIR): GrainSelection {
  switch (input.kind) {
    case "from":
      return sourceSelection(model, input.source);
    case "current": {
      if (typeof input.source === "string") return grain.named(input.source);
      const entity = entityForSource(model, input.source);
      if (!entity) throw new RIFTError(`${input.source.name} was not included in the Grain entity model.`);
      if (!entity.temporal) {
        throw new RIFTError(`@Current(${entity.entityName}) requires an effective or revision coordinate.`);
      }
      return grain.named(`current ${entity.entityName}`);
    }
    case "latest": {
      const base = sourceSelection(model, input.source);
      const { by, per } = orderedCoordinates(model, input);
      return grain.newest(by, base, per);
    }
    case "previous": {
      const base = sourceSelection(model, input.source);
      const { by, per } = orderedCoordinates(model, input);
      return grain.newest(
        by,
        grain.and(base, grain.compare(grain.field(by), "<", grain.their(by))),
        per
      );
    }
    case "next": {
      const base = sourceSelection(model, input.source);
      const { by, per } = orderedCoordinates(model, input);
      return grain.ordered("next", by, base, per);
    }
    case "applicable": {
      if (typeof input.source === "string") {
        const base = grain.named(input.source);
        return input.without.length
          ? grain.and(base, ...input.without.map((field) => grain.without(field)))
          : base;
      }
      const provider = entityForSource(model, input.source);
      if (!provider) throw new RIFTError(`${input.source.name} was not included in the Grain entity model.`);

      let consumer: GrainEntityIR | undefined;
      if (input.to && typeof input.to !== "string") {
        consumer = entityForSource(model, input.to);
      } else {
        consumer = principalEntity(transform, model);
      }
      if (!consumer) {
        const base = grain.named(provider.eventName);
        return input.without.length
          ? grain.and(base, ...input.without.map((field) => grain.without(field)))
          : base;
      }
      return relationshipSelection(provider, consumer, input.without, model);
    }
    case "group":
      return sourceSelection(model, input.source);
  }
}

function literalTerm(value: number | string | boolean | null): GrainTerm {
  if (typeof value === "number") return grain.number(value);
  if (typeof value === "string") return grain.rawTerm(value);
  if (typeof value === "boolean") return grain.rawTerm(value ? "true" : "false");
  return grain.rawTerm("null");
}

function valueTerm(
  expression: TransformValueExpression,
  transform: TransformIR,
  model: GrainModelIR
): GrainTerm {
  switch (expression.kind) {
    case "literal":
      return literalTerm(expression.value);
    case "field": {
      const input = transform.inputs.find((candidate) => candidate.name === expression.input)!;
      if (expression.input === transform.principalInput) return grain.field(expression.field);
      return grain.fieldOf(expression.field, inputSelection(input, transform, model));
    }
    case "binary":
      return grain.op(
        expression.operator,
        valueTerm(expression.left, transform, model),
        valueTerm(expression.right, transform, model)
      );
    case "coalesce":
      return grain.then(...expression.values.map((value) => valueTerm(value, transform, model)));
    case "operator": {
      const args = expression.args.map((arg) => valueTerm(arg, transform, model));
      return grain.op(expression.operation, args[0], args[1]);
    }
    case "aggregate": {
      if (expression.operation === "count") {
        throw new RIFTError(
          "count(group) is executable natively but Grain lowering does not yet have a canonical count fold."
        );
      }
      if (!expression.field) throw new RIFTError(`${expression.operation} aggregate requires a field.`);
      const input = transform.inputs.find((candidate) => candidate.name === expression.input)!;
      const source = expression.input === transform.principalInput ? undefined : inputSelection(input, transform, model);
      return grain.fold(expression.operation, expression.field, source);
    }
  }
}

function invertCompare(operator: string): "<" | "<=" | ">" | ">=" | "=" | null {
  switch (operator) {
    case "<": return ">=";
    case "<=": return ">";
    case ">": return "<=";
    case ">=": return "<";
    case "=": return null;
    case "!=": return "=";
    default: return null;
  }
}

function predicateSelection(
  predicate: TransformPredicateExpression,
  transform: TransformIR,
  model: GrainModelIR
): GrainSelection {
  switch (predicate.kind) {
    case "exists": {
      const input = transform.inputs.find((candidate) => candidate.name === predicate.input)!;
      return grain.with(inputSelection(input, transform, model));
    }
    case "compare": {
      const comparison = grain.compare(
        valueTerm(predicate.left, transform, model),
        predicate.operator === "!=" ? "=" : predicate.operator,
        valueTerm(predicate.right, transform, model)
      );
      return predicate.operator === "!=" ? grain.not(comparison) : comparison;
    }
    case "and":
      return grain.and(...predicate.parts.map((part) => predicateSelection(part, transform, model)));
    case "or":
      return grain.or(...predicate.parts.map((part) => predicateSelection(part, transform, model)));
    case "not": {
      const inner = predicate.predicate;
      if (inner.kind === "exists") {
        const input = transform.inputs.find((candidate) => candidate.name === inner.input)!;
        return grain.notWith(inputSelection(input, transform, model));
      }
      if (inner.kind === "compare") {
        const inverse = invertCompare(inner.operator);
        if (inverse) {
          return grain.compare(
            valueTerm(inner.left, transform, model),
            inverse,
            valueTerm(inner.right, transform, model)
          );
        }
      }
      return grain.not(predicateSelection(inner, transform, model));
    }
  }
}

function predicateConjuncts(
  predicate: TransformPredicateExpression,
  transform: TransformIR,
  model: GrainModelIR
): GrainSelection[] {
  if (predicate.kind === "and") {
    return predicate.parts.flatMap((part) => predicateConjuncts(part, transform, model));
  }
  return [predicateSelection(predicate, transform, model)];
}

function outputHow(
  expression: TransformValueExpression,
  transform: TransformIR,
  model: GrainModelIR
): GrainHow {
  if (expression.kind === "field") {
    const input = transform.inputs.find((candidate) => candidate.name === expression.input)!;
    if (input.kind === "next") {
      const { by } = orderedCoordinates(model, input);
      if (expression.field === by) return inputSelection(input, transform, model);
    }
  }
  return valueTerm(expression, transform, model);
}

function literalPermission(value: number | string | boolean | null): GrainPermissionSide {
  if (typeof value === "number") return grain.literalSide("number");
  if (typeof value === "string") return grain.literalSide("text");
  if (typeof value === "boolean") return grain.literalSide("boolean");
  return grain.literalSide("null");
}

function expressionSide(
  expression: TransformValueExpression,
  outputField: string,
  transform: TransformIR,
  model: GrainModelIR
): GrainPermissionSide {
  switch (expression.kind) {
    case "literal":
      return literalPermission(expression.value);
    case "field": {
      const input = transform.inputs.find((candidate) => candidate.name === expression.input)!;
      return grain.side(inputSelection(input, transform, model), expression.field);
    }
    case "coalesce":
      return expressionSide(expression.values[0], outputField, transform, model);
    case "aggregate": {
      const input = transform.inputs.find((candidate) => candidate.name === expression.input)!;
      return expression.field
        ? grain.side(inputSelection(input, transform, model), expression.field)
        : grain.side(grain.named(transform.name), outputField);
    }
    case "binary":
    case "operator":
      return grain.side(grain.named(transform.name), outputField);
  }
}

function expressionSides(
  expression: TransformValueExpression,
  outputField: string,
  transform: TransformIR,
  model: GrainModelIR
): GrainPermissionSide[] {
  if (expression.kind === "coalesce") {
    return expression.values.flatMap((value) =>
      expressionSides(value, outputField, transform, model)
    );
  }
  return [expressionSide(expression, outputField, transform, model)];
}

function pushExpressionPermissions(
  permissions: GrainPermissionIR[],
  expression: TransformValueExpression,
  outputField: string,
  transform: TransformIR,
  model: GrainModelIR
): void {
  if (expression.kind === "binary") {
    const leftSides = expressionSides(expression.left, outputField, transform, model);
    const rightSides = expressionSides(expression.right, outputField, transform, model);
    for (const left of leftSides) {
      for (const right of rightSides) {
        permissions.push(
          grain.permission(expression.operator, left, {
            with: right,
            landing: grain.named(transform.name),
            evidence: "inferred from executable TypeMorph transform expression",
          })
        );
      }
    }
    pushExpressionPermissions(permissions, expression.left, outputField, transform, model);
    pushExpressionPermissions(permissions, expression.right, outputField, transform, model);
    return;
  }
  if (expression.kind === "operator") {
    const definition = getTransformOperatorByOperation(expression.operation);
    const leftSides = expressionSides(expression.args[0], outputField, transform, model);
    const rightSides = expression.args[1]
      ? expressionSides(expression.args[1], outputField, transform, model)
      : [undefined];
    for (const left of leftSides) {
      for (const right of rightSides) {
        permissions.push(
          grain.permission(expression.operation, left, {
            with: right,
            landing: grain.named(transform.name),
            evidence: definition?.foldable
              ? `inferred from executable transform operator; foldable${definition.identity !== undefined ? `, identity ${definition.identity}` : ""}`
              : "inferred from executable TypeMorph transform operator",
          })
        );
      }
    }
    for (const arg of expression.args) pushExpressionPermissions(permissions, arg, outputField, transform, model);
    return;
  }
  if (expression.kind === "coalesce") {
    for (const value of expression.values) pushExpressionPermissions(permissions, value, outputField, transform, model);
    return;
  }
  if (expression.kind === "aggregate" && expression.operation !== "count" && expression.field) {
    const input = transform.inputs.find((candidate) => candidate.name === expression.input)!;
    const side = grain.side(inputSelection(input, transform, model), expression.field);
    if (expression.operation !== "plus" && expression.identity === undefined) {
      throw new RIFTError(
        `${expression.operation} aggregate in transform '${transform.name}' needs an explicit numeric identity for Grain folding.`
      );
    }
    permissions.push(
      grain.permission(expression.operation, side, {
        with: side,
        landing: grain.named(transform.name),
        evidence:
          expression.operation === "plus"
            ? "inferred from executable grouped sum"
            : `inferred from executable grouped ${expression.operation}; foldable, identity ${expression.identity}`,
      })
    );
  }
}

function lastAnnotationValue<T>(
  annotations: readonly { namespace: string; name: string; value: unknown }[],
  name: string
): T | undefined {
  const matches = annotations.filter(
    (annotation) => annotation.namespace === ER_ANNOTATION_NAMESPACE && annotation.name === name
  );
  return matches[matches.length - 1]?.value as T | undefined;
}

function literalForInputField(
  input: TransformInputIR,
  field: string
): string | undefined {
  if (typeof input.source === "string") return undefined;
  const description = describeClass(input.source);
  const described = description.fields[field];
  if (!described) return undefined;

  const measure = lastAnnotationValue<MeasureOptions>(described.annotations, "measure");
  if (measure?.literal) return measure.literal;

  const instantiator = described.schema.instantiator;
  if (instantiator === Number) return "number";
  if (instantiator === String) return "text";
  if (instantiator === Date) return "date";
  if (typeof instantiator === "function") {
    const scalar = lastAnnotationValue<ScalarTypeOptions>(
      describeClass(instantiator as Constructor).annotations,
      "scalarType"
    );
    if (scalar?.literal) return scalar.literal;
  }
  return undefined;
}

function comparePermissionsForValue(
  expression: TransformValueExpression,
  transform: TransformIR,
  model: GrainModelIR
): GrainPermissionIR[] {
  if (expression.kind === "field") {
    const input = transform.inputs.find((candidate) => candidate.name === expression.input)!;
    const literal = literalForInputField(input, expression.field);
    if (!literal) return [];
    return [
      grain.permission("compare", grain.side(inputSelection(input, transform, model), expression.field), {
        with: grain.literalSide(literal),
        evidence: "inferred from executable TypeMorph transform guard",
      }),
    ];
  }
  if (expression.kind === "coalesce") {
    return expression.values.flatMap((value) => comparePermissionsForValue(value, transform, model));
  }
  return [];
}

function pushPredicatePermissions(
  permissions: GrainPermissionIR[],
  predicate: TransformPredicateExpression,
  transform: TransformIR,
  model: GrainModelIR
): void {
  if (predicate.kind === "compare") {
    const inferred = [
      ...comparePermissionsForValue(predicate.left, transform, model),
      ...comparePermissionsForValue(predicate.right, transform, model),
    ];
    if (inferred.length) {
      permissions.push(...inferred);
    } else {
      permissions.push(
        grain.permission("compare", expressionSide(predicate.left, "amount", transform, model), {
          with: expressionSide(predicate.right, "amount", transform, model),
          evidence: "inferred from executable TypeMorph transform guard",
        })
      );
    }
    return;
  }
  if (predicate.kind === "and" || predicate.kind === "or") {
    for (const part of predicate.parts) pushPredicatePermissions(permissions, part, transform, model);
    return;
  }
  if (predicate.kind === "not") {
    pushPredicatePermissions(permissions, predicate.predicate, transform, model);
  }
}

function lowerTransform(transform: TransformIR, model: GrainModelIR): GrainRuleSet {
  const principal = transform.inputs.find((input) => input.name === transform.principalInput)!;
  let selects = inputSelection(principal, transform, model);
  if (transform.guards.length) {
    selects = grain.and(
      selects,
      ...transform.guards.flatMap((guard) => predicateConjuncts(guard, transform, model))
    );
  }

  const entries = Object.fromEntries(
    transform.output.map((output) => [output.field, outputHow(output.expression, transform, model)])
  );
  const pattern = principal.kind === "group" ? "group" : "work out";
  const rows =
    principal.kind === "group"
      ? [
          grain.group(
            transform.label,
            selects,
            principal.per,
            Object.fromEntries(
              transform.output.map((output) => [
                output.field,
                valueTerm(output.expression, transform, model),
              ])
            )
          ),
        ]
      : [grain.workOut(transform.label, selects, entries)];

  const produced = grain.madeBy(pattern, {
    from: transform.seed ? grain.named(transform.name) : selects,
  });
  const wordSelection = transform.seed
    ? grain.or(sourceSelection(model, transform.seed), produced)
    : produced;

  const permissions: GrainPermissionIR[] = [];
  if (principal.kind === "group") {
    permissions.push(
      grain.permission("identity", grain.side(inputSelection(principal, transform, model), ...principal.per), {
        evidence: "inferred from executable transform grouping coordinates",
      })
    );
  }
  for (const output of transform.output) {
    pushExpressionPermissions(permissions, output.expression, output.field, transform, model);
  }
  for (const guard of transform.guards) pushPredicatePermissions(permissions, guard, transform, model);
  if (transform.identity.length) {
    const qualifiers = transform.identity.map((field) => {
      const output = transform.output.find((candidate) => candidate.field === field);
      if (!output) {
        throw new RIFTError(
          `Transform '${transform.name}' declares identity field '${field}' but does not return it.`
        );
      }
      return [field, outputHow(output.expression, transform, model)] as const;
    });
    permissions.push(
      grain.permission(
        "identity",
        grain.side(grain.madeBy(pattern, { qualifiers }), ...transform.identity),
        { evidence: "inferred from executable transform identity metadata" }
      )
    );
  }

  return grainRules({
    permissions,
    narrowing: [grain.word(transform.name, wordSelection, "inferred from executable TypeMorph transform")],
    rows,
  });
}

function mergeRuleSets(ruleSets: readonly GrainRuleSet[]): GrainRuleSet {
  return grainRules({
    fieldRows: ruleSets.flatMap((rules) => rules.fieldRows),
    permissions: ruleSets.flatMap((rules) => rules.permissions),
    narrowing: ruleSets.flatMap((rules) => rules.narrowing),
    rows: ruleSets.flatMap((rules) => rules.rows),
    supplied: ruleSets.flatMap((rules) => rules.supplied),
    expected: ruleSets.flatMap((rules) => rules.expected),
  });
}

export function lowerTransformsToGrainRules(
  entities: readonly Constructor[],
  compilation: TransformCompilation
): GrainRuleSet {
  const model = inferGrainModel(entities);
  return mergeRuleSets(compilation.transforms.map((transform) => lowerTransform(transform, model)));
}
