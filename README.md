# rifttypemorph

> Lightweight runtime type validation and JSON-to-class mapping for TypeScript.  
> **rifttypemorph** lets you safely transform untyped JSON into structured, validated class instances using simple schemas or decorators — ideal for API clients, data models, and strongly-typed applications.

---

### ✨ Overview

**rifttypemorph** bridges the gap between **TypeScript’s compile-time types** and **runtime validation**.  
It lets you define declarative schemas (using `TSField` or decorators) that drive how JSON data is turned into fully typed class instances — complete with nested structures, arrays, and validation.

It’s perfect for:
- Deserializing API responses into class instances  
- Enforcing runtime validation for TypeScript models  
- Auto-instantiating nested object graphs  
- Cleanly bridging JSON and domain classes

---

## 🚀 Installation

```bash
npm install github:RIFTCS/rifttypemorph
# or
yarn add github:RIFTCS/rifttypemorph
# or pnpm:
pnpm add github:RIFTCS/rifttypemorph
```

---

## 🔧 Quick Start

### 1. Define your model

```ts
import { createInstance, TSField, TSType } from "rifttypemorph";

class User {
  name = new TSField(TSType.Value) as any;
  email = new TSField(TSType.Value) as any;
  age = new TSField(TSType.Value) as any;
}
```

### 2. Create a typed instance from JSON using the constructor directly

```ts
const json = {
  name: "Liam",
  email: "liam@riftcs.com",
  age: 29
};

const user = createInstance(json, User);
console.log(user);
```

**Output:**
```
User instance: User { name: 'Liam', email: 'liam@riftcs.com', age: 29 }
```

---

## ⚙️ Basic Validation

If required fields are missing or incorrect, `createInstance` throws descriptive errors.

```ts
class Product {
  id = new TSField(TSType.Value) as any;
  name = new TSField(TSType.Value) as any;
  price = new TSField(TSType.Value) as any;
}

const invalid = { id: "SKU-1001", name: "Rift Device" };

try {
  createInstance(invalid, Product);
} catch (err: any) {
  console.error(err.message);
}
```

**Output:**
```
[root] Missing required property: price
```

---

## 🧱 Nested Objects and Arrays

```ts
class Entry {
  id = new TSField(TSType.Value) as any;
  value = new TSField(TSType.Value) as any;
}

class Form {
  id = new TSField(TSType.Value) as any;
  name = new TSField(TSType.Value) as any;
  entries = new TSField(TSType.Array, Entry) as any;
}

const data = {
  id: 1,
  name: "Customer Survey",
  entries: [
    { id: "q1", value: "Yes" },
    { id: "q2", value: "No" }
  ]
};

const form = createInstance(data, Form);
console.log("Form instance:", form);
```

**Output:**
```
Form instance: Form {
  id: 1,
  name: 'Customer Survey',
  entries: [ Entry { id: 'q1', value: 'Yes' }, Entry { id: 'q2', value: 'No' } ]
}
```

---

## 🪶 Advanced Initializers

If you need finer control over how nested objects or special cases are created,  
you can still pass a factory function or schema-based field initializers.

```ts
class Custom {
  id = new TSField(TSType.Value) as any;
  data = new TSField(TSType.Object, (d) => new ComplexData()) as any;
}

function makeCustom(_: any) {
  return new Custom();
}

const json = {
  id: "custom-1",
  data: { info: "created via factory" }
};

const instance = createInstance(json, makeCustom);
```

---

## 🪶 Decorator Syntax (Optional)

If you prefer a more elegant schema definition, use the built-in `@Field` decorator.

Enable decorators in your `tsconfig.json`:
```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

Then:

```ts
import { Field } from "rifttypemorph/decorators/schemaDecorators";
import { TSType, createInstance } from "rifttypemorph";

class Address {
  @Field(TSType.Value)
  street!: string;

  @Field(TSType.Value)
  city!: string;
}

class User {
  @Field(TSType.Value)
  name!: string;

  @Field(TSType.Object, Address)
  address!: Address;
}

const json = {
  name: "Liam",
  address: { street: "100 Rift Lane", city: "Sydney" }
};

const user = createInstance(json, User);
console.log(user);
```

## 🧩 Runtime Validation

```createInstance``` normally stops at the **first validation error** — it throws a ```RIFTError``` when a required field is missing or a type doesn’t match.  

For example:
```ts
class Product {
  id = new TSField(TSType.Value) as any;
  name = new TSField(TSType.Value) as any;
  price = new TSField(TSType.Value) as any;
}

