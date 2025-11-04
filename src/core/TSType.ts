/**
 * Represents the basic runtime categories of types that rifttypemorph can handle.
 * Value = primitive data (string, number, boolean, date, etc.)
 * Array = an array of nested items
 * Object = a nested object with defined schema fields
 */
export enum TSType {
    Value = 0,
    Array = 1,
    Object = 2
}
