/**
 * Operation-scope parity copy of customSerialiserUsage.test.ts.
 * Original test remains unchanged.
 * Replays the established behaviour against the usage-aware TypeMorph pipeline.
 */
import {describe, expect, it} from "vitest";
import {
    cloneWith,
    createInstance,
    CustomSerialise,
    duplicateInstance,
    Field,
    serialiseInstance,
    TSType
} from "../src";

describe("@CustomSerialise usage scopes", () => {
    it("preserves legacy behaviour when usage is unspecified", () => {
        let encoded = 0;
        let decoded = 0;

        class Item {
            @Field(TSType.Value)
            @CustomSerialise<number, string>(
                value => { encoded++; return String(value); },
                value => { decoded++; return Number(value); },
                "string"
            )
            value = 7;
        }

        const original = new Item();
        expect(duplicateInstance(original).value).toBe(7);
        expect(cloneWith(original, {value: 9}).value).toBe(9);
        expect(serialiseInstance(original).value).toBe("7");
        expect(createInstance({value: "8"}, Item).value).toBe(8);
        expect(encoded).toBeGreaterThan(0);
        expect(decoded).toBeGreaterThan(0);
    });

    it("skips expensive hooks in both cloning operations, including a changed field", () => {
        let encoded = 0;
        let decoded = 0;

        class Entry {
            @Field(TSType.Value)
            name = "first";
        }

        class Schedule {
            @Field(TSType.Array, Entry)
            @CustomSerialise<Entry[], string>(
                value => { encoded++; return JSON.stringify(value); },
                value => { decoded++; return JSON.parse(value); },
                "string",
                {usage: {duplicateInstance: false, cloneWith: false}}
            )
            entries: Entry[] = [];

            @Field(TSType.Value)
            title = "A";
        }

        const original = new Schedule();
        original.entries = [new Entry()];
        const copy = duplicateInstance(original);
        const updated = cloneWith(original, {title: "B"});
        const newEntry = new Entry();
        newEntry.name = "replacement";
        const changedEntries = cloneWith(original, {entries: [newEntry]});

        expect(encoded).toBe(0);
        expect(decoded).toBe(0);
        for (const value of [copy, updated, changedEntries]) {
            expect(value.entries[0]).toBeInstanceOf(Entry);
            expect(value.entries).not.toBe(original.entries);
        }
        expect(changedEntries.entries[0].name).toBe("replacement");
        expect(updated.title).toBe("B");
        expect(original.title).toBe("A");

        const wire = serialiseInstance(original);
        expect(wire.entries).toBe('[{"name":"first"}]');
        const restored = createInstance(wire, Schedule);
        expect(restored.entries[0]).toBeInstanceOf(Entry);
        expect(encoded).toBe(1);
        expect(decoded).toBe(1);
    });

    it("applies independent switches for duplicateInstance and cloneWith", () => {
        let serialised = 0;
        let deserialised = 0;

        class Item {
            @Field(TSType.Value)
            @CustomSerialise<number, string>(
                value => { serialised++; return String(value); },
                value => { deserialised++; return Number(value); },
                "string",
                {usage: {duplicateInstance: true, cloneWith: false}}
            )
            count = 3;
        }

        const source = new Item();
        duplicateInstance(source);
        expect([serialised, deserialised]).toEqual([1, 1]);
        cloneWith(source, {count: 4});
        expect([serialised, deserialised]).toEqual([1, 1]);
        serialiseInstance(source);
        expect(serialised).toBe(2);
    });

    it("propagates the clone scope through nested arrays", () => {
        let serialised = 0;
        let deserialised = 0;

        class Child {
            @Field(TSType.Value)
            @CustomSerialise<number, string>(
                value => { serialised++; return String(value); },
                value => { deserialised++; return Number(value); },
                "string",
                {usage: {duplicateInstance: false, cloneWith: false}}
            )
            count = 2;
        }

        class Parent {
            @Field(TSType.Array, Child)
            children: Child[] = [new Child()];
        }

        const source = new Parent();
        const duplicate = duplicateInstance(source);
        const changed = cloneWith(source, {children: [new Child()]});
        expect(serialised).toBe(0);
        expect(deserialised).toBe(0);
        expect(duplicate.children[0]).toBeInstanceOf(Child);
        expect(changed.children[0]).toBeInstanceOf(Child);
        serialiseInstance(source);
        expect(serialised).toBe(1);
    });

    it("serialises changed fields before rehydration when cloneWith hooks are enabled", () => {
        class Item {
            @Field(TSType.Value)
            @CustomSerialise<number, string>(value => String(value), value => Number(value), "string")
            amount = 4;
        }

        const source = new Item();
        expect(cloneWith(source, {amount: 11}).amount).toBe(11);
    });

    it("can independently disable the ordinary wire hooks", () => {
        let encoded = 0;
        let decoded = 0;

        class Item {
            @Field(TSType.Value)
            @CustomSerialise<number, string>(
                value => { encoded++; return String(value); },
                value => { decoded++; return Number(value); },
                "string",
                {usage: {serialiseInstance: false, duplicateInstance: true, cloneWith: false}}
            )
            value = 5;
        }

        const source = new Item();
        expect(serialiseInstance(source).value).toBe(5);
        expect(createInstance({value: 8}, Item).value).toBe(8);
        expect([encoded, decoded]).toEqual([0, 0]);
        expect(duplicateInstance(source).value).toBe(5);
        expect([encoded, decoded]).toEqual([1, 1]);
        expect(cloneWith(source, {value: 6}).value).toBe(6);
        expect([encoded, decoded]).toEqual([1, 1]);
    });

    it("retains legacy boolean handlesNull support and scopes null handling", () => {
        class Item {
            @Field(TSType.Value, null, false)
            @CustomSerialise<null, string>(
                value => value === null ? "EMPTY" : "unexpected",
                value => value === "EMPTY" ? null : "unexpected",
                "string",
                {handlesNull: true, usage: {duplicateInstance: false, cloneWith: false}}
            )
            value: null = null;
        }

        const original = new Item();
        expect(serialiseInstance(original).value).toBe("EMPTY");
        expect(duplicateInstance(original).value).toBeNull();
        expect(cloneWith(original, {}).value).toBeNull();
        expect(createInstance({value: "EMPTY"}, Item).value).toBeNull();

        class Legacy {
            @Field(TSType.Value, null, false)
            @CustomSerialise<null, string>(
                value => value === null ? "EMPTY" : "unexpected",
                value => value === "EMPTY" ? null : "unexpected",
                "string",
                true
            )
            value: null = null;
        }
        expect(serialiseInstance(new Legacy()).value).toBe("EMPTY");
        expect(duplicateInstance(new Legacy()).value).toBeNull();
    });
});
