import {describe, expect, it} from "vitest";
import {
    cloneWith,
    createInstance,
    CustomSerialise,
    duplicateInstance,
    Field,
    OptionalField,
    serialiseInstance,
    TSType
} from "../src";

type Operation = "serialiseInstance" | "duplicateInstance" | "cloneWith";
const operations: Operation[] = ["serialiseInstance", "duplicateInstance", "cloneWith"];

/** All eight masks exercise the individual switches and their interactions. */
for (let mask = 0; mask < 8; mask++) {
    const usage = {
        serialiseInstance: Boolean(mask & 1),
        duplicateInstance: Boolean(mask & 2),
        cloneWith: Boolean(mask & 4)
    };

    describe(`@CustomSerialise usage matrix ${mask} (${operations.filter(k => usage[k]).join(", ") || "all off"})`, () => {
        it("applies each enabled transport/hydration pair and skips each disabled pair", () => {
            let encodes = 0;
            let decodes = 0;
            class Model {
                @Field(TSType.Value)
                @CustomSerialise<number, string>(
                    n => { encodes++; return `value:${n}`; },
                    str => { decodes++; return Number(str.slice(6)); },
                    "string",
                    {usage}
                )
                count = 11;
            }
            const source = new Model();
            const duplicate = duplicateInstance(source);
            expect(duplicate).toBeInstanceOf(Model);
            expect(duplicate.count).toBe(11);
            expect(duplicate).not.toBe(source);
            expect(encodes > 0).toBe(usage.duplicateInstance);
            expect(decodes > 0).toBe(usage.duplicateInstance);

            encodes = decodes = 0;
            const altered = cloneWith(source, {count: 19});
            expect(altered).toBeInstanceOf(Model);
            expect(altered.count).toBe(19);
            expect(source.count).toBe(11);
            expect(encodes > 0).toBe(usage.cloneWith);
            expect(decodes > 0).toBe(usage.cloneWith);

            encodes = decodes = 0;
            const wire = serialiseInstance(source);
            expect(wire.count).toBe(usage.serialiseInstance ? "value:11" : 11);
            expect(encodes).toBe(usage.serialiseInstance ? 1 : 0);
            const hydrated = createInstance(wire, Model);
            expect(hydrated.count).toBe(11);
            expect(decodes).toBe(usage.serialiseInstance ? 1 : 0);
        });

        it("does not change the meaning of unchanged cloneWith calls", () => {
            class Model {
                @Field(TSType.Value)
                @CustomSerialise<string, string>(
                    value => `prefix:${value}`,
                    value => value.slice(7),
                    "string",
                    {usage}
                )
                label = "start";
            }
            const original = new Model();
            const result = cloneWith(original, {});
            expect(result.label).toBe("start");
            expect(result).not.toBe(original);
        });
    });
}

