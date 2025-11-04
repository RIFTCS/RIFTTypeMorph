import { TSType } from "./TSType";

/**
 * Generic type for a class constructor.
 */
export type Constructor<T = any> = new (...args: any[]) => T;

/**
 * Describes the structure and instantiation behavior of a field at runtime.
 */
export class TSField {
  /** Whether this field must be present in the input JSON. */
  public required: boolean;

  /** The type of field — Value, Array, or Object. */
  public fieldType: TSType;

  /**
   * Function or class constructor used to create instances.
   * - For simple values: null
   * - For arrays or objects: either a constructor (e.g. `User`)
   *   or a factory function (e.g. `(d) => new User()`)
   */
  public instantiator: ((obj: any) => any) | Constructor | null;

  constructor(
    fieldType: TSType,
    createNew: ((obj: any) => any) | Constructor | null = null,
    required: boolean = true
  ) {
    this.required = required;
    this.fieldType = fieldType;
    this.instantiator = createNew;
  }
}
