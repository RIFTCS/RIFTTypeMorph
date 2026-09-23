# RIFTTypeMorph

[![npm version](https://img.shields.io/npm/v/%40riftcs%2Frifttypemorph.svg)](https://www.npmjs.com/package/@riftcs/rifttypemorph)

RIFTTypeMorph is a decorator-first runtime schema layer for TypeScript. It turns untyped transport data into real class instances, validates object graphs at runtime, serialises class instances back to plain data, and supports controlled cloning without giving up normal TypeScript classes and methods.

The primary API is built around annotations such as `@Field`, `@OptionalField`, `@Ignore`, `@Include`, `@BypassConstructor`, and `@CustomSerialise`. The older `TSField` property style is still supported and is documented at the end of this README.

## Why use it?

TypeScript types disappear at runtime. RIFTTypeMorph gives a class an explicit runtime schema so the same metadata can drive:

- JSON-to-class hydration, including nested objects and arrays
- required and optional field validation
- default values for missing fields
- collection of all validation errors instead of fail-fast validation
- safe serialisation back to plain JSON-compatible data
- unknown-property capture with expando fields
- computed output fields and ignored runtime-only fields
- custom field wire formats
- constructor bypass for persistence/domain objects
- class-level custom serialisation/deserialisation hooks
- deep duplication and validated immutable-style updates with `cloneWith`
- inheritance-aware schemas

## Installation

RIFTTypeMorph is published on npm as [`@riftcs/rifttypemorph`](https://www.npmjs.com/package/@riftcs/rifttypemorph):

```bash
npm install @riftcs/rifttypemorph
```

For TypeScript's legacy decorator transform, enable decorators in your application:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

All public APIs shown below are exported from the package root:

<!-- readme-test: public-api -->
```ts
import {
  BypassConstructor,
  cloneWith,
  createInstance,
  CustomSerialise,
  Field,
  Ignore,
  Include,
  OptionalField,
  serialiseInstance,
  TSField,
  TSType,
  validateInstance
} from "@riftcs/rifttypemorph";
```

## Quick start: annotated domain classes

`@Field` declares the runtime shape. Nested object and array fields provide the constructor RIFTTypeMorph should hydrate.

<!-- readme-test: quick-start -->
```ts
import {
  createInstance,
  Field,
  serialiseInstance,
  TSType
} from "@riftcs/rifttypemorph";

class Address {
  @Field(TSType.Value)
  city!: string;
}

class User {
  @Field(TSType.Value)
  name!: string;

  @Field(TSType.Object, Address)
  address!: Address;

  @Field(TSType.Array, Address)
  previousAddresses!: Address[];
}

const user = createInstance(
  {
    name: "Liam",
    address: { city: "Brisbane" },
    previousAddresses: [{ city: "Sydney" }]
  },
  User
);

user instanceof User; // true
user.address instanceof Address; // true

serialiseInstance(user);
// {
//   name: "Liam",
//   address: { city: "Brisbane" },
//   previousAddresses: [{ city: "Sydney" }]
// }
```

The result is a real `User`, not a typed plain object. Prototype methods, getters and `instanceof` semantics remain available.

## Required, optional and defaulted fields

Fields are required by default. `@OptionalField` accepts missing or null values and normally hydrates a missing value as `null`. An `ifEmpty` factory can supply a default.

<!-- readme-test: optional-default -->
```ts
import {
  createInstance,
  Field,
  OptionalField,
  TSType
} from "@riftcs/rifttypemorph";

class WorkItem {
  @Field(TSType.Value)
  id!: string;

  @OptionalField(TSType.Value)
  notes!: string | null;

  @OptionalField(TSType.Value, null, () => "draft")
  status!: string;
}

const item = createInstance({ id: "T-1" }, WorkItem);

item.notes;  // null
item.status; // "draft"
```

## Validation

`createInstance` fails fast by default. Use `validateInstance` when a UI or import path needs every validation error in one pass.

<!-- readme-test: validation -->
```ts
import {
  Field,
  TSType,
  validateInstance
} from "@riftcs/rifttypemorph";

class Product {
  @Field(TSType.Value)
  sku!: string;

  @Field(TSType.Value)
  price!: number;
}

const result = validateInstance({}, Product);

result.valid;         // false
result.instance;      // partially hydrated Product
result.errors.length; // 2
```

Validation propagates through nested objects and arrays, so collected errors retain the path of the failing field.

## Capture unknown properties with an expando

An expando field lets a model preserve properties that are not part of its fixed schema. This is useful for forward-compatible payloads, extension metadata, and domain models with a stable core plus dynamic attributes.

<!-- readme-test: expando -->
```ts
import {
  createInstance,
  Field,
  serialiseInstance,
  TSType
} from "@riftcs/rifttypemorph";

class Asset {
  @Field(TSType.Value)
  id!: string;

  @Field(TSType.Expando)
  extra!: Record<string, unknown>;
}

const asset = createInstance(
  { id: "A-1", colour: "blue", rank: 3 },
  Asset
);

asset.extra;
// { colour: "blue", rank: 3 }

serialiseInstance(asset, { flattenExpando: true });
// { id: "A-1", colour: "blue", rank: 3 }
```

Without `flattenExpando`, the captured values serialise under the expando property itself.

## Computed output and runtime-only state

`@Include` adds a getter or method to serialised output without making it an input field. `@Ignore` marks runtime-only state that should not be serialised.

<!-- readme-test: include-ignore -->
```ts
import {
  Field,
  Ignore,
  Include,
  serialiseInstance,
  TSType
} from "@riftcs/rifttypemorph";

class Person {
  @Field(TSType.Value)
  firstName = "Ada";

  @Field(TSType.Value)
  lastName = "Lovelace";

  @Ignore()
  cache = new Map<string, unknown>();

  @Include
  get displayName() {
    return `${this.firstName} ${this.lastName}`;
  }
}

serialiseInstance(new Person());
// {
//   firstName: "Ada",
//   lastName: "Lovelace",
//   displayName: "Ada Lovelace"
// }
```

Use `@Ignore(true)` when ignored state should still be passed through by `duplicateInstance` and `cloneWith`.

## Custom field wire formats

`@CustomSerialise` transforms a field after normal serialisation and before normal hydration. This keeps transport-specific encodings at the schema boundary instead of spreading conversion code through application logic.

<!-- readme-test: custom-serialise -->
```ts
import {
  createInstance,
  CustomSerialise,
  Field,
  serialiseInstance,
  TSType
} from "@riftcs/rifttypemorph";

class Event {
  @Field(TSType.Value, Date)
  @CustomSerialise<string, number>(
    value => new Date(value).getTime(),
    value => new Date(value).toISOString(),
    "number"
  )
  at!: Date;
}

const event = new Event();
event.at = new Date(1000);

const wire = serialiseInstance(event);
wire.at; // 1000

const restored = createInstance(wire, Event);
restored.at instanceof Date; // true
restored.at.getTime();       // 1000
```

The declared serialised type is checked, so an invalid custom serializer result fails immediately instead of silently changing the wire contract.

## Hydrate without running constructors

Persistence models often have constructors that perform work which should not run while recreating stored state. `@BypassConstructor` hydrates by creating an object with the correct prototype and then applying the schema.

<!-- readme-test: bypass-constructor -->
```ts
import {
  BypassConstructor,
  createInstance,
  Field,
  TSType
} from "@riftcs/rifttypemorph";

@BypassConstructor()
class StoredCounter {
  static constructorCalls = 0;

  @Field(TSType.Value)
  value!: number;

  constructor() {
    StoredCounter.constructorCalls++;
  }

  double() {
    return this.value * 2;
  }
}

const counter = createInstance({ value: 21 }, StoredCounter);

StoredCounter.constructorCalls; // 0
counter instanceof StoredCounter; // true
counter.double(); // 42
```

This is intentionally opt-in. Classes without `@BypassConstructor` continue to use their constructors.

## Class-level wire format hooks

For types whose entire wire representation is custom, define static `serialise` and `deserialise` functions. RIFTTypeMorph prefers these hooks over field-by-field traversal for that class.

<!-- readme-test: class-hooks -->
```ts
import {
  createInstance,
  Field,
  serialiseInstance,
  TSType
} from "@riftcs/rifttypemorph";

class Percentage {
  @Field(TSType.Value)
  value!: number;

  static serialise(instance: Percentage) {
    return { percent: instance.value * 100 };
  }

  static deserialise(data: { percent: number }) {
    const result = new Percentage();
    result.value = data.percent / 100;
    return result;
  }
}

const percentage = createInstance({ percent: 25 }, Percentage);
percentage.value; // 0.25

serialiseInstance(percentage);
// { percent: 25 }
```

These hooks also work when the type is nested inside another annotated object or array.

## Validated cloning

`cloneWith` creates a fresh class instance, applies only schema-approved changes, preserves the runtime type, and re-runs the normal serialisation/hydration validation path.

<!-- readme-test: clone-with -->
```ts
import {
  cloneWith,
  Field,
  TSType
} from "@riftcs/rifttypemorph";

class Settings {
  @Field(TSType.Value)
  theme = "light";

  @Field(TSType.Value)
  pageSize = 25;
}

const original = new Settings();
const updated = cloneWith(original, { pageSize: 50 });

updated instanceof Settings; // true
updated !== original;        // true
updated.theme;               // "light"
updated.pageSize;            // 50
```

`cloneWith` rejects updates to undeclared or `@Include`-only properties. `duplicateInstance` is available when no changes are required and you only need a deep schema-aware copy.

## Useful creation and serialisation options

The lower-level APIs expose stricter controls for import boundaries and migration code:

- `errorForExtraProps`: reject input/output properties not represented by the schema
- `errorForNullRequired`: reject explicit null for required fields
- `dontReplaceNullWithIfEmpty`: distinguish explicit null from a missing value when defaults are configured
- `bypassConstructor`: override constructor behaviour for a specific hydration operation
- `collectErrors`: collect validation failures rather than throwing the first one
- `flattenExpando`: flatten expando properties into the output object
- `allowPlainObjectPassthrough`: opt out of the plain-object/prototype-loss safety check during serialisation

For normal application code, prefer the decorators and `validateInstance` rather than passing these flags everywhere.

## Inheritance

Schema metadata is inherited. A derived class can add fields while retaining fields, included output and expando behaviour declared by its base class. Child declarations override fields with the same name.

## Legacy `TSField` property schema

Older RIFTTypeMorph models can continue declaring schema metadata by assigning `TSField` instances. Decorators are preferred for new code because they keep the TypeScript property type and runtime schema declaration together without placing schema placeholders on the instance.

<!-- readme-test: legacy-tsfield -->
```ts
import {
  createInstance,
  TSField,
  TSType
} from "@riftcs/rifttypemorph";

class LegacyUser {
  name = new TSField(TSType.Value) as any;
  age = new TSField(TSType.Value) as any;
}

const user = createInstance(
  { name: "Grace", age: 37 },
  LegacyUser
);

user instanceof LegacyUser; // true
user.name; // "Grace"
user.age;  // 37
```

This syntax remains supported for compatibility, including nested `Object`, `Array` and `Expando` fields.

## Building and release checks

```bash
npm ci
npm run release:check
```

`release:check`:

1. removes the old `dist`
2. builds JavaScript, declarations and source maps
3. runs the test suite
4. verifies emitted source maps contain their original TypeScript source
5. runs an npm package dry-run so the files that would be published are visible before release

When the checks are clean, publish the scoped package with:

```bash
npm publish --access public
```

The package is designed so consumers receive the built `dist`; they do not need to compile RIFTTypeMorph from GitHub during installation.

## Licence

RIFTTypeMorph is source-available under the `RIFT Small Commercial Source License 1.0` in `LICENSE`.

Personal, educational, research, evaluation, charitable and other non-commercial use is permitted. Commercial use is permitted without a separate commercial licence while the revenue attributable to that commercial use remains below AUD 100,000 in each rolling 12-month period. Commercial use at or above that threshold requires a separate written commercial licence from RIFT Pty Ltd.

This is intentionally not an MIT or OSI open-source licence because it contains a commercial revenue restriction. Review the `LICENSE` file for the controlling terms.
