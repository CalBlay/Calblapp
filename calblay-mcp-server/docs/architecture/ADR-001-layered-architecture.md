# ADR-001: Layered Architecture

## Status
Accepted

## Decision
Use a layered architecture:
- core contracts
- semantics
- policies
- data adapters
- AI orchestration

## Rationale
Prevents tool-level sprawl, improves testability, and supports future ML integration without refactoring entrypoints.
