import { RIFTAnnotation } from "../core/annotations";
import { describeClass, DescribedField, TypeMorphClassDescription } from "../core/introspection";
import type { Constructor } from "../core/TSField";
import type { GrainRuleSet } from "./dsl";
import { grainEntityMetadata } from "./entityMetadata";
import { TSType } from "../core/TSType";
import {
  AppliesToOptions,
  ER_ANNOTATION_NAMESPACE,
  MeasureOptions,
  ReferenceOptions,
  ScalarTypeOptions,
} from "../decorators/entityDecorators";
import { RIFTError } from "../utils/errors";
import {
  GrainArithmeticOperation,
  GrainEntityIR,
  GrainModelIR,
  GrainNarrowingIR,
  GrainPermissionIR,
  GrainRelationshipIR,
  GrainRelationshipMappingIR,
  GrainRowIR,
  GrainTemporalJoinIR,
  GrainTranspileResult,
  GrainExpectedIR,
  GrainFieldsRowIR,
  GrainSuppliedIR,
} from "./model";

interface ScalarCapabilities {
  literal: string;
  ordered: boolean;
  operations: GrainArithmeticOperation[];
}

interface LoweredModelParts {
  temporalJoins: GrainTemporalJoinIR[];
  narrowing: GrainNarrowingIR[];
  rows: GrainRowIR[];
  permissions: GrainPermissionIR[];
}

function annotationsNamed(annotations: RIFTAnnotation[], name: string): RIFTAnnotation[] {
  return annotations.filter(
    (annotation) => annotation.namespace === ER_ANNOTATION_NAMESPACE && annotation.name === name
  );
}

function hasAnnotation(field: DescribedField, name: string): boolean {
  return annotationsNamed(field.annotations, name).length > 0;
}

function lastAnnotationValue<T>(annotations: RIFTAnnotation[], name: string): T | undefined {
  const matches = annotationsNamed(annotations, name);
  return matches[matches.length - 1]?.value as T | undefined;
}

function annotationValues<T>(annotations: RIFTAnnotation[], name: string): T[] {
  return annotationsNamed(annotations, name).map((annotation) => annotation.value as T);
}

function entityNameOf(description: TypeMorphClassDescription): string {
  return grainEntityMetadata(description.ctor).name;
}

function scalarCapabilities(field: DescribedField): ScalarCapabilities | null {
  if (field.schema.fieldType !== TSType.Value) return null;

  const measure = lastAnnotationValue<MeasureOptions>(field.annotations, "measure");
  const explicitlyOrdered = hasAnnotation(field, "ordered");
  const instantiator = field.schema.instantiator;

  let literal: string | null = measure?.literal ?? measure?.unit ?? null;
  let ordered = measure ? (measure.ordered ?? true) : explicitlyOrdered;
  let operations: GrainArithmeticOperation[] = [...(measure?.operations ?? [])];

  if (instantiator === Number) {
    literal = literal ?? "number";
  } else if (instantiator === String) {
    literal = literal ?? "text";
  } else if (instantiator === Date) {
    literal = literal ?? "date";
  } else if (typeof instantiator === "function") {
    const scalar = lastAnnotationValue<ScalarTypeOptions>(
      describeClass(instantiator as Constructor).annotations,
      "scalarType"
    );

    if (scalar) {
      literal = literal ?? scalar.literal;
      ordered = measure?.ordered ?? (explicitlyOrdered || scalar.ordered === true);
      if (!measure?.operations) {
        operations = [...(scalar.operations ?? [])];
      }
    }
  }

  if (!literal) return null;
  return { literal, ordered, operations };
}

function permissionKey(permission: GrainPermissionIR): string {
  return `${permission.operation}\u0000${permission.on}`;
}

function dedupePermissions(permissions: GrainPermissionIR[]): GrainPermissionIR[] {
  const seen = new Set<string>();
  const result: GrainPermissionIR[] = [];

  for (const permission of permissions) {
    const key = permissionKey(permission);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(permission);
  }

  return result;
}

function keyFields(description: TypeMorphClassDescription): string[] {
  return Object.keys(description.fields).filter((fieldName) =>
    hasAnnotation(description.fields[fieldName], "key")
  );
}

