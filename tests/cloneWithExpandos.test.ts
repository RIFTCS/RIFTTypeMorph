import {describe, expect, it} from "vitest";
import {RIFTError} from "../src/utils/errors";
import {cloneWith, Field, Include, OptionalField, TSType} from "../src";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function expectExpandoEqual(
    obj: any,
    expected: Record<string, any>
) {
    expect(obj).toHaveProperty("_extra");
    expect(obj._extra).toEqual(expected);
}

/*
|--------------------------------------------------------------------------
| 1. Basic expando preservation
|--------------------------------------------------------------------------
*/

describe("cloneWith – expando preservation", () => {
    class Task {
        @Field(TSType.Value)
        id!: string;

        @Field(TSType.Value)
        title!: string;

        @Field(TSType.Expando)
        _extra!: Record<string, any>;
    }

    it("preserves expando data when cloning with no changes", () => {
        const t = new Task();
        t.id = "1";
        t.title = "A";
        t._extra = {foo: 1, bar: 2};

        const c = cloneWith(t, {});

        expect(c).toBeInstanceOf(Task);
        expect(c.id).toBe("1");
        expect(c.title).toBe("A");
        expectExpandoEqual(c, {foo: 1, bar: 2});
    });

    it("preserves expando data when cloning with schema changes", () => {
        const t = new Task();
        t.id = "1";
        t.title = "A";
        t._extra = {foo: 1};

        const c = cloneWith(t, {title: "B"});

        expect(c.title).toBe("B");
        expectExpandoEqual(c, {foo: 1});
    });
});

/*
|--------------------------------------------------------------------------
| 2. Expando immutability
|--------------------------------------------------------------------------
*/

describe("cloneWith – expando immutability", () => {
    class Task {
        @Field(TSType.Value)
        id!: string;

        @Field(TSType.Expando)
        _extra!: Record<string, any>;
    }

    it("throws if expando keys are attempted as top-level changes", () => {
        const t = new Task();
        t.id = "1";
        t._extra = {foo: 123};

        expect(() =>
            cloneWith(t, {
                // @ts-expect-error
                foo: 999
            })
        ).toThrow(RIFTError);
    });
});

/*
|--------------------------------------------------------------------------
| 3. Custom serialise / deserialise round-trip
|--------------------------------------------------------------------------
*/

describe("cloneWith – custom serialise/deserialise", () => {
    class A {
        @Field(TSType.Value)
        value!: number;

        static serialise(obj: A) {
            return {v: obj.value};
        }

        static deserialise(data: any) {
            const a = new A();
            a.value = data.v * 2;
            return a;
        }
    }

    it("round-trips correctly with no changes", () => {
        const a = new A();
        a.value = 5;

        const b = cloneWith(a, {});

        expect(b).toBeInstanceOf(A);
        expect(b.value).toBe(10);
    });

    it("round-trips correctly with schema changes applied to serialised shape", () => {
        const a = new A();
        a.value = 5;

        const b = cloneWith(a, {value: 7});

        // serialise => { v: 7 }
        // deserialise => 14
        expect(b.value).toBe(14);
    });
});

/*
|--------------------------------------------------------------------------
| 4. Spread-style update semantics (base + updates)
|--------------------------------------------------------------------------
*/

describe("cloneWith – spread-style update semantics", () => {
    class Task {
        @Field(TSType.Value)
        id!: string;

        @Field(TSType.Value)
        status!: string;

        @OptionalField(TSType.Value)
        score?: number;

        @Field(TSType.Expando)
        _extra!: Record<string, any>;
    }

    it("behaves like { ...base, ...updates } but schema-safe", () => {
        const base = new Task();
        base.id = "t1";
        base.status = "open";
        base.score = 10;
        base._extra = {derived: false};

        const updates = {
            status: "done",
            score: 20
        };

        const next = cloneWith(base, updates);

        expect(next.status).toBe("done");
        expect(next.score).toBe(20);
        expectExpandoEqual(next, {derived: false});
    });
});

/*
|--------------------------------------------------------------------------
| 5. Multi-stage clone pipelines (base -> candidate -> recalculated)
|--------------------------------------------------------------------------
*/

