import type { Constructor } from "../core/TSField";
import { RIFTAnnotation } from "../core/annotations";
import { describeClass } from "../core/introspection";
import { EntityOptions, ER_ANNOTATION_NAMESPACE } from "../decorators/entityDecorators";
import { RIFTError } from "../utils/errors";

export interface GrainEntityMetadata {
  name: string;
  eventName: string;
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function lastEntityAnnotation(annotations: RIFTAnnotation[]): EntityOptions | undefined {
  const matches = annotations.filter(
    (annotation) =>
      annotation.namespace === ER_ANNOTATION_NAMESPACE && annotation.name === "entity"
  );
  return matches[matches.length - 1]?.value as EntityOptions | undefined;
}

export function grainEntityMetadata(ctor: Constructor): GrainEntityMetadata {
  const description = describeClass(ctor);
  const options = lastEntityAnnotation(description.annotations);
  if (!options) {
    throw new RIFTError(
      `${description.name} is not an ER entity. Add @Entity() before Grain transpilation.`
    );
  }

  const name = options.name?.trim() || humanizeIdentifier(description.name);
  if (!name) {
    throw new RIFTError(`Cannot infer an entity name for ${description.name}.`);
  }

  const eventName = options.eventName?.trim() || `set ${name}`;
  if (!eventName) {
    throw new RIFTError(`Cannot infer a world event name for ${description.name}.`);
  }

  return { name, eventName };
}