function resolveRelationship(
  source: TypeMorphClassDescription,
  sourceEntityName: string,
  sourceField: string,
  reference: ReferenceOptions
): GrainRelationshipIR {
  const targetDescription = describeClass(reference.target);
  const targetEntityName = entityNameOf(targetDescription);
  const targetKeys = keyFields(targetDescription);

  let targetField = reference.targetField;
  if (targetField) {
    const describedTargetField = targetDescription.fields[targetField];
    if (!describedTargetField) {
      throw new RIFTError(
        `${source.name}.${sourceField} references ${targetDescription.name}.${targetField}, but that target field does not exist.`
      );
    }
    if (!hasAnnotation(describedTargetField, "key")) {
      throw new RIFTError(
        `${source.name}.${sourceField} references ${targetDescription.name}.${targetField}, but the target field is not an @Key().`
      );
    }
  } else if (targetKeys.length === 1) {
    targetField = targetKeys[0];
  } else if (targetKeys.length === 0) {
    throw new RIFTError(
      `${source.name}.${sourceField} references ${targetDescription.name}, but the target entity has no @Key().`
    );
  } else {
    throw new RIFTError(
      `${source.name}.${sourceField} references compound-key entity ${targetDescription.name}. ` +
      "Specify @Reference(Target, { targetField: \"...\" }) for each foreign-key field."
    );
  }

  const sourceScalar = scalarCapabilities(source.fields[sourceField]);
  const targetScalar = scalarCapabilities(targetDescription.fields[targetField]);
  if (sourceScalar && targetScalar && sourceScalar.literal !== targetScalar.literal) {
    throw new RIFTError(
      `${source.name}.${sourceField} (${sourceScalar.literal}) cannot reference ` +
      `${targetDescription.name}.${targetField} (${targetScalar.literal}); the scalar representations differ.`
    );
  }

  return {
    sourceEntity: source.ctor,
    sourceEntityName,
    sourceField,
    targetEntity: reference.target,
    targetEntityName,
    targetField,
  };
}

function lowerEntity(ctor: Constructor): GrainEntityIR {
  const description = describeClass(ctor);
  const entityMetadata = grainEntityMetadata(ctor);
  const entityName = entityMetadata.name;
  const eventName = entityMetadata.eventName;
  const fields = Object.keys(description.fields);

  for (const fieldName of fields) {
    const field = description.fields[fieldName];
    if (field.schema.fieldType !== TSType.Value) {
      throw new RIFTError(
        `${description.name}.${fieldName} is ${TSType[field.schema.fieldType]}; Grain event inference currently requires scalar TSType.Value fields. ` +
        "Declare an explicit component/reference lowering before transpiling nested objects or arrays."
      );
    }
  }

  const keys = keyFields(description);
  const effective = fields.filter((fieldName) =>
    hasAnnotation(description.fields[fieldName], "effectiveAt")
  );
  const revisions = fields.filter((fieldName) =>
    hasAnnotation(description.fields[fieldName], "revisionAt")
  );

  if (effective.length > 1) {
    throw new RIFTError(`${description.name} has more than one @EffectiveAt() field.`);
  }
  if (revisions.length > 1) {
    throw new RIFTError(`${description.name} has more than one @RevisionAt() field.`);
  }
  if (effective.length && revisions.length) {
    throw new RIFTError(
      `${description.name} cannot use both @EffectiveAt() and @RevisionAt(); choose one history model.`
    );
  }

  const temporal = effective.length
    ? ({ kind: "effective", field: effective[0] } as const)
    : revisions.length
      ? ({ kind: "revision", field: revisions[0] } as const)
      : null;

  if (temporal) {
    const temporalCapabilities = scalarCapabilities(description.fields[temporal.field]);
    if (!temporalCapabilities) {
      throw new RIFTError(
        `${description.name}.${temporal.field} is a ${temporal.kind} coordinate but has no inferable Grain literal representation. ` +
        "Use a typed @Field(..., Date/Number/String), @Measure({ literal: ... }), or @ScalarType(...)."
      );
    }
  }

  const relationships: GrainRelationshipIR[] = [];
  for (const fieldName of fields) {
    const references = annotationValues<ReferenceOptions>(
      description.fields[fieldName].annotations,
      "reference"
    );
    if (references.length > 1) {
      throw new RIFTError(
        `${description.name}.${fieldName} has more than one @Reference(); a field can identify one target key only.`
      );
    }
    if (references.length === 1) {
      relationships.push(resolveRelationship(description, entityName, fieldName, references[0]));
    }
  }

  const identityFields = [...keys];
  if (temporal && !identityFields.includes(temporal.field)) {
    identityFields.push(temporal.field);
  }

  const permissions: GrainPermissionIR[] = [];

  if (identityFields.length) {
    permissions.push({
      operation: "identity",
      on: `made by world on ${identityFields.join(", ")}`,
      evidence: "inferred from TypeMorph ER identity metadata",
    });
  }

  for (const fieldName of fields) {
    const field = description.fields[fieldName];
    const scalar = scalarCapabilities(field);
    if (!scalar) continue;

    const isTemporalCoordinate = temporal?.field === fieldName;
    if (scalar.ordered || isTemporalCoordinate) {
      permissions.push({
        operation: "compare",
        on: `named ${eventName} on ${fieldName} with ${scalar.literal}`,
        evidence: "inferred from TypeMorph scalar ordering metadata",
      });
    }

    for (const operation of scalar.operations) {
      permissions.push({
        operation,
        on: `named ${eventName} on ${fieldName} with ${scalar.literal} -> named ${eventName}`,
        evidence: "inferred from TypeMorph scalar operation metadata",
      });
    }
  }

  return {
    entity: ctor,
    entityName,
    eventName,
    fields,
    keys,
    temporal,
    relationships,
    permissions: dedupePermissions(permissions),
  };
}