const invalid = { id: "SKU-101" }; // name and price missing
createInstance(invalid, Product);
// ❌ Throws: [root] Missing required property: name
```

---

### ✅ Collecting All Validation Errors

If you want to validate **entire objects** and get back *all* field errors instead of throwing immediately, use ```validateInstance()``` or pass ```{ collectErrors: true }``` to ```createInstance()```.

#### Using ```validateInstance```

```ts
import { validateInstance } from "rifttypemorph/core/validateInstance";
import { TSField, TSType } from "rifttypemorph/core";

class Address {
  street = new TSField(TSType.Value) as any;
  city = new TSField(TSType.Value) as any;
  zip = new TSField(TSType.Value) as any;
}

class User {
  id = new TSField(TSType.Value) as any;
  name = new TSField(TSType.Value) as any;
  address = new TSField(TSType.Object, Address) as any;
}

const data = {
  id: "123",
  address: {} // missing fields
};

const result = validateInstance(data, User);

console.log(result);
```

**Output:**
```text
{
  valid: false,
  instance: User {
    id: "123",
    name: null,
    address: Address { street: null, city: null, zip: null }
  },
  errors: [
    { message: "[root] Missing required property: name", context: "root" },
    { message: "[root.address] Missing required property: street", context: "root.address" },
    { message: "[root.address] Missing required property: city", context: "root.address" },
    { message: "[root.address] Missing required property: zip", context: "root.address" }
  ]
}
```

This approach builds a **partial instance** (with nulls for invalid or missing fields) and lists **all detected validation problems**.  
It never throws, so it’s perfect for APIs or form validation.

---

### ⚙️ Directly Using ```createInstance``` in Validation Mode

If you need more control or prefer to stay close to the core API:

```ts
const { instance, errors } = createInstance(
  data,
  User,
  null,
  "root",
  { collectErrors: true }
);

console.log(instance);
console.log(errors);
```

**Output:**
```text
{
  id: "123",
  name: null,
  address: Address { street: null, city: null, zip: null }
}
[
  { message: "[root] Missing required property: name", context: "root" },
  { message: "[root.address] Missing required property: street", context: "root.address" },
  { message: "[root.address] Missing required property: city", context: "root.address" },
  { message: "[root.address] Missing required property: zip", context: "root.address" }
]
```

---

✅ **Summary**

- ```createInstance()``` — fast, throws on first validation error  
- ```validateInstance()``` — safe, gathers all validation issues  
- Both support nested object and array structures  
- Works seamlessly with ```TSField``` and decorator schemas  

---

## 🧱 Project Structure

```
rifttypemorph/
├─ src/
│  ├─ core/                # Type system, schema metadata, instance creation
│  ├─ decorators/          # @Field decorator and schema helpers
│  ├─ utils/               # Utility and error helpers
│  └─ index.ts             # Library entry point
├─ examples/               # Usage examples
├─ tests/                  # Vitest-based unit tests
├─ package.json
├─ tsconfig.json
└─ README.md
```

---

## 📦 Build

```bash
npm run build
```

Outputs the compiled files and TypeScript declarations to `dist/`.

---

## 📚 Keywords

```text
typescript runtime types
runtime validation
type reflection
json deserialization
json to class mapping
typescript schema library
typescript json schema
typed object factory
schema-based model validation
typescript decorators
typescript class instantiation
data model validation
api response mapping
json object mapper
typescript strong typing
typescript serialization
deserialize json to class
typescript runtime schema
type-safe deserialization
zero-dependency typescript library
```

---

## 🧪 Testing

Run the unit tests using **Vitest**:

```bash
npm test
```

Example tests live under `tests/` and include both unit and integration coverage.

---

## 📜 License

**MIT License**  
© RIFT Pty Ltd — Created by [Liam](mailto:liam@riftcs.com)

---

## 🌐 Repository

[https://github.com/RIFTCS/rifttypemorph](https://github.com/RIFTCS/rifttypemorph)

---

## Grain transpilation

TypeMorph ER entities can be lowered into inferred Grain world events, permissions, relationship IR, and effective-dated joins without defining a separate event model. `@Reference(...)` supplies ER topology and `@AppliesTo(...)` selects an intended domain applicability relation; the transpiler then derives shared join coordinates and "newest at-or-before" temporal lookups. See [`grain_transpilation.md`](grain_transpilation.md) for the complete Store / Item / Purchaser retail example and exact generated Grain Markdown.