describe("cloneWith – multi-stage pipelines", () => {
    class Task {
        @Field(TSType.Value)
        id!: string;

        @Field(TSType.Value)
        cost!: number;

        @Field(TSType.Expando)
        _extra!: Record<string, any>;
    }

    it("preserves expando through multiple clone passes", () => {
        const base = new Task();
        base.id = "x";
        base.cost = 10;
        base._extra = {cached: true};

        const candidate = cloneWith(base, {
            cost: 20
        });

        const recalculated = cloneWith(candidate, {
            cost: candidate.cost * 1.5
        });

        expect(recalculated.cost).toBe(30);
        expectExpandoEqual(recalculated, {cached: true});
    });
});

/*
|--------------------------------------------------------------------------
| 6. Regression: schema-only copy does NOT drop serialised-only fields
|--------------------------------------------------------------------------
*/

describe("cloneWith – serialised-only field preservation", () => {
    class A {
        @Field(TSType.Value)
        value!: number;

        static serialise(obj: A) {
            return {
                v: obj.value,
                meta: "opaque"
            };
        }

        static deserialise(data: any) {
            const a = new A();
            a.value = data.v;
            return a;
        }
    }

    it("does not drop non-schema serialised fields", () => {
        const a = new A();
        a.value = 3;

        const b = cloneWith(a, {});

        expect(b.value).toBe(3);
    });
});


/*
|--------------------------------------------------------------------------
| 1. Custom serialise + schema changes (boundary semantics)
|--------------------------------------------------------------------------
*/

describe("cloneWith – custom serialise boundary behavior", () => {
    class A {
        @Field(TSType.Value)
        value!: number;

        static serialise(obj: A) {
            return {v: obj.value};
        }

        static deserialise(data: any) {
            const a = new A();
            a.value = data.v * 2;
            return a;
        }
    }

    it("applies schema changes via re-serialisation (non-empty changes)", () => {
        const a = new A();
        a.value = 3;

        const b = cloneWith(a, {value: 4});

        // serialise({ value: 4 }) -> { v: 4 }
        // deserialise -> 8
        expect(b.value).toBe(8);
    });

    it("does not re-serialise when changes are empty", () => {
        const a = new A();
        a.value = 3;

        const b = cloneWith(a, {});

        // single round-trip only
        expect(b.value).toBe(6);
    });
});

/*
|--------------------------------------------------------------------------
| 2. Included field protection
|--------------------------------------------------------------------------
*/

describe("cloneWith – included field protection", () => {
    class B {
        @Field(TSType.Value)
        value!: number;

        @Include
        get doubled() {
            return this.value * 2;
        }
    }

    it("throws when attempting to modify an @Include field", () => {
        const b = new B();
        b.value = 5;

        expect(() =>
            cloneWith(b, {
                doubled: 100
            })
        ).toThrow(RIFTError);
    });
});

/*
|--------------------------------------------------------------------------
| 3. Expando mutation boundaries (TSType.Expando)
|--------------------------------------------------------------------------
*/

