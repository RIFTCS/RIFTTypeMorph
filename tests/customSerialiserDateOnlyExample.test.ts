import {describe, it, expect} from "vitest";
import {cloneWith, duplicateInstance, Field, OptionalField} from "../src";
import {TSType} from "../src/core/TSType";
import {serialiseInstance} from "../src/core/serialiseInstance";
import {createInstance} from "../src/core/createInstance";
import {CustomSerialise} from "../src/decorators/customSerialiser";
import {RIFTError} from "../src/utils/errors";

export class DateOnlyA {
    private _value: string;

    constructor();
    constructor(value: string | number | Date | DateOnlyA);
    constructor(year: number, monthIndex: number, day: number);
    constructor(
        ...args:
            | []
            | [string | number | Date | DateOnlyA]
            | [number, number, number]
    ) {
        if (args.length === 0) {
            const now = new Date();
            this._value = DateOnlyA.formatPartsUTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate()
            );
            return;
        }

        if (args.length === 1) {
            this._value = DateOnlyA.normaliseUnknownInput(args[0]);
            return;
        }

        const [year, monthIndex, day] = args;
        this._value = DateOnlyA.formatPartsUTC(year, monthIndex, day);
    }

    static serialise(
        value: DateOnlyA | Date | string | number | null | undefined
    ): string | null {
        if (value === null || value === undefined) {
            return null;
        }

        return DateOnlyA.normaliseUnknownInput(value);
    }

    static deserialise(value: unknown): DateOnlyA | null {
        if (value === null || value === undefined) {
            return null;
        }

        if (value instanceof DateOnlyA) {
            return value;
        }

        if (value instanceof Date) {
            return new DateOnlyA(
                DateOnlyA.formatPartsUTC(
                    value.getUTCFullYear(),
                    value.getUTCMonth(),
                    value.getUTCDate()
                )
            );
        }

        if (typeof value === "number") {
            const d = new Date(value);

            if (Number.isNaN(d.getTime())) {
                throw new TypeError(`Invalid DateOnly numeric input: ${value}`);
            }

            return new DateOnlyA(
                DateOnlyA.formatPartsUTC(
                    d.getUTCFullYear(),
                    d.getUTCMonth(),
                    d.getUTCDate()
                )
            );
        }

        if (typeof value === "string") {
            const trimmed = value.trim();

            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                return new DateOnlyA(DateOnlyA.normalizeDateString(trimmed));
            }

            const parsed = new Date(trimmed);

            if (!Number.isNaN(parsed.getTime())) {
                return new DateOnlyA(
                    DateOnlyA.formatPartsUTC(
                        parsed.getUTCFullYear(),
                        parsed.getUTCMonth(),
                        parsed.getUTCDate()
                    )
                );
            }

            throw new TypeError(
                `Invalid DateOnly string: "${value}". Expected YYYY-MM-DD or a valid UTC datetime string.`
            );
        }

        throw new TypeError(
            `Unsupported DateOnly input type: ${value === null ? "null" : typeof value}`
        );
    }

    valueOf(): number {
        return this.getTime();
    }

    getTime(): number {
        return Date.parse(`${this._value}T00:00:00.000Z`);
    }

    toString(): string {
        return this._value;
    }

    toISOString(): string {
        return `${this._value}T00:00:00.000Z`;
    }

    toPlainString(): string {
        return this._value;
    }

    [Symbol.toPrimitive](hint: "default"): string;
    [Symbol.toPrimitive](hint: "string"): string;
    [Symbol.toPrimitive](hint: "number"): number;
    [Symbol.toPrimitive](hint: string): string | number {
        if (hint === "number") {
            return this.getTime();
        }

        return this._value;
    }


    private static normaliseUnknownInput(value: unknown): string {
        if (value instanceof DateOnlyA) {
            return value.toPlainString();
        }

        if (value instanceof Date) {
            return DateOnlyA.formatPartsUTC(
                value.getUTCFullYear(),
                value.getUTCMonth(),
                value.getUTCDate()
            );
        }

        if (typeof value === "number") {
            const d = new Date(value);

            if (Number.isNaN(d.getTime())) {
                throw new TypeError(`Invalid DateOnly numeric input: ${value}`);
            }

            return DateOnlyA.formatPartsUTC(
                d.getUTCFullYear(),
                d.getUTCMonth(),
                d.getUTCDate()
            );
        }

        if (typeof value === "string") {
            const trimmed = value.trim();

            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                return DateOnlyA.normalizeDateString(trimmed);
            }

            const parsed = new Date(trimmed);

            if (!Number.isNaN(parsed.getTime())) {
                return DateOnlyA.formatPartsUTC(
                    parsed.getUTCFullYear(),
                    parsed.getUTCMonth(),
                    parsed.getUTCDate()
                );
            }

            throw new TypeError(
                `Invalid DateOnly string: "${value}". Expected YYYY-MM-DD or a valid legacy Date string.`
            );
        }

        throw new TypeError(
            `Unsupported DateOnly input type: ${value === null ? "null" : typeof value}`
        );
    }

    private static normalizeDateString(value: string): string {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

        if (!match) {
            throw new TypeError(
                `Invalid DateOnly string: "${value}". Expected YYYY-MM-DD.`
            );
        }

        const year = Number(match[1]);
        const monthIndex = Number(match[2]) - 1;
        const day = Number(match[3]);

        const d = new Date(Date.UTC(year, monthIndex, day));

        if (
            d.getUTCFullYear() !== year ||
            d.getUTCMonth() !== monthIndex ||
            d.getUTCDate() !== day
        ) {
            throw new RangeError(`Invalid calendar date: ${value}`);
        }

        const yyyy = String(year).padStart(4, "0");
        const mm = String(monthIndex + 1).padStart(2, "0");
        const dd = String(day).padStart(2, "0");

        return `${yyyy}-${mm}-${dd}`;
    }

    private static formatPartsUTC(year: number, monthIndex: number, day: number): string {
        const d = new Date(Date.UTC(year, monthIndex, day));

        if (Number.isNaN(d.getTime())) {
            throw new RangeError(
                `Invalid calendar date input: ${year}-${monthIndex + 1}-${day}`
            );
        }

        const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");

        return `${yyyy}-${mm}-${dd}`;
    }
}

