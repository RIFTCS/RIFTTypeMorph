export interface RehydrateOptions {
    bypassConstructor?: boolean;
}

const REHYDRATE_META = Symbol("rifttypemorph:rehydrate");

export function BypassConstructor(options: RehydrateOptions = {}) {
    return function <T extends Function>(target: T) {
        (target as any)[REHYDRATE_META] = {
            bypassConstructor: options.bypassConstructor !== false
        };
    };
}

export function shouldBypassConstructor(ctor: Function): boolean {
    return Boolean((ctor as any)[REHYDRATE_META]?.bypassConstructor);
}
