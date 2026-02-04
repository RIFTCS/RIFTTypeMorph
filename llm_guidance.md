LLM Guidance for RIFT Typemorph (RIFT)

This document explains the intent, invariants, and data-flow contracts of the RIFT Typemorph
instance system.
It is written for large language models and automation agents that must reason about correctness,
constraints, and invariants — not merely mirror syntax.

This guidance reflects the current, fully-validated behavior as enforced by the complete test
suite (285 tests, all passing), including cloneWith, expandos, custom serialisation hooks,
constructor bypass, and strict error semantics.

The system defines a closed lifecycle:

<code>
raw data
  -> createInstance
      -> class instance (schema-validated, hydrated)
          -> serialiseInstance
              -> plain data
                  -> duplicateInstance / cloneWith
                      -> new instance
</code>

Everything in this system exists to preserve schema integrity, explicit intent, predictable error
behavior, and immutability guarantees.

----------------------------------------------------------------
CORE CONCEPTS
----------------------------------------------------------------

1. Schema Is Discovered, Not Declared Centrally

There is no global schema definition.

Schemas are discovered at runtime from class prototypes via decorators:
- @Field / @OptionalField
- @Ignore
- @Include
- Expando via @Field(TSType.Expando)
- parseClass(instance)

Schema metadata is stored on the prototype as non-enumerable properties:
- __schemaFields
- __ignoredFields
- __includedMethods

Implication for LLMs:
Never infer schema by enumerating object keys. The prototype metadata is authoritative.
Runtime object shape is explicitly *not* the schema.

----------------------------------------------------------------
TSType SEMANTICS (CRITICAL)
----------------------------------------------------------------

Each schema field has exactly one TSType, which defines behavior:

- Value
  Assigned directly or via instantiator.
  No recursion.
  May apply constructor coercion (e.g. Date).

- Object
  Nested schema-driven object.
  Always hydrated via createInstance.

- Array
  Array of nested schema items.
  Element metadata is inherited from the array field.

- Expando
  Catch-all for extra properties not declared in the schema.
  Exactly one expando is allowed per schema (including inheritance).

Important:
Runtime JavaScript types are insufficient.
TSType determines behavior, validation, and traversal.

----------------------------------------------------------------
createInstance: HYDRATION CONTRACT
----------------------------------------------------------------

createInstance converts raw data into a schema-compliant object instance.

Instantiator resolution order:
1. field.instantiator (if present)
2. Explicit instantiator argument
3. Error if missing or invalid

Valid instantiators:
- Class constructor
- Factory function (obj) => instance

Invalid:
- Returning null / undefined for Object or Array fields
- Constructors with parameters unless bypassed

----------------------------------------------------------------
CONSTRUCTOR BYPASS
----------------------------------------------------------------

Constructors may be bypassed if:
- shouldBypassConstructor(ctor) returns true, OR
- options.bypassConstructor === true

Bypass behavior:
<code>
instance = Object.create(ctor.prototype)
</code>

Guarantees:
- Constructor is NOT invoked
- Prototype chain is preserved
- instanceof semantics hold
- No constructor side effects may leak

Implication:
Constructors are optional.
Initialization must be schema-safe and constructor-independent.

----------------------------------------------------------------
ERROR MODEL (EXTREMELY IMPORTANT)
----------------------------------------------------------------

There are two execution modes.

1. Throwing Mode (default)
- First error throws a RIFTError
- Execution stops immediately

2. Collecting Mode
Enabled via:
<code>
options.collectErrors === true
</code>

Behavior:
- Errors are accumulated across nested objects and arrays
- Function returns:
<code>
{
  instance: T | null,
  errors: RIFTError[]
}
</code>

Invariant:
Errors are never silently ignored.
Success must be inferred only if errors.length === 0.

----------------------------------------------------------------
REQUIRED vs OPTIONAL vs ifEmpty
----------------------------------------------------------------

Each field has three independent controls:
- required
- ifEmpty
- instantiator

Rules:
- required and ifEmpty are mutually exclusive
- undefined and missing are treated equivalently
- null is distinct and intentional
- ifEmpty may replace null unless dontReplaceNullWithIfEmpty is set
- errorForNullRequired escalates nulls into errors

This distinction is heavily tested and must be preserved.

----------------------------------------------------------------
FIELD PROCESSING ORDER
----------------------------------------------------------------

For each declared schema field:
1. Mark key as consumed
2. Resolve raw value
3. Apply ifEmpty if applicable
4. Enforce required constraints
5. Instantiate according to TSType
6. Assign to instance