it("hydrates DateOnly task fields from ISO datetime strings without degrading them into plain objects", () => {
    class Task {
        @Field(TSType.Value)
        id!: string;

        @Field(TSType.Value)
        name!: string;

        @Field(TSType.Value, DateOnlyA)
        start!: DateOnlyA;

        @Field(TSType.Value, DateOnlyA)
        end!: DateOnlyA;
    }

    class GanttChartData {
        @Field(TSType.Array, Task)
        tasks!: Task[];
    }

    const json = {
        tasks: [
            {
                id: "0",
                name: "Test Implementation",
                start: "2025-08-23T22:00:00.000Z",
                end: "2026-02-11T14:00:00.000Z"
            }
        ]
    };

    const restored = createInstance(json, GanttChartData);

    expect(restored.tasks).toHaveLength(1);

    const task = restored.tasks[0];

    expect(task.start).toBeInstanceOf(DateOnlyA);
    expect(task.end).toBeInstanceOf(DateOnlyA);

    expect(task.start.constructor).toBe(DateOnlyA);
    expect(task.end.constructor).toBe(DateOnlyA);

    expect(Object.getPrototypeOf(task.start)).toBe(DateOnlyA.prototype);
    expect(Object.getPrototypeOf(task.end)).toBe(DateOnlyA.prototype);

    expect(task.start.toPlainString()).toBe("2025-08-23");
    expect(task.end.toPlainString()).toBe("2026-02-11");

    const roundTripped = serialiseInstance(restored);

    expect(roundTripped).toEqual({
        tasks: [
            {
                id: "0",
                name: "Test Implementation",
                start: "2025-08-23",
                end: "2026-02-11"
            }
        ]
    });

    expect(roundTripped.tasks[0].start).toBe("2025-08-23");
    expect(roundTripped.tasks[0].end).toBe("2026-02-11");
    expect(typeof roundTripped.tasks[0].start).toBe("string");
    expect(typeof roundTripped.tasks[0].end).toBe("string");
});


class DateOnly {
    private _value: string;

    constructor(value: string | number | Date | DateOnly) {
        this._value = DateOnly.normaliseUnknownInput(value);
    }

    static serialise(
        value: DateOnly | Date | string | number | null | undefined
    ): string | null {
        if (value === null || value === undefined) {
            return null;
        }

        return DateOnly.normaliseUnknownInput(value);
    }

    static deserialise(value: unknown): DateOnly | null {
        if (value === null || value === undefined) {
            return null;
        }

        return new DateOnly(DateOnly.normaliseUnknownInput(value));
    }

    toPlainString(): string {
        return this._value;
    }

    toJSON(): string {
        return this._value;
    }

    private static normaliseUnknownInput(value: unknown): string {
        if (value instanceof DateOnly) {
            return value.toPlainString();
        }

        if (value instanceof Date) {
            return DateOnly.formatPartsUTC(
                value.getUTCFullYear(),
                value.getUTCMonth(),
                value.getUTCDate()
            );
        }

        if (typeof value === "number") {
            const d = new Date(value);

            if (Number.isNaN(d.getTime())) {
                throw new TypeError(`Invalid DateOnly numeric input: ${value}`);
            }

            return DateOnly.formatPartsUTC(
                d.getUTCFullYear(),
                d.getUTCMonth(),
                d.getUTCDate()
            );
        }

        if (typeof value === "string") {
            const trimmed = value.trim();

            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                return trimmed;
            }

            const parsed = new Date(trimmed);

            if (!Number.isNaN(parsed.getTime())) {
                return DateOnly.formatPartsUTC(
                    parsed.getUTCFullYear(),
                    parsed.getUTCMonth(),
                    parsed.getUTCDate()
                );
            }

            throw new TypeError(`Invalid DateOnly string: "${value}"`);
        }

