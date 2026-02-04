import { describe, it, expect } from "vitest";
import {createInstance, serialiseInstance} from "../src";
import { Field, Include, BypassConstructor, TSType } from "../src";


/* ---------------- domain types ---------------- */

@BypassConstructor()
abstract class ScheduleItem {
  @Field(TSType.Value)
  order!: number;
  abstract get stableIdentifier(): string;
}

@BypassConstructor()
class Task extends ScheduleItem {
  @Field(TSType.Value)
  id!: string;

  @Include
  get stableIdentifier(): string {
    return this.id;
  }

  @Field(TSType.Value)
  name!: string;

  @Field(TSType.Value, Date)
  start!: Date;

  @Field(TSType.Value, Date)
  end!: Date;
}

@BypassConstructor()
class GanttChartData {
  @Field(TSType.Array, Task)
  tasks!: Task[];
}

describe("Date hydration across JSON boundary", () => {
  it("rehydrates Dates after JSON stringify/parse", () => {
    const hydrated = createInstance<GanttChartData>(
      {
        tasks: [
          {
            id: "t1",
            name: "Task 1",
            order: 1,
            start: "2025-08-24T14:00:00.000Z",
            end: "2026-02-08T14:00:00.000Z",
          },
        ],
      },
      GanttChartData
    );

    // sanity
    expect(hydrated.tasks[0].start).toBeInstanceOf(Date);

    // what your app *actually* does
    const wire = JSON.parse(JSON.stringify(serialiseInstance(hydrated)));

    expect(typeof wire.tasks[0].start).toBe("string");

    const rehydrated = createInstance<GanttChartData>(
      wire,
      GanttChartData
    );

    // 🔴 THIS is the real failure
    expect(rehydrated.tasks[0].start).toBeInstanceOf(Date);
    expect(rehydrated.tasks[0].end).toBeInstanceOf(Date);
  });
});
