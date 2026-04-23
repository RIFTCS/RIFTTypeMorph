export type TypeMorphSerialisableCtor<TInstance = any, TWire = any> = {
    new (...args: any[]): TInstance;
    serialise(value: TInstance): TWire;
    deserialise(value: TWire): TInstance;
};

export function isTypeMorphSerialisableCtor(value: any): value is TypeMorphSerialisableCtor<any, any> {
    return (
        typeof value === "function" &&
        typeof value.serialise === "function" &&
        typeof value.deserialise === "function"
    );
}