        throw new TypeError(
            `Unsupported DateOnly input type: ${value === null ? "null" : typeof value}`
        );
    }

    private static formatPartsUTC(year: number, monthIndex: number, day: number): string {
        const d = new Date(Date.UTC(year, monthIndex, day));

        if (
            d.getUTCFullYear() !== year ||
            d.getUTCMonth() !== monthIndex ||
            d.getUTCDate() !== day
        ) {
            throw new RangeError(`Invalid calendar date: ${year}-${monthIndex + 1}-${day}`);
        }

        const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");

        return `${yyyy}-${mm}-${dd}`;
    }
}

describe("TypeMorph runtime contract - duplicate/clone regression", () => {
    it("duplicateInstance preserves value-object fields as instances and reserialises them as strings", () => {
        class Task {
            @Field(TSType.Value, DateOnly)
            start!: DateOnly;

            @Field(TSType.Value, DateOnly)
            end!: DateOnly;
        }

        const hydrated = createInstance(
            {
                start: "2025-08-23T22:00:00.000Z",
                end: "2026-02-11T14:00:00.000Z"
            },
            Task
        );

        expect(hydrated.start).toBeInstanceOf(DateOnly);
        expect(hydrated.end).toBeInstanceOf(DateOnly);
        expect(hydrated.start.toPlainString()).toBe("2025-08-23");
        expect(hydrated.end.toPlainString()).toBe("2026-02-11");

        const duplicated = duplicateInstance(hydrated);

        expect(duplicated.start).toBeInstanceOf(DateOnly);
        expect(duplicated.end).toBeInstanceOf(DateOnly);
        expect(duplicated.start.toPlainString()).toBe("2025-08-23");
        expect(duplicated.end.toPlainString()).toBe("2026-02-11");

        const serialised = serialiseInstance(duplicated);

        expect(serialised).toEqual({
            start: "2025-08-23",
            end: "2026-02-11"
        });
        expect(serialised.start).not.toEqual({_value: "2025-08-23"});
        expect(serialised.end).not.toEqual({_value: "2026-02-11"});
    });

    it("cloneWith preserves untouched DateOnly fields as instances and wire strings", () => {
        class Task {
            @Field(TSType.Value)
            name!: string;

            @Field(TSType.Value, DateOnly)
            start!: DateOnly;

            @Field(TSType.Value, DateOnly)
            end!: DateOnly;
        }

        const hydrated = createInstance(
            {
                name: "Task A",
                start: "2025-08-23T22:00:00.000Z",
                end: "2026-02-11T14:00:00.000Z"
            },
            Task
        );

        const cloned = cloneWith(hydrated, {name: "Task B"});

        expect(cloned.start).toBeInstanceOf(DateOnly);
        expect(cloned.end).toBeInstanceOf(DateOnly);
        expect(cloned.start.toPlainString()).toBe("2025-08-23");
        expect(cloned.end.toPlainString()).toBe("2026-02-11");

        const serialised = serialiseInstance(cloned);

        expect(serialised).toEqual({
            name: "Task B",
            start: "2025-08-23",
            end: "2026-02-11"
        });
        expect(serialised.start).not.toEqual({_value: "2025-08-23"});
        expect(serialised.end).not.toEqual({_value: "2026-02-11"});
    });

    it("duplicateInstance does not flatten nested value objects into plain object payloads", () => {
        class Task {
            @Field(TSType.Value, DateOnly)
            start!: DateOnly;
        }

        class Project {
            @Field(TSType.Array, Task)
            tasks!: Task[];
        }

        const hydrated = createInstance(
            {
                tasks: [
                    {start: "2025-08-23T22:00:00.000Z"},
                    {start: "2025-08-24T22:00:00.000Z"}
                ]
            },
            Project
        );

        const duplicated = duplicateInstance(hydrated);

        expect(duplicated.tasks[0].start).toBeInstanceOf(DateOnly);
        expect(duplicated.tasks[1].start).toBeInstanceOf(DateOnly);

        const serialised = serialiseInstance(duplicated);

        expect(serialised.tasks).toEqual([
            {start: "2025-08-23"},
            {start: "2025-08-24"}
        ]);
        expect(serialised.tasks[0].start).not.toEqual({_value: "2025-08-23"});
        expect(serialised.tasks[1].start).not.toEqual({_value: "2025-08-24"});
    });
});