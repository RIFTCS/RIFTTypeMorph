import {describe, expect, it} from "vitest";
import {
    BypassConstructor,
    cloneWith,
    createInstance,
    CustomSerialise,
    duplicateInstance,
    Field,
    Ignore,
    Include,
    OptionalField,
    serialiseInstance,
    TSType,
    updateWith
} from "../src";
import {RIFTError} from "../src/utils/errors";

/**
 * Live-mutation counterparts to the existing cloneWith/duplicateInstance tests.
 * The original isolation suites remain unchanged. Each test here asserts the
 * deliberate opposite: distinct identity handles observe ONE mutable target.
 */
describe("updateWith versus cloneWith: live mutation parity", () => {
    it("updates the source instead of isolating the changed field", () => {
        class Model {
            @Field(TSType.Value) x = 1;
            @Field(TSType.Value) y = 2;
        }
        const source = new Model();
        const retainedReference = source;
        const next = updateWith(source, {x: 10});
        expect(next).not.toBe(source);
        expect(next).toBeInstanceOf(Model);
        expect(source.x).toBe(10);
        expect(retainedReference.x).toBe(10);
        expect(next.y).toBe(2);
        expect(retainedReference.y).toBe(2);
    });

    it("preserves inherited class behaviour while mutating the original subclass", () => {
        class Base {
            @Field(TSType.Value) baseId = 1;
            readBase() { return this.baseId; }
        }
        class Child extends Base {
            @Field(TSType.Value) childId = 2;
            readChild() { return this.childId; }
        }
        const source = new Child();
        const first = updateWith(source, {baseId: 4, childId: 9});
        expect(first).toBeInstanceOf(Child);
        expect(first).toBeInstanceOf(Base);
        expect(first.readBase()).toBe(4);
        expect(first.readChild()).toBe(9);
        expect(source.readBase()).toBe(4);
        expect(source.readChild()).toBe(9);
        first.baseId = 11;
        expect(source.baseId).toBe(11);
    });

    it("keeps @Include getters live on every identity without materialising own values", () => {
        class Model {
            @Field(TSType.Value) value = 2;
            @Include get doubled() { return this.value * 2; }
        }
        const source = new Model();
        const old = updateWith(source, {});
        const next = updateWith(old, {value: 8});
        expect(source.doubled).toBe(16);
        expect(old.doubled).toBe(16);
        expect(next.doubled).toBe(16);
        expect(Object.prototype.hasOwnProperty.call(next, "doubled")).toBe(false);
        expect(serialiseInstance(next)).toEqual({value: 8, doubled: 16});
    });

    it("rejects required-null and undeclared changes before mutating any prior field", () => {
        class Model {
            @Field(TSType.Value) a = 1;
            @Field(TSType.Value) b = 2;
        }
        const source = new Model();
        expect(() => updateWith(source, {a: 10, b: null as any})).toThrow(RIFTError);
        expect([source.a, source.b]).toEqual([1, 2]);
        expect(() => updateWith(source, {a: 10, invalid: true} as any)).toThrow(RIFTError);
        expect([source.a, source.b]).toEqual([1, 2]);
    });

    it("rejects included fields before mutating otherwise valid fields", () => {
        class Model {
            @Field(TSType.Value) value = 2;
            @Include get doubled() { return this.value * 2; }
        }
        const source = new Model();
        expect(() => updateWith(source, {value: 4, doubled: 100} as any)).toThrow(RIFTError);
        expect(source.value).toBe(2);
    });

    it("accepts optional-null updates and exposes them through the retained instance", () => {
        class Model {
            @Field(TSType.Value) id = 1;
            @OptionalField(TSType.Value) score: number | null = 3;
        }
        const source = new Model();
        const old = updateWith(source, {});
        const next = updateWith(old, {score: null});
        expect(source.score).toBeNull();
        expect(old.score).toBeNull();
        expect(next.score).toBeNull();
    });

    it("shares a nested class instance, rather than recursively duplicating it", () => {
        class Child {
            @Field(TSType.Value) count = 1;
        }
        class Parent {
            @Field(TSType.Object, Child) child = new Child();
        }
        const parent = new Parent();
        const childBefore = parent.child;
        const next = updateWith(parent, {});
        expect(next.child).toBe(childBefore);
        next.child.count = 7;
        expect(parent.child.count).toBe(7);
        expect(childBefore.count).toBe(7);
        parent.child.count = 12;
        expect(next.child.count).toBe(12);
    });

    it("shares arrays and their nested elements, including through previous handles", () => {
        class Child {
            @Field(TSType.Value) name = "before";
        }
        class Parent {
            @Field(TSType.Array, Child) children = [new Child()];
        }
        const source = new Parent();
        const originalArray = source.children;
        const originalChild = source.children[0];
        const first = updateWith(source, {});
        const second = updateWith(first, {});
        expect(first.children).toBe(originalArray);
        expect(second.children).toBe(originalArray);
        second.children[0].name = "changed";
        expect(source.children[0]).toBe(originalChild);
        expect(originalChild.name).toBe("changed");
        first.children.push(new Child());
        expect(source.children.length).toBe(2);
    });

    it("updating a referenced child mutates the same child visible through parent handles", () => {
        class Child {
            @Field(TSType.Value) value = 1;
        }
        class Parent {
            @Field(TSType.Object, Child) child = new Child();
        }
        const parent = new Parent();
        const retainedParent = parent;
        const parentHandle = updateWith(parent, {});
        const childHandle = updateWith(parent.child, {value: 14});
        expect(childHandle).not.toBe(parent.child);
        expect(retainedParent.child).toBe(parent.child);
        expect(parentHandle.child).toBe(parent.child);
        expect(parentHandle.child.value).toBe(14);
    });

    it("serialises the same live state through old and new root references", () => {
        class Child {
            @Field(TSType.Value) value = 1;
        }
        class Parent {
            @Field(TSType.Value) title = "old";
            @Field(TSType.Object, Child) child = new Child();
        }
        const source = new Parent();
        const old = updateWith(source, {title: "middle"});
        const next = updateWith(old, {title: "new"});
        next.child.value = 7;
        const expected = {title: "new", child: {value: 7}};
        expect(serialiseInstance(source)).toEqual(expected);
        expect(serialiseInstance(old)).toEqual(expected);
        expect(serialiseInstance(next)).toEqual(expected);
    });

    it("replaces an array reference on the same parent without copying the replacement", () => {
        class Model {
            @Field(TSType.Array) values = [1, 2];
        }
        const source = new Model();
        const old = updateWith(source, {});
        const oldArray = source.values;
        const replacement = [3, 4, 5];
        const next = updateWith(old, {values: replacement});
        expect(source.values).toBe(replacement);
        expect(old.values).toBe(replacement);
        expect(next.values).toBe(replacement);
        expect(oldArray).toEqual([1, 2]);
        replacement.push(6);
        expect(source.values).toEqual([3, 4, 5, 6]);
    });

    it("replaces a nested object reference across all handles without cloning it", () => {
        class Child {
            @Field(TSType.Value) id = 1;
        }
        class Parent {
            @Field(TSType.Object, Child) child = new Child();
        }
        const source = new Parent();
        const old = updateWith(source, {});
        const previousChild = source.child;
        const replacement = new Child();
        replacement.id = 8;
        const next = updateWith(old, {child: replacement});
        expect(source.child).toBe(replacement);
        expect(old.child).toBe(replacement);
        expect(next.child).toBe(replacement);
        expect(previousChild.id).toBe(1);
        replacement.id = 15;
        expect(source.child.id).toBe(15);
    });

    it("preserves cyclic references because no graph reconstruction occurs", () => {
        class Model {
            @Field(TSType.Value) value = 1;
            @OptionalField(TSType.Value) linked: Model | null = null;
        }
        const source = new Model();
        source.linked = source;
        const next = updateWith(source, {value: 3});
        expect(source.linked).toBe(source);
        expect(next.linked).toBe(source);
        expect(next.linked!.value).toBe(3);
    });

    it("does not invoke constructors, custom class hydration or transport transforms", () => {
        let constructorCount = 0;
        let serializeCount = 0;
        let deserializeCount = 0;
        class Model {
            @Field(TSType.Value) value = 1;
            constructor() { constructorCount++; }
            static serialise(instance: Model) { serializeCount++; return {value: instance.value}; }
            static deserialise(data: {value: number}) { deserializeCount++; return Object.assign(new Model(), data); }
        }
        const source = new Model();
        const first = updateWith(source, {value: 7});
        const second = updateWith(first, {value: 9});
        expect(constructorCount).toBe(1);
        expect(serializeCount).toBe(0);
        expect(deserializeCount).toBe(0);
        expect(source.value).toBe(9);
        expect(first.value).toBe(9);
        expect(second.value).toBe(9);
    });

    it("does not reapply class deserialization transformations across repeated updates", () => {
        class Model {
            @Field(TSType.Value) value = 5;
            static serialise(instance: Model) { return {v: instance.value}; }
            static deserialise(data: {v: number}) { return Object.assign(new Model(), {value: data.v * 2}); }
        }
        const source = new Model();
        const first = updateWith(source, {value: 7});
        const second = updateWith(first, {value: 8});
        expect([source.value, first.value, second.value]).toEqual([8, 8, 8]);
    });

    it("does not invoke field codecs that cloneWith may use when enabled", () => {
        let serializeCount = 0;
        let deserializeCount = 0;
        class Model {
            @Field(TSType.Value)
            @CustomSerialise<number, string>(
                value => {serializeCount++; return String(value);},
                value => {deserializeCount++; return Number(value);},
                "string"
            )
            amount = 3;
        }
        const source = new Model();
        updateWith(source, {amount: 4});
        updateWith(source, {amount: 5});
        expect(serializeCount).toBe(0);
        expect(deserializeCount).toBe(0);
        expect(source.amount).toBe(5);
        expect(serialiseInstance(source)).toEqual({amount: "5"});
        expect(serializeCount).toBe(1);
    });

    it("retains unschema'd runtime data even when @Ignore does not pass through clones", () => {
        class Model {
            @Field(TSType.Value) value = 1;
            @Ignore() runtime = {counter: 3};
        }
        const source = new Model();
        const runtime = source.runtime;
        const old = updateWith(source, {});
        const next = updateWith(old, {value: 10});
        expect(old.runtime).toBe(runtime);
        expect(next.runtime).toBe(runtime);
        runtime.counter = 4;
        expect(source.runtime.counter).toBe(4);
        expect(serialiseInstance(next)).toEqual({value: 10});
    });

    it("retains @Ignore(true) runtime identity without needing clone passthrough", () => {
        @BypassConstructor()
        class Model {
            @Field(TSType.Value) value = 1;
            @Ignore(true) runtime!: {id: number};
        }
        const source = new Model();
        const runtime = {id: 4};
        source.runtime = runtime;
        const next = updateWith(source, {value: 2});
        expect(next.runtime).toBe(runtime);
        expect(source.runtime).toBe(runtime);
        next.runtime.id = 9;
        expect(source.runtime.id).toBe(9);
    });

    it("does not call @Include getters just to obtain a new identity", () => {
        let calls = 0;
        class Model {
            @Field(TSType.Value) value = 1;
            @Include get calculated() { calls++; return this.value * 3; }
        }
        const source = new Model();
        const next = updateWith(source, {value: 2});
        expect(calls).toBe(0);
        expect(next.calculated).toBe(6);
        expect(calls).toBe(1);
    });

    it("allows old identity handles to perform future writes visible to every handle", () => {
        class Model {
            @Field(TSType.Value) count = 0;
        }
        const source = new Model();
        const first = updateWith(source, {count: 1});
        const second = updateWith(first, {count: 2});
        const third = updateWith(source, {count: 3});
        first.count = 10;
        expect([source.count, first.count, second.count, third.count]).toEqual([10, 10, 10, 10]);
        second.count = 20;
        expect([source.count, first.count, second.count, third.count]).toEqual([20, 20, 20, 20]);
    });

    it("keeps identity handles shallow even after long update chains", () => {
        class Model {
            @Field(TSType.Value) count = 0;
        }
        const source = new Model();
        let latest = updateWith(source, {});
        const first = latest;
        for (let i = 1; i <= 100; i++) {
            latest = updateWith(latest, {count: i});
        }
        expect(source.count).toBe(100);
        expect(first.count).toBe(100);
        expect(latest.count).toBe(100);
        expect(Object.getPrototypeOf(latest)).toBe(Model.prototype);
    });

    it("does not copy when applying an empty patch, but returns a new React-visible identity", () => {
        class Model {
            @Field(TSType.Value) count = 0;
        }
        const source = new Model();
        const retainedNested = {value: 1};
        (source as any).transient = retainedNested;
        const old = updateWith(source, {});
        const next = updateWith(old, {});
        expect(old).not.toBe(source);
        expect(next).not.toBe(old);
        expect((old as any).transient).toBe(retainedNested);
        expect((next as any).transient).toBe(retainedNested);
    });

    it("gives React-style setters a new root reference and leaves retained state live", () => {
        class Model {
            @Field(TSType.Value) count = 1;
        }
        let state = new Model();
        const retainedBeforeUpdate = state;
        const setState = (updater: (previous: Model) => Model) => { state = updater(state); };
        setState(previous => updateWith(previous, {count: 2}));
        const firstIdentity = state;
        expect(Object.is(state, retainedBeforeUpdate)).toBe(false);
        expect(retainedBeforeUpdate.count).toBe(2);
        setState(previous => updateWith(previous, {count: 3}));
        expect(Object.is(state, firstIdentity)).toBe(false);
        expect(firstIdentity.count).toBe(3);
        expect(retainedBeforeUpdate.count).toBe(3);
    });
});

