LLM Guidance for RIFT Typemorph (RIFT)

This document explains the intent, invariants, and data-flow contracts of the RIFT Typemorphinstance system.
It is written for large language models and automation agents that must reason about correctness,
constraints, and invariants — not merely mirror syntax.

The system defines a closed lifecycle:

```
raw data
  -> createInstance
      -> class instance (schema-validated, hydrated)
          -> serialiseInstance
              -> plain data
                  -> duplicateInstance / cloneWith
                      -> new instance
```

Everything in this system exists to preserve schema integrity, explicit intent, and predictable error behavior.

----------------------------------------------------------------
CORE CONCEPTS
----------------------------------------------------------------

1. Schema Is Discovered, Not Declared Centrally

There is no global schema definition.

Schemas are discovered at runtime from class prototypes via decorators:
- @Field / @OptionalField
- @Ignore
- @Include
- Expando (via TSType.Expando)
- parseClass(instance)

Schema metadata is stored on the prototype as non-enumerable properties:
- __schemaFields
- __ignoredFields
- __includedMethods

Implication for LLMs:
Never infer schema by enumerating object keys. The prototype metadata is authoritative.

----------------------------------------------------------------
TSType SEMANTICS (CRITICAL)
----------------------------------------------------------------

Each schema field has exactly one TSType:

- Value   : Assigned directly, no recursion
- Object  : Nested schema-driven object
- Array   : Array of nested schema items
- Expando : Catch-all for extra properties

Important:
Runtime JavaScript types are insufficient. TSType determines behavior.

----------------------------------------------------------------
createInstance: HYDRATION CONTRACT
----------------------------------------------------------------

createInstance converts raw data into a schema-compliant object instance.

Instantiator resolution order:
1. field.instantiator (if present)
2. Explicit instantiator argument
3. Error if missing

Valid instantiators:
- Class constructor
- Factory function (obj) => instance
- null (invalid unless overridden by field)

----------------------------------------------------------------
CONSTRUCTOR BYPASS
----------------------------------------------------------------

Constructors may be bypassed if:
- shouldBypassConstructor(ctor) returns true, OR
- options.bypassConstructor === true

Bypass behavior:
```
instance = Object.create(ctor.prototype)
```

Implication:
Constructors are NOT guaranteed to run. Initialization must be schema-safe.

----------------------------------------------------------------
ERROR MODEL (EXTREMELY IMPORTANT)
----------------------------------------------------------------

There are two execution modes.

1. Throwing Mode (default)
- First error throws a RIFTError
- Execution stops immediately

2. Collecting Mode
Enabled via:
```
options.collectErrors === true
```

Behavior:
- Errors are accumulated
- Function returns:
```
{
  instance: T | null,
  errors: RIFTError[]
}
```
 
Invariant:
Errors are never silently ignored.
Success must be inferred only if errors.length === 0.

----------------------------------------------------------------
REQUIRED vs OPTIONAL vs ifEmpty
----------------------------------------------------------------

Each field has three independent controls:
- required   : null / undefined is invalid
- ifEmpty    : factory invoked when value === null
- instantiator : how the value is created

Rules:
- required and ifEmpty are mutually exclusive
- null triggers ifEmpty
- undefined triggers default handling
- errorForNullRequired escalates nulls into errors

Important subtlety:
null and undefined are intentionally treated differently.

----------------------------------------------------------------
FIELD PROCESSING ORDER
----------------------------------------------------------------

For each schema field:
1. Mark key as consumed
2. Resolve raw value from input
3. Apply ifEmpty when value === null
4. Enforce required constraints
5. Instantiate based on TSType
6. Assign to instance

Only declared schema fields participate in this process.

----------------------------------------------------------------
EXTRA PROPERTIES & EXPANDO
----------------------------------------------------------------

After schema processing:
- Remaining input keys are considered extra

If an expando field exists:
- Extra keys are stored in the expando object

Otherwise:
- Error if options.errorForExtraProps === true
- Else silently ignored

Invariant:
Extra data never mutates declared schema fields.

----------------------------------------------------------------
serialiseInstance: INVERSE OPERATION
----------------------------------------------------------------

serialiseInstance converts an instance back into plain data.

Priority rules:
1. If static Class.serialise(instance) exists, it is used
2. Otherwise:
   - Walk schema fields
   - Execute @Include methods/getters
   - Flatten expando contents
   - Validate extra properties (optional)

Serialization is schema-driven, not enumeration-driven.

----------------------------------------------------------------
@Include SEMANTICS
----------------------------------------------------------------

@Include may be applied to:
- Methods
- Getters

Behavior:
- Executed during serialization
- Output-only fields
- Cannot be modified via cloneWith
- Ignored during extra-property validation

Mental model:
@Include defines computed, read-only projections.

----------------------------------------------------------------
duplicateInstance
----------------------------------------------------------------

Mechanism:
1. serialiseInstance(instance)
2. createInstance(serialised, instance.constructor)

Guarantee:
Produces a schema-clean deep copy, not a reference clone.

----------------------------------------------------------------
cloneWith
----------------------------------------------------------------

cloneWith(instance, changes) performs constrained mutation.

Disallowed:
- Modifying @Include fields
- Modifying expando fields
- Modifying non-schema fields

Allowed:
- Only declared schema fields
- Only via re-instantiation

Guarantee:
All required constraints are re-validated.
Illegal state injection is impossible.

----------------------------------------------------------------
GLOBAL INVARIANTS (MUST NEVER BE VIOLATED)
----------------------------------------------------------------

1. Schema is authoritative
2. Constructors are optional
3. Errors are explicit
4. Serialization is reversible
5. Extra data is never silently merged
6. Mutation always re-hydrates

Any LLM interacting with this system must preserve these invariants.

----------------------------------------------------------------
MENTAL MODEL SUMMARY
----------------------------------------------------------------

RIFT Typemorphshould be understood as:

“A strict, decorator-defined, bidirectional schema system where class instances
are validated views over structured data, not freeform objects.”

Reasoning from this model avoids incorrect assumptions.