function relationshipMapping(
  provider: GrainEntityIR,
  consumer: GrainEntityIR
): GrainRelationshipMappingIR[] {
  const mappings: GrainRelationshipMappingIR[] = [];

  for (const providerRelationship of provider.relationships) {
    if (!provider.keys.includes(providerRelationship.sourceField)) continue;

    const matches = consumer.relationships.filter(
      (candidate) =>
        candidate.targetEntity === providerRelationship.targetEntity &&
        candidate.targetField === providerRelationship.targetField
    );

    if (matches.length === 0) {
      throw new RIFTError(
        `${provider.entityName} applies to ${consumer.entityName}, but ${consumer.entityName} has no reference ` +
        `to ${providerRelationship.targetEntityName}.${providerRelationship.targetField} needed to join ` +
        `${provider.entityName}.${providerRelationship.sourceField}.`
      );
    }
    if (matches.length > 1) {
      throw new RIFTError(
        `${provider.entityName} applies to ${consumer.entityName}, but ${consumer.entityName} has multiple references ` +
        `to ${providerRelationship.targetEntityName}.${providerRelationship.targetField}. ` +
        "The applicability join is ambiguous; use distinct target keys or a future explicit mapping override."
      );
    }

    const consumerRelationship = matches[0];
    if (!consumer.keys.includes(consumerRelationship.sourceField)) {
      throw new RIFTError(
        `${provider.entityName} applies to ${consumer.entityName} through ${consumer.entityName}.${consumerRelationship.sourceField}, ` +
        "but that field is not an @Key(). Temporal applicability joins currently require shared relationship coordinates to be entity keys."
      );
    }

    mappings.push({
      providerField: providerRelationship.sourceField,
      consumerField: consumerRelationship.sourceField,
      targetEntity: providerRelationship.targetEntity,
      targetEntityName: providerRelationship.targetEntityName,
      targetField: providerRelationship.targetField,
    });
  }

  const providerRelationshipFields = new Set(mappings.map((mapping) => mapping.providerField));
  const unsupportedKeys = provider.keys.filter((key) => !providerRelationshipFields.has(key));
  if (unsupportedKeys.length) {
    throw new RIFTError(
      `${provider.entityName} applies to ${consumer.entityName}, but its key field(s) ${unsupportedKeys.join(", ")} ` +
      "are not references that can be mapped through ER relationships. Add relationship metadata before inferring this temporal join."
    );
  }

  return mappings;
}

function temporalSelection(
  provider: GrainEntityIR,
  consumer: GrainEntityIR,
  mappings: GrainRelationshipMappingIR[]
): string {
  const providerTime = provider.temporal!.field;
  const consumerTime = consumer.temporal!.field;
  const predicates = [`${providerTime} <= their ${consumerTime}`];

  for (const mapping of mappings) {
    if (mapping.providerField !== mapping.consumerField) {
      predicates.push(`${mapping.providerField} = their ${mapping.consumerField}`);
    }
  }

  const inside = `named ${provider.eventName} and ${predicates.join(" and ")}`;
  const per = mappings.map((mapping) => mapping.providerField);
  return `newest by ${providerTime} of (${inside})${per.length ? ` per ${per.join(" and ")}` : ""}`;
}

