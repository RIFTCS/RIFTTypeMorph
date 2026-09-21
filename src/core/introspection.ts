import { RIFTAnnotation, getClassAnnotations, getFieldAnnotations } from "./annotations";
import { Constructor, TSField } from "./TSField";
import { ParsedSchema, parseClass } from "./schemaDiscovery";

export interface DescribedField {
  name: string;
  schema: TSField;
  annotations: RIFTAnnotation[];
}

export interface TypeMorphClassDescription<T = any> {
  ctor: Constructor<T>;
  name: string;
  schema: ParsedSchema;
  annotations: RIFTAnnotation[];
  fields: Record<string, DescribedField>;
}

/**
 * Compiler/introspection boundary for TypeMorph classes.
 *
 * This function never invokes the class constructor. Under the repository's
 * legacy decorator configuration, all @Field and semantic decorator metadata
 * is available directly from the constructor/prototype chain.
 */
export function describeClass<T>(ctor: Constructor<T>): TypeMorphClassDescription<T> {
  const schema = parseClass(ctor);
  const fieldAnnotations = getFieldAnnotations(ctor);
  const fields: Record<string, DescribedField> = {};

  for (const [name, field] of Object.entries(schema.fields)) {
    fields[name] = {
      name,
      schema: field,
      annotations: [...(fieldAnnotations[name] ?? [])],
    };
  }

  return {
    ctor,
    name: ctor.name,
    schema,
    annotations: getClassAnnotations(ctor),
    fields,
  };
}
