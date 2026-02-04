import { describe, it, expect } from "vitest";
import {BypassConstructor, createInstance, Field, OptionalField, TSType} from "../src";

/* ------------------------------------------------------------------ */
/* Test domain models                                                  */
/* ------------------------------------------------------------------ */

@BypassConstructor({ bypassConstructor: true })
class WithDates {
  @Field(TSType.Value, Date)
  start!: Date;

  @Field(TSType.Value, Date)
  end!: Date;
}

@BypassConstructor({ bypassConstructor: true })
class Container {
  @Field(TSType.Array, WithDates)
  items!: WithDates[];
}

@BypassConstructor({ bypassConstructor: true })
class NestedContainer {
  @Field(TSType.Array, Container)
  containers!: Container[];
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe("TSType.Value + Date – hydration correctness", () => {

  it("hydrates Date fields on a direct object", () => {
    const inst = createInstance(
      {
        start: "2025-01-01T00:00:00.000Z",
        end: "2025-02-01T00:00:00.000Z",
      },
      WithDates,
      null,
      "root"
    ) as WithDates;

    expect(inst.start).toBeInstanceOf(Date);
    expect(inst.end).toBeInstanceOf(Date);
    expect(inst.start.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("hydrates Date fields inside an array of objects", () => {
    const inst = createInstance(
      {
        items: [
          {
            start: "2025-01-01T00:00:00.000Z",
            end: "2025-02-01T00:00:00.000Z",
          }
        ]
      },
      Container,
      null,
      "root"
    ) as Container;

    expect(inst.items).toHaveLength(1);
    expect(inst.items[0].start).toBeInstanceOf(Date);
    expect(inst.items[0].end).toBeInstanceOf(Date);
  });

  it("hydrates Date fields for every element in an array", () => {
    const inst = createInstance(
      {
        items: [
          {
            start: "2025-01-01T00:00:00.000Z",
            end: "2025-02-01T00:00:00.000Z",
          },
          {
            start: "2026-03-01T00:00:00.000Z",
            end: "2026-04-01T00:00:00.000Z",
          }
        ]
      },
      Container,
      null,
      "root"
    ) as Container;

    for (const item of inst.items) {
      expect(item.start).toBeInstanceOf(Date);
      expect(item.end).toBeInstanceOf(Date);
    }
  });

  it("hydrates Date fields in nested arrays (array → object → array → object)", () => {
    const inst = createInstance(
      {
        containers: [
          {
            items: [
              {
                start: "2025-01-01T00:00:00.000Z",
                end: "2025-02-01T00:00:00.000Z",
              }
            ]
          }
        ]
      },
      NestedContainer,
      null,
      "root"
    ) as NestedContainer;

    const item = inst.containers[0].items[0];

    expect(item.start).toBeInstanceOf(Date);
    expect(item.end).toBeInstanceOf(Date);
  });

  it("does not stringify Dates during hydration", () => {
    const inst = createInstance(
      {
        items: [
          {
            start: "2025-01-01T00:00:00.000Z",
            end: "2025-02-01T00:00:00.000Z",
          }
        ]
      },
      Container,
      null,
      "root"
    ) as Container;

    expect(typeof inst.items[0].start).not.toBe("string");
    expect(typeof inst.items[0].end).not.toBe("string");
  });

  it("preserves Invalid Date semantics (JS Date behavior)", () => {
    const inst = createInstance(
      {
        items: [
          {
            start: "not-a-date",
            end: "also-not-a-date",
          }
        ]
      },
      Container,
      null,
      "root"
    ) as Container;

    const { start, end } = inst.items[0];

    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
    expect(isNaN(start.getTime())).toBe(true);
    expect(isNaN(end.getTime())).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Regression guard                                                    */
/* ------------------------------------------------------------------ */

describe("Regression: array element field metadata propagation", () => {
  it("applies value instantiators when element type is inferred from array field", () => {
    const inst = createInstance(
      {
        items: [
          {
            start: "2025-01-01T00:00:00.000Z",
            end: "2025-02-01T00:00:00.000Z",
          }
        ]
      },
      Container,
      null,
      "root"
    ) as Container;

    expect(inst.items[0].start instanceof Date).toBe(true);
  });
});