function inferTemporalJoins(entities: GrainEntityIR[]): LoweredModelParts {
  const byCtor = new Map<Constructor, GrainEntityIR>(entities.map((entity) => [entity.entity, entity]));
  const temporalJoins: GrainTemporalJoinIR[] = [];
  const narrowing: GrainNarrowingIR[] = [];
  const rows: GrainRowIR[] = [];
  const permissions: GrainPermissionIR[] = [];
  const names = new Set<string>();

  for (const provider of entities) {
    const description = describeClass(provider.entity);
    const applications = annotationValues<AppliesToOptions>(description.annotations, "appliesTo");
    if (!applications.length) continue;

    if (provider.temporal?.kind !== "effective") {
      throw new RIFTError(
        `${provider.entityName} uses @AppliesTo(...) but is not effective-dated. Add @EffectiveAt() to the provider time coordinate.`
      );
    }

    for (const application of applications) {
      const consumer = byCtor.get(application.target);
      if (!consumer) {
        const targetName = describeClass(application.target).name;
        throw new RIFTError(
          `${provider.entityName} applies to ${targetName}, but ${targetName} was not included in inferGrainModel(...).`
        );
      }
      if (!consumer.temporal) {
        throw new RIFTError(
          `${provider.entityName} applies to ${consumer.entityName}, but ${consumer.entityName} has no temporal coordinate to anchor applicability.`
        );
      }

      const providerTimeField = description.fields[provider.temporal.field];
      const consumerDescription = describeClass(consumer.entity);
      const consumerTimeField = consumerDescription.fields[consumer.temporal.field];
      const providerTimeScalar = scalarCapabilities(providerTimeField);
      const consumerTimeScalar = scalarCapabilities(consumerTimeField);
      if (
        !providerTimeScalar ||
        !consumerTimeScalar ||
        providerTimeScalar.literal !== consumerTimeScalar.literal
      ) {
        throw new RIFTError(
          `${provider.entityName}.${provider.temporal.field} and ${consumer.entityName}.${consumer.temporal.field} ` +
          "must use the same scalar representation for an inferred temporal applicability join."
        );
      }

      const mappings = relationshipMapping(provider, consumer);

      for (const mapping of mappings) {
        if (mapping.providerField === mapping.consumerField) continue;
        const providerRelationshipField = description.fields[mapping.providerField];
        const consumerRelationshipField = consumerDescription.fields[mapping.consumerField];
        const providerScalar = scalarCapabilities(providerRelationshipField);
        const consumerScalar = scalarCapabilities(consumerRelationshipField);
        if (
          !providerScalar ||
          !consumerScalar ||
          providerScalar.literal !== consumerScalar.literal
        ) {
          throw new RIFTError(
            `${provider.entityName}.${mapping.providerField} and ${consumer.entityName}.${mapping.consumerField} ` +
            "must use the same scalar representation for an inferred relationship join."
          );
        }
        permissions.push(
          {
            operation: "compare",
            on: `named ${provider.eventName} on ${mapping.providerField} with ${providerScalar.literal}`,
            evidence: "inferred for ER relationship equality",
          },
          {
            operation: "compare",
            on: `named ${consumer.eventName} on ${mapping.consumerField} with ${consumerScalar.literal}`,
            evidence: "inferred for ER relationship equality",
          }
        );
      }

      const selection = temporalSelection(provider, consumer, mappings);
      const name = application.name?.trim() || `${provider.entityName} applicable to ${consumer.entityName}`;
      if (!name) {
        throw new RIFTError(`Cannot infer an applicability word for ${provider.entityName}.`);
      }
      if (names.has(name)) {
        throw new RIFTError(`More than one inferred temporal join uses the Grain word '${name}'.`);
      }
      names.add(name);

      const payloadFields = provider.fields.filter(
        (field) => !provider.keys.includes(field) && field !== provider.temporal!.field
      );
      if (!payloadFields.length) {
        throw new RIFTError(
          `${provider.entityName} applies to ${consumer.entityName}, but it has no non-key payload fields to materialise at the consumer grain.`
        );
      }

      const conflicts = payloadFields.filter((field) => consumer.fields.includes(field));
      if (conflicts.length) {
        throw new RIFTError(
          `${provider.entityName} applies to ${consumer.entityName}, but payload field(s) ${conflicts.join(", ")} ` +
          "already exist on the consumer. Rename the provider payload or add an explicit future field mapping before materialising the join."
        );
      }

      const parameterParts = payloadFields.map(
        (field) => `${field}: ${field} of (${selection})`
      );
      const parameters = parameterParts.join("; ");
      const makerQualifiers = parameterParts.join(" and ");
      const wordSelects = `made by (work out and ${makerQualifiers}) from named ${consumer.eventName}`;
      const evidence = `inferred from @AppliesTo(${consumer.entityName}) and shared @Reference coordinates`;

      temporalJoins.push({
        providerEntity: provider.entity,
        providerEntityName: provider.entityName,
        providerEventName: provider.eventName,
        consumerEntity: consumer.entity,
        consumerEntityName: consumer.entityName,
        consumerEventName: consumer.eventName,
        providerTimeField: provider.temporal.field,
        consumerTimeField: consumer.temporal.field,
        relationshipMappings: mappings,
        name,
        selects: selection,
      });

      narrowing.push({ name, selects: wordSelects, evidence });
      rows.push({
        label: `TJ${rows.length + 1}`,
        selects: `named ${consumer.eventName}`,
        pattern: "work out",
        parameters,
        evidence,
      });

      for (const payloadField of payloadFields) {
        const providerField = description.fields[payloadField];
        const scalar = scalarCapabilities(providerField);
        if (!scalar) continue;

        if (scalar.ordered) {
          permissions.push({
            operation: "compare",
            on: `named ${name} on ${payloadField} with ${scalar.literal}`,
            evidence: "inferred from applicable provider scalar metadata",
          });
        }
        for (const operation of scalar.operations) {
          permissions.push({
            operation,
            on: `named ${name} on ${payloadField} with ${scalar.literal} -> named ${name}`,
            evidence: "inferred from applicable provider scalar metadata",
          });
        }
      }
    }
  }

  return { temporalJoins, narrowing, rows, permissions: dedupePermissions(permissions) };
}