describe("@CustomSerialise usage deep traversal and preservation", () => {
    it("deep-copies nested object fields and arrays without invoking disabled codecs", () => {
        let outerEncoded = 0;
        let outerDecoded = 0;
        let innerEncoded = 0;
        let innerDecoded = 0;

        class Item {
            @Field(TSType.Value)
            @CustomSerialise<number, string>(
                n => { innerEncoded++; return String(n); },
                n => { innerDecoded++; return Number(n); },
                "string",
                {usage: {duplicateInstance: false, cloneWith: false}}
            )
            amount = 3;
        }
        class Group {
            @Field(TSType.Array, Item)
            @CustomSerialise<Item[], string>(
                arr => { outerEncoded++; return JSON.stringify(arr); },
                str => { outerDecoded++; return JSON.parse(str); },
                "string",
                {usage: {duplicateInstance: false, cloneWith: false}}
            )
            items = [new Item()];
        }
        class Root {
            @Field(TSType.Object, Group)
            group = new Group();
            @Field(TSType.Array, Group)
            groups = [new Group()];
        }

        const source = new Root();
        const copies = [duplicateInstance(source), cloneWith(source, {})];
        for (const copy of copies) {
            expect(copy).toBeInstanceOf(Root);
            expect(copy.group).toBeInstanceOf(Group);
            expect(copy.group.items[0]).toBeInstanceOf(Item);
            expect(copy.groups[0]).toBeInstanceOf(Group);
            expect(copy.groups[0].items[0]).toBeInstanceOf(Item);
            expect(copy.group.items).not.toBe(source.group.items);
            expect(copy.group.items[0]).not.toBe(source.group.items[0]);
            expect(copy.groups).not.toBe(source.groups);
        }
        expect([outerEncoded, outerDecoded, innerEncoded, innerDecoded]).toEqual([0, 0, 0, 0]);
        const wire = serialiseInstance(source);
        const restored = createInstance(wire, Root);
        expect(restored.group.items[0].amount).toBe(3);
        expect(restored.groups[0].items[0]).toBeInstanceOf(Item);
        expect(outerEncoded).toBe(2);
        expect(outerDecoded).toBe(2);
        // The outer array's JSON conversion deliberately bypasses inner metadata;
        // it still must preserve the nested domain instance when hydrated.
    });

    it("runs nested enabled hooks while skipping disabled enclosing hooks", () => {
        let outerCount = 0;
        let innerCount = 0;
        class Child {
            @Field(TSType.Value)
            @CustomSerialise<number, string>(
                n => { innerCount++; return String(n); },
                n => Number(n),
                "string",
                {usage: {duplicateInstance: true, cloneWith: true}}
            )
            count = 7;
        }
        class Parent {
            @Field(TSType.Array, Child)
            @CustomSerialise<Child[], string>(
                values => { outerCount++; return JSON.stringify(values); },
                value => JSON.parse(value),
                "string",
                {usage: {duplicateInstance: false, cloneWith: false}}
            )
            children = [new Child()];
        }
        const source = new Parent();
        expect(duplicateInstance(source).children[0].count).toBe(7);
        expect(cloneWith(source, {}).children[0].count).toBe(7);
        expect(innerCount).toBeGreaterThan(0);
        expect(outerCount).toBe(0);
    });

    it("handles replacement arrays via cloneWith without compressing the replacement", () => {
        let encode = 0;
        let decode = 0;
        class Event {
            @Field(TSType.Value)
            label = "first";
        }
        class History {
            @Field(TSType.Array, Event)
            @CustomSerialise<Event[], string>(
                v => { encode++; return JSON.stringify(v); },
                v => { decode++; return JSON.parse(v); },
                "string",
                {usage: {duplicateInstance: false, cloneWith: false}}
            )
            events = [new Event()];
        }
        const original = new History();
        const next = new Event();
        next.label = "second";
        const changed = cloneWith(original, {events: [next]});
        expect(changed.events[0]).toBeInstanceOf(Event);
        expect(changed.events[0].label).toBe("second");
        expect(changed.events[0]).not.toBe(next);
        expect(original.events[0].label).toBe("first");
        expect([encode, decode]).toEqual([0, 0]);
    });

    it("supports optional nulls with disabled cloning hooks and enabled transport hooks", () => {
        let encoded = 0;
        let decoded = 0;
        class Model {
            @OptionalField(TSType.Value)
            @CustomSerialise<string | null, string>(
                value => { encoded++; return value === null ? "~" : `!${value}`; },
                value => { decoded++; return value === "~" ? null : value.slice(1); },
                "string",
                {handlesNull: true, usage: {cloneWith: false, duplicateInstance: false}}
            )
            note: string | null = null;
        }
        const source = new Model();
        expect(duplicateInstance(source).note).toBeNull();
        expect(cloneWith(source, {note: "ready"}).note).toBe("ready");
        expect([encoded, decoded]).toEqual([0, 0]);
        const wire = serialiseInstance(source);
        expect(wire.note).toBe("~");
        expect(createInstance(wire, Model).note).toBeNull();
        expect([encoded, decoded]).toEqual([1, 1]);
    });

    it("uses default legacy scope when only handlesNull is supplied", () => {
        let count = 0;
        class Model {
            @OptionalField(TSType.Value)
            @CustomSerialise<number | null, string>(
                v => { count++; return v === null ? "none" : String(v); },
                v => v === "none" ? null : Number(v),
                "string",
                true
            )
            value: number | null = 3;
        }
        const source = new Model();
        expect(duplicateInstance(source).value).toBe(3);
        expect(cloneWith(source, {value: 4}).value).toBe(4);
        expect(count).toBeGreaterThan(0);
    });

    it("does not run a throwing wire codec during clone/duplicate when excluded", () => {
        class Model {
            @Field(TSType.Value)
            @CustomSerialise<number, string>(
                _ => { throw new Error("wire-only encode error"); },
                _ => { throw new Error("wire-only decode error"); },
                "string",
                {usage: {cloneWith: false, duplicateInstance: false}}
            )
            count = 5;
        }
        const source = new Model();
        expect(duplicateInstance(source).count).toBe(5);
        expect(cloneWith(source, {count: 9}).count).toBe(9);
        expect(() => serialiseInstance(source)).toThrow(/wire-only encode error/);
    });

    it("preserves static class codecs as distinct from field-level usage controls", () => {
        let encodes = 0;
        let decodes = 0;
        class DateValue {
            constructor(public readonly iso: string) {}
            static serialise(value: DateValue) { encodes++; return value.iso; }
            static deserialise(value: string) { decodes++; return new DateValue(value); }
        }
        class Model {
            @Field(TSType.Value, DateValue)
            date = new DateValue("2026-10-09");
            @Field(TSType.Value)
            @CustomSerialise<number, string>(
                n => String(n),
                n => Number(n),
                "string",
                {usage: {duplicateInstance: false, cloneWith: false}}
            )
            count = 2;
        }
        const source = new Model();
        const copied = duplicateInstance(source);
        const altered = cloneWith(source, {count: 3});
        expect(copied.date).toBeInstanceOf(DateValue);
        expect(altered.date).toBeInstanceOf(DateValue);
        expect(copied.count).toBe(2);
        expect(altered.count).toBe(3);
        expect(encodes).toBeGreaterThan(0);
        expect(decodes).toBeGreaterThan(0);
    });

    it("maintains independent field scopes on one domain type", () => {
        let transport = 0;
        let clone = 0;
        class Model {
            @Field(TSType.Value)
            @CustomSerialise<number, string>(
                n => { transport++; return String(n); },
                n => Number(n),
                "string",
                {usage: {cloneWith: false, duplicateInstance: false}}
            )
            history = 1;
            @Field(TSType.Value)
            @CustomSerialise<number, string>(
                n => { clone++; return String(n); },
                n => Number(n),
                "string",
                {usage: {cloneWith: true, duplicateInstance: true}}
            )
            calculation = 2;
        }
        const source = new Model();
        const cloneResult = cloneWith(source, {history: 8, calculation: 9});
        expect([cloneResult.history, cloneResult.calculation]).toEqual([8, 9]);
        expect(transport).toBe(0);
        expect(clone).toBeGreaterThan(0);
        serialiseInstance(source);
        expect(transport).toBe(1);
    });
});
