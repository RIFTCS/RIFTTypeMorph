import {describe, it, expect} from "vitest";
import {
    createInstance,
    serialiseInstance,
    duplicateInstance,
    cloneWith,
    Field,
    Include,
    OptionalField,
    BypassConstructor,
    TSType,
} from "../src";

/* ------------------------------------------------------------------ */
/* Domain model (matches production shape)                             */

/* ------------------------------------------------------------------ */

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

    @Field(TSType.Expando)
    expando!: Record<string, any>;
}

@BypassConstructor()
class GanttChartData {
    @Field(TSType.Array, Task)
    tasks!: Task[];
}

/* ------------------------------------------------------------------ */
/* Test data                                                          */
/* ------------------------------------------------------------------ */

const INPUT = {
    tasks: [
        {
            id: "t1",
            name: "Task 1",
            order: 1,
            start: "2025-08-24T14:00:00.000Z",
            end: "2026-02-08T14:00:00.000Z",
            extra: {
                scheduleIndicator: "Yes",
                nested: {x: 1},
            },
        },
    ],
};

/* ------------------------------------------------------------------ */
/* Hydration tests                                                     */
/* ------------------------------------------------------------------ */

describe("createInstance – hydration invariants", () => {
    it("hydrates Date fields from ISO strings", () => {
        const gantt = createInstance<GanttChartData>(INPUT, GanttChartData);
        const task = gantt.tasks[0];

        expect(task.start).toBeInstanceOf(Date);
        expect(task.end).toBeInstanceOf(Date);

        expect(task.start.toISOString()).toBe(INPUT.tasks[0].start);
        expect(task.end.toISOString()).toBe(INPUT.tasks[0].end);
    });

    it("hydrates expandos as objects under the expando field", () => {
        const gantt = createInstance<GanttChartData>(INPUT, GanttChartData);
        const task = gantt.tasks[0];

        expect(task.expando).toBeDefined();
        expect(typeof task.expando).toBe("object");

        expect(task.expando.extra).toEqual({
            scheduleIndicator: "Yes",
            nested: {x: 1},
        });
    });


    it("hydrates included getters", () => {
        const gantt = createInstance<GanttChartData>(INPUT, GanttChartData);
        const task = gantt.tasks[0];

        expect(task.stableIdentifier).toBe("t1");
    });
});

/* ------------------------------------------------------------------ */
/* Serialisation boundary tests (THE IMPORTANT PART)                   */
/* ------------------------------------------------------------------ */

describe("serialiseInstance – hard boundary guarantees", () => {
    it("returns plain JSON-compatible data only", () => {
        const gantt = createInstance<GanttChartData>(INPUT, GanttChartData);
        const serialised = serialiseInstance(gantt);

        const task = serialised.tasks[0];

        expect(typeof task.start).toBe("string");
        expect(typeof task.end).toBe("string");

        expect(task.start).toBe(INPUT.tasks[0].start);
        expect(task.end).toBe(INPUT.tasks[0].end);
    });

    it("does not leak Date objects", () => {
        const gantt = createInstance<GanttChartData>(INPUT, GanttChartData);
        const serialised = serialiseInstance(gantt);

        expect(serialised.tasks[0].start instanceof Date).toBe(false);
        expect(serialised.tasks[0].end instanceof Date).toBe(false);
    });

    it("deep-clones expandos (no shared references)", () => {
        const gantt = createInstance<GanttChartData>(INPUT, GanttChartData);
        const serialised = serialiseInstance(gantt);

        expect(serialised.tasks[0].expando).not.toBe(
            gantt.tasks[0].expando
        );

        expect(serialised.tasks[0].expando.extra).not.toBe(
            gantt.tasks[0].expando.extra
        );

        expect(serialised.tasks[0].expando.extra.nested).not.toBe(
            gantt.tasks[0].expando.extra.nested
        );


    });

    it("serialises included getters as values", () => {
        const gantt = createInstance<GanttChartData>(INPUT, GanttChartData);
        const serialised = serialiseInstance(gantt);

        expect(serialised.tasks[0].stableIdentifier).toBe("t1");
    });
});

/* ------------------------------------------------------------------ */
/* Round-trip integrity                                                */
/* ------------------------------------------------------------------ */

describe("createInstance ⟷ serialiseInstance round trip", () => {
    it("round-trips expandos without loss", () => {
        const hydrated = createInstance<GanttChartData>(INPUT, GanttChartData);
        const serialised = serialiseInstance(hydrated);
        const rehydrated = createInstance<GanttChartData>(
            serialised,
            GanttChartData
        );

        const task = rehydrated.tasks[0];

        expect(task.expando.extra.scheduleIndicator).toBe("Yes");
        expect(task.expando.extra.nested.x).toBe(1);
    });

});

/* ------------------------------------------------------------------ */
/* duplicateInstance / cloneWith invariants                             */
/* ------------------------------------------------------------------ */