function emitWorldTable(entities: GrainEntityIR[]): string[] {
  return [
    "## World events",
    "",
    "| event | fields | evidence |",
    "|---|---|---|",
    ...entities.map((entity) => {
      const fields = entity.fields.map((field) => `add ${field}`).join("; ");
      const statement = fields ? `fields: ${fields}` : "";
      return `| ${entity.eventName} | ${statement} | inferred from TypeMorph ER metadata |`;
    }),
  ];
}

function emitFieldsRowsTable(fieldRows: GrainFieldsRowIR[]): string[] {
  if (!fieldRows.length) return [];
  return [
    "## Fields rows",
    "",
    "| selects | fields | evidence |",
    "|---|---|---|",
    ...fieldRows.map((row) =>
      `| ${row.selects} | fields: ${row.fields.map((field) => `add ${field}`).join("; ")} | ${row.evidence} |`
    ),
  ];
}

function emitPermissionsTable(permissions: GrainPermissionIR[]): string[] {
  return [
    "## Permissions",
    "",
    "| operation | on | evidence |",
    "|---|---|---|",
    ...permissions.map(
      (permission) =>
        `| ${permission.operation} | ${permission.on} | ${permission.evidence} |`
    ),
  ];
}

function emitNarrowingTable(narrowing: GrainNarrowingIR[]): string[] {
  return [
    "## Narrowing table",
    "",
    "| name | selects | evidence |",
    "|---|---|---|",
    ...narrowing.map((word) => `| ${word.name} | ${word.selects} | ${word.evidence} |`),
  ];
}

function emitRowsTable(rows: GrainRowIR[]): string[] {
  return [
    "## Rows",
    "",
    "| # | selects | pattern | parameters | evidence |",
    "|---|---|---|---|---|",
    ...rows.map(
      (row) =>
        `| ${row.label} | ${row.selects} | ${row.pattern} | ${row.parameters} | ${row.evidence} |`
    ),
  ];
}

function inferCurrentWords(entities: GrainEntityIR[]): GrainNarrowingIR[] {
  const words: GrainNarrowingIR[] = [];
  for (const entity of entities) {
    if (!entity.temporal || entity.keys.length === 0) continue;
    words.push({
      name: `current ${entity.entityName}`,
      selects: `newest by ${entity.temporal.field} of named ${entity.eventName} per ${entity.keys.join(" and ")}`,
      evidence: `inferred from @${entity.temporal.kind === "effective" ? "EffectiveAt" : "RevisionAt"}() and @Key()`,
    });
  }
  return words;
}

