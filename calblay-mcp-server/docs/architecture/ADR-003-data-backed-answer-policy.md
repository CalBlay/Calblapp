# ADR-003: Data-backed Answer Policy

## Status
Accepted

## Decision
For data intents, answers without data tool calls are not allowed.

## Rationale
Avoids hallucinations and generic responses that look plausible but are operationally wrong.

## Consequence
If no data tool call is used, the system returns an explicit "data not validated" style answer.