describe("updateWith versus cloneWith: expando mutation parity", () => {
    class Model {
        @Field(TSType.Value) value = 1;
        @Field(TSType.Expando) extra: Record<string, any> = {a: 1, keep: 2};
    }

    it("merges expando values into the original expando object", () => {
        const source = new Model();
        const expandoBefore = source.extra;
        const first = updateWith(source, {extra: {a: 7, newField: 9}});
        expect(source.extra).toBe(expandoBefore);
        expect(first.extra).toBe(expandoBefore);
        expect(expandoBefore).toEqual({a: 7, keep: 2, newField: 9});
    });

    it("deletes null-marked keys in the shared expando object", () => {
        const source = new Model();
        const old = updateWith(source, {});
        const expandoBefore = source.extra;
        const next = updateWith(old, {extra: {a: null}});
        expect(source.extra).toBe(expandoBefore);
        expect(old.extra).toBe(expandoBefore);
        expect(next.extra).toBe(expandoBefore);
        expect(expandoBefore).toEqual({keep: 2});
    });

    it("preserves untouched expando keys and object identities through successive patches", () => {
        const source = new Model();
        const nested = {counter: 1};
        source.extra.nested = nested;
        const first = updateWith(source, {extra: {a: 3}});
        const second = updateWith(first, {extra: {keep: 4}});
        expect(source.extra.nested).toBe(nested);
        expect(first.extra.nested).toBe(nested);
        second.extra.nested.counter = 7;
        expect(nested.counter).toBe(7);
        expect(source.extra).toEqual({a: 3, keep: 4, nested: {counter: 7}});
    });

    it("rejects invalid expando replacements without partially changing regular fields", () => {
        const source = new Model();
        expect(() => updateWith(source, {value: 5, extra: null as any})).toThrow(RIFTError);
        expect(source.value).toBe(1);
        expect(source.extra).toEqual({a: 1, keep: 2});
        expect(() => updateWith(source, {extra: 9 as any})).toThrow(RIFTError);
        expect(source.extra).toEqual({a: 1, keep: 2});
    });

    it("does not accept expando children as top-level patch keys", () => {
        const source = new Model();
        expect(() => updateWith(source, {a: 9} as any)).toThrow(RIFTError);
        expect(source.extra.a).toBe(1);
    });
});

