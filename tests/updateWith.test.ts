import {describe, it, expect} from "vitest";
import {
    cloneWith,
    CustomSerialise,
    duplicateInstance,
    Field,
    Include,
    OptionalField,
    serialiseInstance,
    TSType,
    updateWith
} from "../src";
import {RIFTError} from "../src/utils/errors";

describe("updateWith: mutable backing object, new React identity", () => {
    it("mutates the original object while returning a new identity", () => {
        class Task {
            @Field(TSType.Value) progress = 0;
            @Field(TSType.Value) name = "Task";
        }
        const original = new Task();
        const anotherReference = original;
        const updated = updateWith(original, {progress: 20});
        expect(updated).not.toBe(original);
        expect(updated).toBeInstanceOf(Task);
        expect(anotherReference.progress).toBe(20);
        expect(updated.progress).toBe(20);
        expect(serialiseInstance(updated)).toEqual({progress: 20, name: "Task"});
        expect(Object.getPrototypeOf(updated)).toBe(Task.prototype);
    });

    it("keeps every old identity handle connected to the same target", () => {
        class Task {
            @Field(TSType.Value) progress = 0;
        }
        const original = new Task();
        const first = updateWith(original, {progress: 10});
        const second = updateWith(first, {progress: 20});
        const third = updateWith(original, {progress: 30});
        expect(first).not.toBe(second);
        expect(second).not.toBe(third);
        expect([original.progress, first.progress, second.progress, third.progress]).toEqual([30, 30, 30, 30]);
        first.progress = 45;
        expect([original.progress, second.progress, third.progress]).toEqual([45, 45, 45]);
    });

    it("shares nested object and array values without copying them", () => {
        class Child {
            @Field(TSType.Value) counter = 1;
        }
        class Root {
            @Field(TSType.Object, Child) child = new Child();
            @Field(TSType.Array, Child) items = [new Child()];
        }
        const root = new Root();
        const view = updateWith(root, {});
        expect(view.child).toBe(root.child);
        expect(view.items).toBe(root.items);
        view.child.counter = 5;
        expect(root.child.counter).toBe(5);
    });

    it("preserves live class methods and private-field getters", () => {
        class Counter {
            #privateValue = 1;
            @Field(TSType.Value) count = 1;
            increment() { this.count += 1; this.#privateValue += 1; }
            get hidden() { return this.#privateValue; }
        }
        const original = new Counter();
        const updated = updateWith(original, {count: 4});
        updated.increment();
        expect(updated.hidden).toBe(2);
        expect(original.count).toBe(5);
        expect(original.hidden).toBe(2);
        expect(updated.increment).toBe(updateWith(updated, {}).increment);
    });

    it("still serialises custom class hooks receiving an original instance", () => {
        class Model {
            #privateValue = 6;
            @Field(TSType.Value) count = 1;
            static serialise(model: Model) { return {count: model.count, hidden: model.#privateValue}; }
        }
        const original = new Model();
        const updated = updateWith(original, {count: 2});
        expect(serialiseInstance(updated)).toEqual({count: 2, hidden: 6});
    });

    it("does not invoke custom transport codecs for updates", () => {
        let compress = 0;
        class Task {
            @Field(TSType.Value)
            @CustomSerialise<number, string>(v => {compress++; return String(v);}, v => Number(v), "string")
            progress = 1;
        }
        const task = new Task();
        const updated = updateWith(task, {progress: 2});
        expect(compress).toBe(0);
        expect(serialiseInstance(updated)).toEqual({progress: "2"});
        expect(compress).toBe(1);
    });

    it("leaves cloneWith and duplicateInstance with independent copy semantics", () => {
        class Task {
            @Field(TSType.Value) value = 1;
        }
        const task = new Task();
        const view = updateWith(task, {value: 2});
        const cloned = cloneWith(view, {value: 3});
        const duplicate = duplicateInstance(view);
        expect(task.value).toBe(2);
        expect(cloned.value).toBe(3);
        expect(duplicate.value).toBe(2);
        updateWith(view, {value: 4});
        expect([task.value, cloned.value, duplicate.value]).toEqual([4, 3, 2]);
    });

    it("rejects non-schema and included fields before mutating", () => {
        class Task {
            @Field(TSType.Value) value = 1;
            @Include get doubled() {return this.value * 2;}
        }
        const task = new Task();
        expect(() => updateWith(task, {value: 2, unknown: 3} as any)).toThrow(RIFTError);
        expect(task.value).toBe(1);
        expect(() => updateWith(task, {doubled: 4} as any)).toThrow(RIFTError);
        expect(task.value).toBe(1);
    });

    it("rejects invalid shapes while accepting nullable optional values", () => {
        class Task {
            @Field(TSType.Value) value = 1;
            @Field(TSType.Array) list = [1];
            @OptionalField(TSType.Value) note: string | null = "x";
        }
        const task = new Task();
        expect(() => updateWith(task, {value: null as any})).toThrow(RIFTError);
        expect(() => updateWith(task, {list: 2 as any})).toThrow(RIFTError);
        const view = updateWith(task, {note: null});
        expect(view.note).toBeNull();
        expect(task.note).toBeNull();
    });

    it("merges expando updates in place so old expando references see changes", () => {
        class Task {
            @Field(TSType.Value) value = 1;
            @Field(TSType.Expando) extra: Record<string, unknown> = {existing: 1, removed: true};
        }
        const task = new Task();
        const originalExpando = task.extra;
        const view = updateWith(task, {extra: {existing: 2, added: 3, removed: null}});
        expect(view.extra).toBe(originalExpando);
        expect(originalExpando).toEqual({existing: 2, added: 3});
    });

    it("returns new identities even when the patch is empty", () => {
        class Task {
            @Field(TSType.Value) value = 1;
        }
        const original = new Task();
        const first = updateWith(original, {});
        const second = updateWith(first, {});
        expect(first).not.toBe(original);
        expect(first).not.toBe(second);
    });
});
