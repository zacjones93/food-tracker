# Centralize food-planning boundaries

Food-planning writes and reads are available through web actions, native synchronization, and assistant tools, which previously allowed validation, reference checks, fields, and query normalization to drift. We will keep mutation policy and household-scoped retrieval in shared domain modules while transport adapters retain authentication, approval, conflict receipts, entitlement enforcement, and persistence; a universal repository was rejected because those workflows have materially different commit and failure semantics.

## Consequences

New food-planning fields and invariants must be added to the shared boundary first. Adapters may translate dates and storage values, but they may not redefine valid relation types, ownership references, permissions, result ordering, or normalization.
