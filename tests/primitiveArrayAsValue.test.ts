import {describe, it, expect} from "vitest";

import {createInstance, TSType, Field} from "../src";
import {RIFTError} from "../src/utils/errors";

/* -------------------- types -------------------- */

interface TimePhasedEntry {
    date: Date;
    value: number;
    type: string;
    secondaryType: string;
    itemStableIdentifier: string;

    get itemType(): string;
}

class Container {
    @Field(TSType.Value)
    timePhasedData!: TimePhasedEntry[];
}

/* -------------------- tests -------------------- */

describe("createInstance – array of TSType.Value object-shaped entries", () => {
    it("assigns array entries verbatim", () => {
        const entry: TimePhasedEntry = {
            date: new Date("2024-01-01"),
            value: 42,
            type: "MAIN",
            secondaryType: "SUB",
            itemStableIdentifier: "abc",
            get itemType() {
                return `${this.type}:${this.secondaryType}`;
            }
        };

        const data = {
            timePhasedData: [entry]
        };

        const instance = createInstance(data, Container) as any;

        expect(instance.timePhasedData).toBe(data.timePhasedData);
        expect(instance.timePhasedData[0]).toBe(entry);
        expect(instance.timePhasedData[0].itemType).toBe("MAIN:SUB");
        expect(instance.timePhasedData[0].date).toBeInstanceOf(Date);
    });

    it("does not clone or rehydrate value entries", () => {
        const entry = {value: 1};

        const instance = createInstance(
            {timePhasedData: [entry]},
            Container
        ) as any;

        instance.timePhasedData[0].value = 99;

        expect(entry.value).toBe(99);
    });

    it("allows empty arrays", () => {
        const instance = createInstance(
            {timePhasedData: []},
            Container
        ) as any;

        expect(instance.timePhasedData).toEqual([]);
    });

    it("throws when required value field is missing", () => {
        expect(() =>
            createInstance({}, Container)
        ).toThrowError(RIFTError);
    });


    it("assigns non-array values verbatim for TSType.Value", () => {
        const obj = {value: 1};

        const instance = createInstance(
            {timePhasedData: obj},
            Container
        ) as any;

        expect(instance.timePhasedData).toBe(obj);
    });

});