Only declared schema fields participate.
Included fields, ignored fields, and expando keys are handled separately.

----------------------------------------------------------------
EXTRA PROPERTIES & EXPANDO
----------------------------------------------------------------

After schema processing:
- Remaining input keys are considered extra

If an expando field exists:
- Extra keys are captured into the expando object
- Expando is always materialized as an object (never shared)
- Expando contents are deep-cloned on serialisation and duplication

If no expando exists:
- Error if options.errorForExtraProps === true
- Otherwise extra keys are ignored

Invariant:
Extra data never mutates declared schema fields.
Expando state is instance-local and immutable via cloneWith.

----------------------------------------------------------------
serialiseInstance: INVERSE OPERATION
----------------------------------------------------------------

serialiseInstance converts an instance back into plain, JSON-compatible data.

Priority rules:
1. If static Class.serialise(instance) exists, it is used exclusively
2. Otherwise:
   - Walk schema fields
   - Execute @Include methods/getters
   - Serialize expandos (nested or flattened depending on options)
   - Enforce errorForExtraProps rules

Guarantees:
- No Dates, functions, or class instances leak
- Expandos are deep-cloned
- Included getters are executed at serialization time only

Serialization is schema-driven, not enumeration-driven.

----------------------------------------------------------------
@Include SEMANTICS
----------------------------------------------------------------

@Include may be applied to:
- Prototype methods
- Getters

Behavior:
- Executed only during serialization
- Output-only projections
- Ignored during createInstance
- Cannot be modified via cloneWith
- Not treated as extra properties

Mental model:
@Include defines computed, read-only views.

----------------------------------------------------------------
duplicateInstance
----------------------------------------------------------------

Mechanism:
<code>
duplicateInstance(x) ==
  createInstance(
    serialiseInstance(x),
    x.constructor
  )
</code>

Guarantees:
- Deep copy
- No shared references
- Full re-validation
- Custom serialise / deserialise hooks honored
- Expandos preserved and deep-cloned

----------------------------------------------------------------
cloneWith (UPDATED, TEST-VERIFIED SEMANTICS)
----------------------------------------------------------------

cloneWith(instance, changes) performs constrained, schema-intent-driven mutation.

High-level intent:
- cloneWith expresses *what schema fields change*
- Representation details are handled by serialization
- Rehydration is mandatory

Disallowed:
- Modifying @Include fields
- Modifying expando fields or expando keys
- Modifying non-schema fields

Allowed:
- Declared schema fields only
- Values may be null only if optional
- Changes must pass full validation

----------------------------------------------------------------
cloneWith + Custom serialise / deserialise
----------------------------------------------------------------

If a class defines static serialise / deserialise:

Behavior is explicitly two-phase and test-enforced:

1. Apply schema changes to a logical instance
2. Re-run serialiseInstance on the updated instance
3. Hydrate via createInstance using deserialise

<code>
instance
  -> apply schema changes
      -> serialise(updatedInstance)
          -> createInstance
</code>

If changes is empty:
- cloneWith behaves exactly like duplicateInstance
- No additional serialisation pass occurs

This guarantees:
- Schema intent is authoritative
- Custom serialization defines data shape
- Non-schema serialised fields are preserved
- No partial payload mutation is possible

----------------------------------------------------------------
cloneWith BEHAVIORAL GUARANTEES
----------------------------------------------------------------

- Fully immutable (original instance is never mutated)
- Schema-only mutation
- Expando preserved but immutable
- Included fields protected
- Custom serialise hooks respected
- Multi-pass cloning does not accumulate transformations
- Equivalent to spread-style updates, but schema-safe:
  { ...base, ...updates } with hard boundaries

----------------------------------------------------------------
GLOBAL INVARIANTS (MUST NEVER BE VIOLATED)
----------------------------------------------------------------

1. Schema is authoritative
2. Constructors are optional
3. Errors are explicit and structured
4. Serialization is reversible
5. Extra data is never silently merged
6. Mutation always re-hydrates
7. Serialization shape and schema intent are distinct concerns
8. Expandos are isolated, deep-copied, and immutable via cloneWith

Any LLM interacting with this system must preserve these invariants.

----------------------------------------------------------------
MENTAL MODEL SUMMARY
----------------------------------------------------------------

RIFT Typemorph should be understood as:

“A strict, decorator-defined, bidirectional schema system where class instances
are validated, immutable views over structured data.

Schema defines what may change.
Serialization defines how data is represented.
Rehydration is the only legal way state may change.”

Reasoning from this model avoids incorrect assumptions and unsafe mutations.