function assertUniqueRows(rows: GrainRowIR[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.label)) {
      throw new RIFTError(`More than one Grain row uses label '${row.label}'.`);
    }
    seen.add(row.label);
  }
}

function assertUniqueWords(words: GrainNarrowingIR[]): void {
  const byName = new Map<string, string>();
  for (const word of words) {
    const existing = byName.get(word.name);
    if (existing !== undefined && existing !== word.selects) {
      throw new RIFTError(
        `More than one Grain narrowing word uses name '${word.name}' with different selections.`
      );
    }
    byName.set(word.name, word.selects);
  }
}

function dedupeWords(words: GrainNarrowingIR[]): GrainNarrowingIR[] {
  const seen = new Set<string>();
  const result: GrainNarrowingIR[] = [];
  for (const word of words) {
    const key = `${word.name}\u0000${word.selects}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(word);
  }
  return result;
}

export function inferGrainModel(
  entities: readonly Constructor[],
  options: { rules?: GrainRuleSet; inferCurrentWords?: boolean } = {}
): GrainModelIR {
  const lowered = entities.map(lowerEntity);
  const inferred = inferTemporalJoins(lowered);
  const rules = options.rules;
  const currentWords = options.inferCurrentWords === false ? [] : inferCurrentWords(lowered);
  const permissions = dedupePermissions([
    ...lowered.flatMap((entity) => entity.permissions),
    ...inferred.permissions,
    ...(rules?.permissions ?? []),
  ]);
  const narrowing = dedupeWords([
    ...currentWords,
    ...inferred.narrowing,
    ...(rules?.narrowing ?? []),
  ]);
  const rows = [...inferred.rows, ...(rules?.rows ?? [])];

  assertUniqueWords(narrowing);
  assertUniqueRows(rows);

  return {
    entities: lowered,
    world: lowered.map((entity) => ({
      entity: entity.entity,
      entityName: entity.entityName,
      eventName: entity.eventName,
      fields: [...entity.fields],
    })),
    relationships: lowered.flatMap((entity) => entity.relationships),
    fieldRows: [...(rules?.fieldRows ?? [])],
    temporalJoins: inferred.temporalJoins,
    narrowing,
    rows,
    permissions,
    supplied: [...(rules?.supplied ?? [])],
    expected: [...(rules?.expected ?? [])],
  };
}

function emitSuppliedTable(supplied: GrainSuppliedIR[]): string[] {
  if (!supplied.length) return [];
  return [
    "## Examples: supplied events",
    "",
    "| event | its fields |",
    "|---|---|",
    ...supplied.map((item) => {
      const fields = Object.entries(item.fields)
        .map(([field, value]) => `${field}: ${value}`)
        .join("; ");
      return `| ${item.event} | ${fields} |`;
    }),
  ];
}

function emitExpectedTable(expected: GrainExpectedIR[]): string[] {
  if (!expected.length) return [];
  return [
    "## Examples: made events expected",
    "",
    "| selection | figures |",
    "|---|---|",
    ...expected.map((item) => `| ${item.selection} | ${item.figures} |`),
  ];
}

export function emitGrainMarkdown(model: GrainModelIR, title = "TypeMorph inferred model"): string {
  const lines = [
    `# ${title}`,
    "",
    ...emitWorldTable(model.entities),
  ];

  const fieldRows = emitFieldsRowsTable(model.fieldRows);
  if (fieldRows.length) lines.push("", ...fieldRows);
  lines.push(
    "",
    ...emitPermissionsTable(model.permissions),
    "",
    ...emitNarrowingTable(model.narrowing),
    "",
    ...emitRowsTable(model.rows)
  );

  const supplied = emitSuppliedTable(model.supplied);
  if (supplied.length) lines.push("", ...supplied);
  const expected = emitExpectedTable(model.expected);
  if (expected.length) lines.push("", ...expected);
  lines.push("");

  return `${lines.join("\n")}\n`;
}

export function transpileEntitiesToGrain(
  entities: readonly Constructor[],
  options: { title?: string; rules?: GrainRuleSet; inferCurrentWords?: boolean } = {}
): GrainTranspileResult {
  const model = inferGrainModel(entities, {
    rules: options.rules,
    inferCurrentWords: options.inferCurrentWords,
  });
  return {
    model,
    markdown: emitGrainMarkdown(model, options.title),
  };
}
