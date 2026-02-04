import { describe, it, expect } from "vitest";
import {
  createInstance,
  serialiseInstance,
  duplicateInstance,
  cloneWith,
  Field,
  Include,
  BypassConstructor,
  TSType,
} from "../src";

/* ------------------------------------------------------------------ */
/* Test domain models                                                  */
/* ------------------------------------------------------------------ */

@BypassConstructor()
class ExpandoTask {
  @Field(TSType.Value)
  id!: string;

  @Field(TSType.Expando)
  expando!: Record<string, any>;
}

@BypassConstructor()
class Container {
  @Field(TSType.Array, ExpandoTask)
  tasks!: ExpandoTask[];
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const NESTED_EXPANDO_INPUT = {
  tasks: [
    {
      id: "t1",
      expando: {
        scheduleIndicator: "Yes",
        nested: { x: 1 },
        list: [{ y: 2 }],
      },
    },
  ],
};

const FLATTENED_INPUT = {
  tasks: [
    {
      id: "t1",
      scheduleIndicator: "Yes",
      nested: { x: 1 },
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Hydration invariants                                                */
/* ------------------------------------------------------------------ */

describe("Expando hydration invariants", () => {
  it("hydrates explicit expando object verbatim", () => {
    const hydrated = createInstance<Container>(
      NESTED_EXPANDO_INPUT,
      Container
    );

    const task = hydrated.tasks[0];

    expect(task.expando).toEqual({
      scheduleIndicator: "Yes",
      nested: { x: 1 },
      list: [{ y: 2 }],
    });
  });

  it("hydrates flattened expandos into expando field", () => {
    const hydrated = createInstance<Container>(
      FLATTENED_INPUT,
      Container
    );

    expect(hydrated.tasks[0].expando).toEqual({
      scheduleIndicator: "Yes",
      nested: { x: 1 },
    });
  });

  it("throws on flattened expandos when errorForExtraProps=true", () => {
    expect(() =>
      createInstance<Container>(
        FLATTENED_INPUT,
        Container,
        null,
        "root",
        { errorForExtraProps: true }
      )
    ).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* Serialisation (non-flattened)                                       */
/* ------------------------------------------------------------------ */

describe("Expando serialisation (default / nested)", () => {
  it("serialises expando under expando key", () => {
    const hydrated = createInstance<Container>(
      NESTED_EXPANDO_INPUT,
      Container
    );

    const serialised = serialiseInstance(hydrated);

    expect(serialised.tasks[0]).toHaveProperty("expando");
    expect(serialised.tasks[0].expando).toEqual({
      scheduleIndicator: "Yes",
      nested: { x: 1 },
      list: [{ y: 2 }],
    });
  });

  it("does not flatten expando by default", () => {
    const hydrated = createInstance<Container>(
      NESTED_EXPANDO_INPUT,
      Container
    );

    const serialised = serialiseInstance(hydrated);

    expect(serialised.tasks[0].scheduleIndicator).toBeUndefined();
    expect(serialised.tasks[0].nested).toBeUndefined();
  });

  it("deep-clones nested expando objects", () => {
    const hydrated = createInstance<Container>(
      NESTED_EXPANDO_INPUT,
      Container
    );

    const serialised = serialiseInstance(hydrated);

    expect(serialised.tasks[0].expando).not.toBe(
      hydrated.tasks[0].expando
    );

    expect(serialised.tasks[0].expando.nested).not.toBe(
      hydrated.tasks[0].expando.nested
    );

    expect(serialised.tasks[0].expando.list).not.toBe(
      hydrated.tasks[0].expando.list
    );
  });
});

/* ------------------------------------------------------------------ */
/* Serialisation (flattened)                                           */
/* ------------------------------------------------------------------ */

describe("Expando serialisation (flattened)", () => {
  it("flattens expando keys to top-level", () => {
    const hydrated = createInstance<Container>(
      NESTED_EXPANDO_INPUT,
      Container
    );

    const serialised = serialiseInstance(hydrated, {
      flattenExpando: true,
    });

    expect(serialised.tasks[0].scheduleIndicator).toBe("Yes");
    expect(serialised.tasks[0].nested).toEqual({ x: 1 });
    expect(serialised.tasks[0].list).toEqual([{ y: 2 }]);
  });

  it("does not include expando key when flattened", () => {
    const hydrated = createInstance<Container>(
      NESTED_EXPANDO_INPUT,
      Container
    );

    const serialised = serialiseInstance(hydrated, {
      flattenExpando: true,
    });

    expect(serialised.tasks[0].expando).toBeUndefined();
  });

  it("deep-clones flattened expando values", () => {
    const hydrated = createInstance<Container>(
      NESTED_EXPANDO_INPUT,
      Container
    );

    const serialised = serialiseInstance(hydrated, {
      flattenExpando: true,
    });

    expect(serialised.tasks[0].nested).not.toBe(
      hydrated.tasks[0].expando.nested
    );
  });
});

/* ------------------------------------------------------------------ */
/* Round-trip integrity                                                */
/* ------------------------------------------------------------------ */

describe("Expando round-trip integrity", () => {
  it("round-trips nested expandos without loss", () => {
    const hydrated = createInstance<Container>(
      NESTED_EXPANDO_INPUT,
      Container
    );

    const serialised = serialiseInstance(hydrated);
    const rehydrated = createInstance<Container>(
      serialised,
      Container
    );

    expect(rehydrated.tasks[0].expando).toEqual({
      scheduleIndicator: "Yes",
      nested: { x: 1 },
      list: [{ y: 2 }],
    });
  });

  it("round-trips flattened expandos back into expando field", () => {
    const hydrated = createInstance<Container>(
      NESTED_EXPANDO_INPUT,
      Container
    );

    const flattened = serialiseInstance(hydrated, {
      flattenExpando: true,
    });

    const rehydrated = createInstance<Container>(
      flattened,
      Container
    );

    expect(rehydrated.tasks[0].expando).toEqual({
      scheduleIndicator: "Yes",
      nested: { x: 1 },
      list: [{ y: 2 }],
    });
  });
});

/* ------------------------------------------------------------------ */
/* duplicateInstance / cloneWith                                      */
/* ------------------------------------------------------------------ */

describe("Expando cloning semantics", () => {
  it("duplicateInstance deep-copies expandos", () => {
    const hydrated = createInstance<Container>(
      NESTED_EXPANDO_INPUT,
      Container
    );

    const dup = duplicateInstance(hydrated);

    expect(dup.tasks[0].expando).not.toBe(
      hydrated.tasks[0].expando
    );
  });

  it("mutating duplicate expando does not affect original", () => {
    const hydrated = createInstance<Container>(
      NESTED_EXPANDO_INPUT,
      Container
    );

    const dup = duplicateInstance(hydrated);

    dup.tasks[0].expando.scheduleIndicator = "No";

    expect(hydrated.tasks[0].expando.scheduleIndicator).toBe(
      "Yes"
    );
    expect(dup.tasks[0].expando.scheduleIndicator).toBe("No");
  });

  it("cloneWith preserves expando contents", () => {
    const hydrated = createInstance<Container>(
      NESTED_EXPANDO_INPUT,
      Container
    );

    const cloned = cloneWith(hydrated.tasks[0], {
      id: "t2",
    });

    expect(cloned.expando).toEqual({
      scheduleIndicator: "Yes",
      nested: { x: 1 },
      list: [{ y: 2 }],
    });
  });
});
