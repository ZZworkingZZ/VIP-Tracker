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

## Required Completion Checks

Before declaring any task complete:

```bash
npm run validate
```

Every stage must pass cleanly:

1. `npm run format:check`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run build`
