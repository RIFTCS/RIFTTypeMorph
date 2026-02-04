export function Include(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
) {
    const fn =
        typeof descriptor.value === "function"
            ? descriptor.value
            : typeof descriptor.get === "function"
            ? descriptor.get
            : null;

    if (!fn) {
        throw new Error("@Include can only be applied to methods or getters");
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