describe("duplicateInstance / cloneWith invariants", () => {
    it("duplicateInstance creates a deep copy", () => {
        const gantt = createInstance<GanttChartData>(INPUT, GanttChartData);
        const dup = duplicateInstance(gantt);

        expect(dup).not.toBe(gantt);
        expect(dup.tasks[0]).not.toBe(gantt.tasks[0]);
        expect(dup.tasks[0].expando).not.toBe(gantt.tasks[0].expando);
    });

    it("mutating duplicate does not affect original", () => {
        const gantt = createInstance<GanttChartData>(INPUT, GanttChartData);
        const dup = duplicateInstance(gantt);

        dup.tasks[0].expando.extra.scheduleIndicator = "No";

        expect(gantt.tasks[0].expando.extra.scheduleIndicator).toBe("Yes");
        expect(dup.tasks[0].expando.extra.scheduleIndicator).toBe("No");
    });


    it("cloneWith updates only specified fields", () => {
        const gantt = createInstance<GanttChartData>(INPUT, GanttChartData);
        const task = gantt.tasks[0];

        const cloned = cloneWith(task, {
            name: "Updated",
        });

        expect(cloned.name).toBe("Updated");
        expect(cloned.id).toBe(task.id);
        expect(cloned.start.toISOString()).toBe(
            task.start.toISOString()
        );
    });
});

/* ------------------------------------------------------------------ */
/* Regression test – the bug we just fixed                              */
/* ------------------------------------------------------------------ */

describe("REGRESSION: Date must not silently degrade to string", () => {
    it("does not leave Dates as strings after createInstance", () => {
        const gantt = createInstance<GanttChartData>(INPUT, GanttChartData);
        const task = gantt.tasks[0];

        expect(typeof task.start).toBe("object");
        expect(task.start instanceof Date).toBe(true);
    });
});

{

    /* ---------------- test domain ---------------- */

    @BypassConstructor()
    class Task {
        @Field(TSType.Value)
        id!: string;

        @Field(TSType.Expando)
        expando!: Record<string, any>;
    }

    @BypassConstructor()
    class Container {
        @Field(TSType.Array, Task)
        tasks!: Task[];
    }

    const INPUT = {
        tasks: [
            {
                id: "t1",
                expando: {
                    scheduleIndicator: "Yes",
                    nested: {x: 1},
                },
            },
        ],
    };

    /* ---------------- tests ---------------- */

    describe("Expando serialisation options", () => {
        it("serialises expandos nested by default", () => {
            const hydrated = createInstance<Container>(INPUT, Container);

            const serialised = serialiseInstance(hydrated);

            expect(serialised.tasks[0]).toHaveProperty("expando");
            expect(serialised.tasks[0].expando).toEqual({
                scheduleIndicator: "Yes",
                nested: {x: 1},
            });

            // Ensure NOT flattened
            expect(serialised.tasks[0].scheduleIndicator).toBeUndefined();
        });

        it("hydrates nested expandos correctly by default", () => {
            const hydrated = createInstance<Container>(INPUT, Container);

            const task = hydrated.tasks[0];

            expect(task.expando).toEqual({
                scheduleIndicator: "Yes",
                nested: {x: 1},
            });
        });

        it("round-trips nested expandos without loss", () => {
            const hydrated = createInstance<Container>(INPUT, Container);

            const serialised = serialiseInstance(hydrated);
            const rehydrated = createInstance<Container>(serialised, Container);

            expect(rehydrated.tasks[0].expando.scheduleIndicator).toBe("Yes");
            expect(rehydrated.tasks[0].expando.nested.x).toBe(1);
        });

        it("flattens expandos when flattenExpando=true", () => {
            const hydrated = createInstance<Container>(INPUT, Container);

            const serialised = serialiseInstance(hydrated, null, "root", {
                flattenExpando: true,
            });

            expect(serialised.tasks[0].scheduleIndicator).toBe("Yes");
            expect(serialised.tasks[0].nested).toEqual({x: 1});

            // Expando key should not exist
            expect(serialised.tasks[0].expando).toBeUndefined();
        });

        it("rehydrates flattened expandos back into expando", () => {
            const hydrated = createInstance<Container>(INPUT, Container);

            const flattened = serialiseInstance(hydrated, null, "root", {
                flattenExpando: true,
            });

            const rehydrated = createInstance<Container>(flattened, Container);

            expect(rehydrated.tasks[0].expando).toEqual({
                scheduleIndicator: "Yes",
                nested: {x: 1},
            });
        });

        it("duplicateInstance deep-copies expandos (no mutation leak)", () => {
            const hydrated = createInstance<Container>(INPUT, Container);
            const dup = duplicateInstance(hydrated);

            dup.tasks[0].expando.scheduleIndicator = "No";

            expect(hydrated.tasks[0].expando.scheduleIndicator).toBe("Yes");
            expect(dup.tasks[0].expando.scheduleIndicator).toBe("No");
        });

        it("errorForExtraProps rejects flattened expandos when flattenExpando=false", () => {
            const badInput = {
                tasks: [
                    {
                        id: "t1",
                        scheduleIndicator: "Yes",
                    },
                ],
            };

            expect(() =>
                createInstance<Container>(
                    badInput,
                    Container,
                    null,
                    "root",
                    {errorForExtraProps: true}
                )
            ).toThrow();
        });

        it("flattenExpando allows extra props without error", () => {
            const badInput = {
                tasks: [
                    {
                        id: "t1",
                        scheduleIndicator: "Yes",
                    },
                ],
            };

            const hydrated = createInstance<Container>(
                badInput,
                Container,
                null,
                "root"
            );

            const serialised = serialiseInstance(hydrated, null, "root", {
                flattenExpando: true,
            });

            expect(serialised.tasks[0].scheduleIndicator).toBe("Yes");
        });
    });
}