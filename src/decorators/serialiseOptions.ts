export function Include(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
) {
    if (typeof descriptor.value !== "function") {
        throw new Error("@Include can only be applied to methods");
    }

    const proto = target;

    if (!proto.__includedMethods) {
        Object.defineProperty(proto, "__includedMethods", {
            value: new Set<string>(),
            enumerable: false,
            writable: false
        });
    }

    proto.__includedMethods.add(propertyKey);
}
