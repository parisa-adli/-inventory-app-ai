# 1. The agreed design Q&A takes precedence over the PRD

Date: 2026-10-18 · Status: Accepted

## Context

`CLAUDE.md` makes `docs/PRD.md` the source of truth: when a task file and the PRD disagree, the PRD wins and the conflict is flagged. Before building Products (P3) and Stock Movements (P4), the user and the agent went through a design Q&A (summarised in issue #27). Several answers deliberately depart from the PRD: the movement fields, archiving, the stock-change endpoints, the error code for shipping more than is on hand, PATCH instead of PUT, and a new reconciliation endpoint.

## Decision

Where the PRD and the agreed design Q&A conflict, the Q&A wins. Each departure is recorded as a numbered entry in `CONTRACT-CHANGES.md` (continuing its existing numbering), so the PRD plus that file always describe the contract the code implements. Where the Q&A says nothing, the PRD still wins, and a conflict between the PRD and anything else is still flagged, not guessed.

## Consequences

- Readers cannot rely on the PRD alone for products and stock: they must read `CONTRACT-CHANGES.md` next to it.
- An agent that finds a PRD conflict checks `CONTRACT-CHANGES.md` and the ADRs before asking the user.