describe("cloneWith – expando mutation boundaries", () => {
    class C {
        @Field(TSType.Value)
        id!: string;

        @Field(TSType.Expando)
        _extra!: Record<string, any>;
    }

    it("merges expando keys instead of throwing", () => {
        const t = new C();
        t.id = "1";
        t._extra = {a: 1};

        const t2 = cloneWith(t, {
            _extra: {a: 2}
        });

        expect(t2._extra).toEqual({a: 2});
    });

    it("throws if expando is replaced with a non-object", () => {
        const t = new C();
        t.id = "1";
        t._extra = {a: 1};

        expect(() =>
            cloneWith(t, {
                _extra: 2 as any
            })
        ).toThrow(RIFTError);
    });

    it("throws if expando is replaced with null", () => {
        const t = new C();
        t.id = "1";
        t._extra = {a: 1};

        expect(() =>
            cloneWith(t, {
                _extra: null as any
            })
        ).toThrow(RIFTError);
    });

    it("deletes expando fields when value is null by default", () => {
        const t = new C();
        t.id = "1";
        t._extra = {a: 1, b: 2};

        const t2 = cloneWith(t, {
            _extra: {a: null}
        });

        expect(t2._extra).toEqual({b: 2});
    });

    it("does not delete expando fields when key is omitted", () => {
        const t = new C();
        t.id = "1";
        t._extra = {a: 1, b: 2};

        const t2 = cloneWith(t, {
            _extra: {}
        });

        expect(t2._extra).toEqual({a: 1, b: 2});
    });

    it("preserves expando keys set to null when removeNullsFromExpando is false", () => {
        const t = new C();
        t.id = "1";
        t._extra = {a: 1, b: 2};

        const t2 = cloneWith(
            t,
            {
                _extra: {a: null}
            },
            {
                removeNullsFromExpando: false
            }
        );

        expect(t2._extra).toEqual({a: null, b: 2});
    });


    it("throws when attempting to set expando keys directly", () => {
        const c = new C();
        c.id = "x";
        c._extra = {a: 1};

        expect(() =>
            cloneWith(c, {
                // @ts-expect-error
                a: 999
            })
        ).toThrow(RIFTError);
    });

    it("preserves expando when cloning with schema changes", () => {
        const c = new C();
        c.id = "x";
        c._extra = {a: 1, b: {nested: true}};

        const d = cloneWith(c, {id: "y"});

        expect(d.id).toBe("y");
        expect(d._extra).toEqual({a: 1, b: {nested: true}});
    });
});

/*
|--------------------------------------------------------------------------
| 4. Non-schema field rejection
|--------------------------------------------------------------------------
*/

describe("cloneWith – non-schema field rejection", () => {
    class D {
        @Field(TSType.Value)
        id!: string;
    }

    it("throws when attempting to modify undeclared fields", () => {
        const d = new D();
        d.id = "ok";

        expect(() =>
            cloneWith(d, {
                // @ts-expect-error
                nope: 123
            })
        ).toThrow(RIFTError);
    });
});

/*
|--------------------------------------------------------------------------
| 5. Optional fields and null boundaries
|--------------------------------------------------------------------------
*/

describe("cloneWith – optional field boundaries", () => {
    class E {
        @Field(TSType.Value)
        required!: number;

        @OptionalField(TSType.Value)
        optional?: number;
    }

    it("allows optional field to be set to null", () => {
        const e = new E();
        e.required = 1;
        e.optional = 2;

        const f = cloneWith(e, {optional: null as any});

        expect(f.optional).toBeNull();
    });

    it("throws when required field is set to null", () => {
        const e = new E();
        e.required = 1;

        expect(() =>
            cloneWith(e, {required: null as any})
        ).toThrow(RIFTError);
    });
});

/*
|--------------------------------------------------------------------------
| 6. Multi-pass safety (no mutation leakage)
|--------------------------------------------------------------------------
*/

describe("cloneWith – multi-pass safety boundaries", () => {
    class F {
        @Field(TSType.Value)
        count!: number;

        static serialise(obj: F) {
            return {c: obj.count};
        }

        static deserialise(data: any) {
            const f = new F();
            f.count = data.c;
            return f;
        }
    }

    it("does not accumulate unintended transformations across clone passes", () => {
        const f = new F();
        f.count = 1;

        const a = cloneWith(f, {count: 2});
        const b = cloneWith(a, {count: 3});

        expect(a.count).toBe(2);
        expect(b.count).toBe(3);
    });
});

/*
|--------------------------------------------------------------------------
| 7. Regression: cloneWith never mutates the original instance
|--------------------------------------------------------------------------
*/

describe("cloneWith – immutability regression", () => {
    class G {
        @Field(TSType.Value)
        value!: number;

        @Field(TSType.Expando)
        _extra!: Record<string, any>;
    }

    it("does not mutate original instance or expando", () => {
        const g = new G();
        g.value = 1;
        g._extra = {x: 1};

        const h = cloneWith(g, {value: 2});

        expect(g.value).toBe(1);
        expect(g._extra).toEqual({x: 1});

        expect(h.value).toBe(2);
        expect(h._extra).toEqual({x: 1});
    });
});