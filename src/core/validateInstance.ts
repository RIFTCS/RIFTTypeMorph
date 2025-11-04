import { createInstance, InstanceResult } from "./createInstance";
import { TSField } from "./TSField";
import { RIFTError } from "../utils/errors";

export interface ValidationError {
  message: string;
  context: string;
}

export interface ValidationResult<T = any> {
  valid: boolean;
  instance: T | null;
  errors: ValidationError[];
}

export function validateInstance<T = any>(
  data: any,
  instantiator: ((obj: any) => any) | (new (...args: any[]) => any) | null = null,
  field: TSField | null = null,
  outerType: string = "root"
): ValidationResult<T> {
  const { instance, errors } = createInstance(
    data,
    instantiator,
    field,
    outerType,
    { collectErrors: true }
  ) as InstanceResult<T>;

  return {
    valid: errors.length === 0,
    instance,
    errors: errors.map((e: RIFTError) => ({ message: e.message, context: (e as any).context ?? outerType }))
  };
}
