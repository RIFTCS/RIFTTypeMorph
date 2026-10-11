# `updateWith()`: live, mutable class updates for React

`updateWith(instance, changes)` **modifies the original instance in place** and returns a **new lightweight identity handle** to that same instance. It is useful when you deliberately want C-style shared-reference behaviour but need a fresh root reference to hand to a React state setter.

This is **not** an immutable update. If you need an independent snapshot, use [`cloneWith()`](../README.md) instead.

## 1. The basic contract

<!-- update-with-test: basic -->
```ts
import { Field, TSType, updateWith } from "@riftcs/rifttypemorph";

class Task {
  @Field(TSType.Value)
  percentComplete = 0;
}

const original = new Task();
const oldReference = original;
const next = updateWith(original, { percentComplete: 0.4 });

console.log(next !== original);                  // true: a new identity
console.log(next instanceof Task);               // true: a real Task view
console.log(oldReference.percentComplete);       // 0.4: original mutated
console.log(next.percentComplete);               // 0.4: same data
```

Changes apply to the original **before** `updateWith` returns. This is a `Proxy` identity handle, not another class instance containing copied fields. No constructor, deep clone, or custom serializer is invoked by the update.

## 2. React state setter

<!-- update-with-test: react-setter -->
```ts
import { Field, TSType, updateWith } from "@riftcs/rifttypemorph";

class Task {
  @Field(TSType.Value)
  percentComplete = 0;
}

// In a component, this callback goes in a React setState setter.
let state = new Task();
const setTask = (updater: (previous: Task) => Task) => {
  state = updater(state);
};

const oldState = state;
setTask(previous => updateWith(previous, { percentComplete: 0.4 }));

console.log(state !== oldState);           // true: React sees a new root reference
console.log(oldState.percentComplete);     // 0.4: deliberately shared state
```

In a real React component, `setTask` would come from `useState`. A new root identity enables a React state update, **not** an automatic update for memoized children whose individual props retain their references. Also, directly mutating the original object without invoking a state setter will not notify React.

## 3. Every handle sees subsequent changes

<!-- update-with-test: shared-handles -->
```ts
import { Field, TSType, updateWith } from "@riftcs/rifttypemorph";

class Counter {
  @Field(TSType.Value)
  count = 0;
}

const original = new Counter();
const first = updateWith(original, { count: 1 });
const second = updateWith(first, { count: 2 });

console.log(first !== second);                     // true
console.log(original.count, first.count, second.count); // 2, 2, 2

first.count = 3;
console.log(original.count, second.count);        // 3, 3
```

The previous handle does **not** represent a historical snapshot. Repeated updates do not build up a chain of proxies; they operate on the same original target.

## 4. Nested objects and arrays remain shared

<!-- update-with-test: nested-references -->
```ts
import { Field, TSType, updateWith } from "@riftcs/rifttypemorph";

class Item {
  @Field(TSType.Value)
  quantity = 1;
}
class Order {
  @Field(TSType.Object, Item)
  selected = new Item();

  @Field(TSType.Array, Item)
  items = [new Item()];
}

const original = new Order();
const next = updateWith(original, {});

console.log(next.selected === original.selected); // true
console.log(next.items === original.items);       // true
next.selected.quantity = 5;
console.log(original.selected.quantity);          // 5
```

Only the root identity changes. If you update a child without also updating the React state root, React may not render again; memoized children with an unchanged child reference will not be invalidated by the root handle alone.

## 5. Class methods (including private fields) remain usable

<!-- update-with-test: class-methods -->
```ts
import { Field, TSType, updateWith } from "@riftcs/rifttypemorph";

class Counter {
  #calls = 0;
  @Field(TSType.Value)
  count = 0;

  increment() {
    this.count++;
    this.#calls++;
  }
  get calls() { return this.#calls; }
}

const original = new Counter();
const next = updateWith(original, { count: 2 });
next.increment();

console.log(original.count);     // 3
console.log(next.calls);         // 1
```

Prototype methods execute against the original instance, so native `#private` fields and getters continue to work. `updateWith` is intended for TypeMorph-decorated domain classes, not arbitrary built-in objects such as `Map` or `Date`.

## 6. Serialization uses the updated data

<!-- update-with-test: serialization -->
```ts
import { createInstance, Field, serialiseInstance, TSType, updateWith } from "@riftcs/rifttypemorph";

class Task {
  @Field(TSType.Value)
  progress = 0;
}

const task = new Task();
const updated = updateWith(task, { progress: 50 });
const json = serialiseInstance(updated);
const loaded = createInstance(json, Task);

console.log(json);                   // { progress: 50 }
console.log(loaded instanceof Task); // true
console.log(loaded.progress);        // 50
```

A custom `@CustomSerialise` field codec runs during normal serialization, **not** during `updateWith` itself. `updateWith` checks field names and basic required/array/object shapes, but does not do deep validation or rehydrate replacement values.

## 7. Contrast with `cloneWith()`

<!-- update-with-test: clone-contrast -->
```ts
import { cloneWith, Field, TSType, updateWith } from "@riftcs/rifttypemorph";

class Task {
  @Field(TSType.Value)
  progress = 0;
}

const source = new Task();
const copy = cloneWith(source, { progress: 10 });
const live = updateWith(source, { progress: 20 });

console.log(source.progress); // 20
console.log(live.progress);   // 20
console.log(copy.progress);   // 10: independent snapshot
```

Use `cloneWith` for independent copies, undo/redo history or immutable state. Use `updateWith` when old references should intentionally observe the latest mutation.

## 8. Rejected updates leave valid fields untouched

<!-- update-with-test: error-handling -->
```ts
import { Field, TSType, updateWith } from "@riftcs/rifttypemorph";

class Task {
  @Field(TSType.Value)
  progress = 0;
}

const task = new Task();
try {
  updateWith(task, { progress: 50, typo: 1 } as any);
} catch {
  console.log(task.progress); // 0: schema key validation failed before mutation
}
```

`updateWith` preflights schema field names and the basic shape of proposed values before applying them. It is **not a transaction engine**: a setter or other user-defined code can still throw during application, after an earlier field was changed.

## 9. An empty patch is a notification handle

<!-- update-with-test: empty-update -->
```ts
import { Field, TSType, updateWith } from "@riftcs/rifttypemorph";

class Task {
  @Field(TSType.Value)
  progress = 0;
}

const task = new Task();
task.progress = 25;                 // some other code mutated shared state
const notified = updateWith(task, {}); // fresh identity for the React setter

console.log(notified !== task);     // true
console.log(notified.progress);     // 25
```

An empty patch creates a fresh handle, but it does **not** notify React on its own; return that handle from a state setter.

## Important trade-offs

- **Shared mutation by design:** old references, old handles and React's prior state objects all see later writes. This can conflict with concurrent rendering, effects and time-travel debugging that expect immutable snapshots.
- **Only root reference changes:** nested references are not cloned or replaced automatically. `React.memo`, selector caches and effects depending on nested object identity can miss updates.
- **Not full schema validation:** unknown/readonly schema fields and basic wrong shapes are rejected; deep field schemas and custom constraints are not revalidated on every update.
- **Use the setter:** an object can change without React knowing. Call `setState(previous => updateWith(previous, changes))` (or use `{}` after an external mutation) when the UI must be notified.
- **Use `cloneWith` for isolation:** do not use `updateWith` to build undo buffers, immutable snapshots, or independent forks.

Every TypeScript code example in this guide has a matching Vitest case in `tests/updateWith.guidance.test.ts`.
