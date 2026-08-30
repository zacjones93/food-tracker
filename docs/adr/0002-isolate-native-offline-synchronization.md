# Isolate native offline synchronization

The iOS store remains the stable UI-facing food-planning facade, while a separate offline synchronization module owns durable persistence, outbox coalescing, base versions, acknowledgements, and remote merging. The module preserves stable local identifiers alongside canonical server identifiers and lets pending local values win automatic merges; moving networking into the module was rejected so transport and session concerns remain independently replaceable.