describe("updateWith versus duplicateInstance: independent copies remain isolated", () => {
    class Child {
        @Field(TSType.Value) score = 1;
    }
    class Parent {
        @Field(TSType.Value) title = "before";
        @Field(TSType.Object, Child) child = new Child();
        @Field(TSType.Array, Child) children = [new Child()];
        @Field(TSType.Expando) extra: Record<string, any> = {flag: true};
    }

    it("mutating an updateWith handle changes the source, unlike cloneWith", () => {
        const source = new Parent();
        const cloned = cloneWith(source, {});
        const live = updateWith(source, {title: "after"});
        live.child.score = 7;
        live.children[0].score = 9;
        updateWith(live, {extra: {flag: false}});
        expect(source.title).toBe("after");
        expect(source.child.score).toBe(7);
        expect(source.children[0].score).toBe(9);
        expect(source.extra.flag).toBe(false);
        expect(cloned.title).toBe("before");
        expect(cloned.child.score).toBe(1);
        expect(cloned.children[0].score).toBe(1);
        expect(cloned.extra.flag).toBe(true);
    });

    it("mutating an updateWith handle changes the source, unlike duplicateInstance", () => {
        const source = new Parent();
        const duplicate = duplicateInstance(source);
        const live = updateWith(source, {title: "after"});
        live.child.score = 8;
        live.children[0].score = 6;
        updateWith(live, {extra: {flag: false}});
        expect(source.child.score).toBe(8);
        expect(source.children[0].score).toBe(6);
        expect(source.extra.flag).toBe(false);
        expect(duplicate.title).toBe("before");
        expect(duplicate.child.score).toBe(1);
        expect(duplicate.children[0].score).toBe(1);
        expect(duplicate.extra.flag).toBe(true);
    });

    it("can wrap hydrated nested classes without reconstructing their graph", () => {
        const source = createInstance({
            title: "hydrated",
            child: {score: 2},
            children: [{score: 3}],
            extra: {flag: true}
        }, Parent);
        const nested = source.child;
        const childArray = source.children;
        const live = updateWith(source, {title: "edited"});
        expect(live.child).toBe(nested);
        expect(live.children).toBe(childArray);
        expect(nested).toBeInstanceOf(Child);
        live.child.score = 11;
        expect(source.child.score).toBe(11);
        expect(serialiseInstance(live)).toEqual({
            title: "edited",
            child: {score: 11},
            children: [{score: 3}],
            extra: {flag: true}
        });
    });
});
