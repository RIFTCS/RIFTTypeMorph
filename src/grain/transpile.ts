import { RIFTAnnotation } from "../core/annotations";
import { describeClass, DescribedField, TypeMorphClassDescription } from "../core/introspection";
import type { Constructor } from "../core/TSField";
import { TSType } from "../core/TSType";
import {
  AppliesToOptions,
  ER_ANNOTATION_NAMESPACE,
  EntityOptions,
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

function humanizeIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function entityNameOf(description: TypeMorphClassDescription): string {
  const entityOptions = lastAnnotationValue<EntityOptions>(description.annotations, "entity");
  if (!entityOptions) {
    throw new RIFTError(
      `${description.name} is not an ER entity. Add @Entity() before Grain transpilation.`
    );
  }

  const entityName = entityOptions.name?.trim() || humanizeIdentifier(description.name);
  if (!entityName) {
    throw new RIFTError(`Cannot infer an entity name for ${description.name}.`);
  }
  return entityName;
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
  const entityName = entityNameOf(description);
  const eventName = `set ${entityName}`;
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
      });
    }

    for (const operation of scalar.operations) {
      permissions.push({
        operation,
        on: `named ${eventName} on ${fieldName} with ${scalar.literal} -> named ${eventName}`,
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
          },
          {
            operation: "compare",
            on: `named ${consumer.eventName} on ${mapping.consumerField} with ${consumerScalar.literal}`,
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
          });
        }
        for (const operation of scalar.operations) {
          permissions.push({
            operation,
            on: `named ${name} on ${payloadField} with ${scalar.literal} -> named ${name}`,
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
      return `| ${entity.eventName} | fields: ${fields} | inferred from TypeMorph ER metadata |`;
    }),
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
        `| ${permission.operation} | ${permission.on} | inferred from TypeMorph ER metadata |`
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

export function inferGrainModel(entities: readonly Constructor[]): GrainModelIR {
  const lowered = entities.map(lowerEntity);
  const inferred = inferTemporalJoins(lowered);
  const permissions = dedupePermissions([
    ...lowered.flatMap((entity) => entity.permissions),
    ...inferred.permissions,
  ]);

  return {
    entities: lowered,
    world: lowered.map((entity) => ({
      entity: entity.entity,
      entityName: entity.entityName,
      eventName: entity.eventName,
      fields: [...entity.fields],
    })),
    relationships: lowered.flatMap((entity) => entity.relationships),
    temporalJoins: inferred.temporalJoins,
    narrowing: inferred.narrowing,
    rows: inferred.rows,
    permissions,
  };
}

export function emitGrainMarkdown(model: GrainModelIR, title = "TypeMorph inferred model"): string {
  const lines = [
    `# ${title}`,
    "",
    ...emitWorldTable(model.entities),
    "",
    ...emitPermissionsTable(model.permissions),
    "",
    ...emitNarrowingTable(model.narrowing),
    "",
    ...emitRowsTable(model.rows),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

export function transpileEntitiesToGrain(
  entities: readonly Constructor[],
  options: { title?: string } = {}
): GrainTranspileResult {
  const model = inferGrainModel(entities);
  return {
    model,
    markdown: emitGrainMarkdown(model, options.title),
  };
}
