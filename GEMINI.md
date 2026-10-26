# GEMINI.md — Instructions for Gemini Agent

This repository follows the architectural rules, security boundaries, and operational constraints specified in [`AGENTS.md`](AGENTS.md).

---

## Mandatory Operational Rules

1. **Read Guidelines First:**
   Before modifying code, read [`AGENTS.md`](AGENTS.md), [`README.md`](README.md), and [`docs/architecture.md`](docs/architecture.md).

2. **Entity Discipline:**
   Maintain the explicit typed distinction between **Outputs** (`OUT:MV-XX-YY`) and **Destinations** (`DEST:MV-XX-YY`).

3. **No Hardware Control or Telemetry:**
   Never add device control, router routing, Lawo, VSM, or Magnum integration. This is a read-only tracking system.

4. **Zero Fabrication:**
   Never invent sources, productions, or routing patches. Blank cells remain `null`. Preserve raw values exactly.

---

## Risk-Based Development & Completion Checks

Optimize for **speed and efficiency** while maintaining core safeguards. Match validation effort to the risk level of the change (see [`AGENTS.md`](AGENTS.md) for full details):

- **Level 1 (Small / Low-Risk):** Targeted test (if exists) + `npm run typecheck` (if TS changed) → Git commit & push. Do NOT run full validate or full test suite.
- **Level 2 (Normal App Change):** Relevant tests + `npm run typecheck` (+ lint if warranted) → Git commit & push.
- **Level 3 (High-Risk / Architectural):** Run `npm run validate` once.

**Redundancy Rule:** Never run individual checks and then immediately run `npm run validate`. Never inspect unrelated files or reformat unrelated code.

**Autonomous Git Push:** Once appropriate validation passes and `git diff` is confirmed clean, stage, commit, and push directly to `origin/main` without waiting for extra confirmation.
