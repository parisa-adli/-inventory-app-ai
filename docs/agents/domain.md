# Domain Documentation

This repository uses a **single-context** layout:

- `CONTEXT.md` at the repo root contains domain terminology, ubiquitous language, and key concepts
- `docs/adr/` contains Architecture Decision Records (ADRs)

## Consumer rules

### Reading `CONTEXT.md`

Skills like `domain-modeling`, `research`, and `code-review` will read `CONTEXT.md` to understand the project's domain vocabulary. It should be kept up to date as the domain model evolves.

If `CONTEXT.md` doesn't exist yet, the `domain-modeling` skill can help you create it.

### Reading ADRs

ADRs capture significant architectural decisions and their rationale. They are numbered sequentially (e.g., `0001-use-jwt-for-auth.md`) and stored in `docs/adr/`.

The `domain-modeling` skill can create new ADRs when recording architectural decisions.

### Writing domain docs

When you learn new domain concepts, add them to `CONTEXT.md`. When you make an architectural decision worth recording, create an ADR in `docs/adr/` using the `domain-modeling` skill or manually following the ADR template format.
