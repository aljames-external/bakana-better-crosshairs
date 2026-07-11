# Universal Architectural & Engineering Guardrails (Workspace Extensions)

## 9. Zero Speculative Defensive Boilerplate & Trust Canonical API Contracts
- **Trust System API Hook Contracts**: When writing or modifying event and hook handlers (e.g., Foundry VTT `drawMeasuredTemplate`, `preCreateRegion`), trust the fixed data structure contract passed by the API (`placeable` is guaranteed to be a `PlaceableObject` with `.document`).
- **No Fake Uncertainty / Speculative Fallbacks**: Never write speculative defensive fallbacks (`placeable.document ?? placeable` or multi-alias property chains `propA ?? propB ?? propC`) out of habit or paranoia. Strictly declare, expect, and operate on known canonical schema properties (`placeable.document`, `config.postPlacementCode`).

## 10. Single Authoritative Property Over Composite Defensive Disjunctions
- **Canonical Single Flag Authority**: Inspect the single authoritative property or boolean flag provided by the engine/API (`e.g. Boolean(placeable.isPreview)` or `entry.isDefault`) rather than stacking multi-part defensive composite checks (`|| canvas.templates.preview... || !canvas.scene...`).
- **Eliminate Redundant Layer Checks**: Never add "just in case" OR-checks against internal engine containers or collection memberships when an authoritative state property already governs the object.

## 11. No Inline Ad-Hoc Type Inspection (`instanceof`) in Domain & Hook Handlers
- **Domain Handler Purity**: Event callbacks and domain logic handlers (`handleDrawPreview`, `detectTemplateProperties`) must never contain ad-hoc inline type-switching (`target instanceof Document ? ... : ...`).
- **Encapsulate Normalization in Adapters**: If polymorphic normalization is legitimately required at a public boundary, encapsulate it cleanly inside an explicit adapter or boundary helper method (`e.g. crosshairAdapter.toDocument(target)`). Within deterministic hook callbacks, access the expected property directly (`placeable.document`).

## 12. Boolean Primitive Conversion (`Boolean(x)`) Over Verbose Equality (`=== true`)
- **Crisp Boolean Primitive Conversion**: When normalizing or converting an object property or flag into a strict boolean primitive value (`e.g. const isPreview = Boolean(placeable.isPreview)`), strictly prefer explicit `Boolean(foo)` conversion over verbose strict equality checks (`foo === true` / `foo === false`).
- **Complement to Rule 7**: While direct conditional evaluation (`if (foo)`) is preferred inside branching statements (Rule 7), variable assignments that demand a guaranteed boolean primitive (`true` / `false`) must use `Boolean(foo)`.
