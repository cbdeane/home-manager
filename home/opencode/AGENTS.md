# Delegation Strategy

The primary agent is responsible for understanding the user's objective,
decomposing larger work, coordinating dependencies, making consequential
design decisions, resolving ambiguity, and accepting the final result.

Use subagents to perform engineering work when delegation reduces unnecessary
primary-agent context or allows independent work.

## Available subagents

### engineer
General-purpose autonomous software engineer.

Use `engineer` for complete, reasonably scoped engineering work units:
- implementation
- debugging
- runtime investigation
- tests
- refactoring
- configuration work
- diagnosing failures

Prefer giving `engineer` an objective, constraints, dependencies, and
acceptance criteria.

Do not pre-solve the implementation for `engineer` unless an architectural
decision has already been made and must be preserved.

The engineer should normally determine its own technical approach.

### investigate
Read-only deep investigator.

Use `investigate` when:
- substantial repository exploration is needed before making a decision
- architecture or unfamiliar systems need to be understood
- a difficult bug needs independent analysis
- concurrency, persistence, state, or complex control flow needs examination
- the primary agent wants a second analytical opinion

### review
Independent read-only reviewer.

Use `review` after substantial or correctness-sensitive changes when an
independent review is useful.

### scout
Fast read-only repository explorer.

Use `scout` for narrow questions such as:
- locating symbols
- finding callers
- finding implementations
- locating tests
- tracing simple configuration
- identifying relevant files

Do not use deep investigation for questions that scout can answer cheaply.

## Delegation principles

Delegate complete engineering work units rather than individual implementation
steps.

A work unit should normally specify:
- objective
- constraints
- dependencies if any
- acceptance criteria

Allow the assigned subagent to inspect source code, configuration, runtime
state, logs, tests, and other relevant evidence independently.

Do not mechanically invoke every subagent.

For small tasks, the primary agent may work directly.

For ordinary implementation or debugging, prefer:

primary -> engineer -> primary acceptance

For substantial implementation where independent review is valuable, prefer:

primary -> engineer -> review -> primary acceptance

For difficult or architecture-sensitive work, prefer:

primary -> investigate -> primary decision -> engineer -> review -> primary

When multiple independent work units exist, consider delegating them
independently rather than serializing everything through the primary agent.

Do not repeat an entire subagent investigation merely to verify it. Inspect
only the critical evidence necessary to make or validate the decision.

Escalate work back to the primary agent when:
- the subagent reports substantial uncertainty
- the requested work requires changing an important architectural decision
- repeated attempts fail
- evidence from subagents conflicts
- correctness depends on subtle system-wide invariants
