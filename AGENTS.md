# AGENTS.md — VIP Tracker Project Source of Truth

Authoritative operational rules, architecture, domain invariants, and commands for AI coding assistants working in the **VIP Tracker** repository.

---

## 1. Domain Conceptual Model & Routing Chain

VIP Tracker models broadcast multiviewers following this unidirectional signal hierarchy:

```
Routed Source
    └──> MV-##-## Input / Router Destination
            └──> PIP-##
                    └──> MV-##-## Output
```

### Entity Distinction & Definitions

- **Routed Source (`SRC:...`):** Cataloged broadcast source signal (e.g., `SRC:CAM_1`, `SRC:LINE_01`).
- **MV Input / Router Destination (`DEST:MV-XX-YY`):** Physical router destination fed into a multiview frame (e.g., `DEST:MV-04-37`).
- **PIP (`PIP-##`):** Individual picture-in-picture window position within a layout geometry definition (percentage coordinates `x, y, w, h`). **Never** hard-code MV Input identifiers as PIP positions; MV Inputs are assigned to PIPs.
- **MV Output (`OUT:MV-XX-YY`):** Physical monitor display output driven by a multiview frame (e.g., `OUT:MV-02-01`).

### Multiview Hardware Baseline

The tracked installation consists of 5 physical multiview frames with fixed capacities:

| Multiview ID | Display Name           | Inputs / Router Destinations | Physical Outputs |
| :----------- | :--------------------- | :--------------------------: | :--------------: |
| **MV-01**    | Multiview 01           |              36              |        4         |
| **MV-02**    | Multiview 02           |              36              |        4         |
| **MV-03**    | Multiview 03           |              64              |        8         |
| **MV-04**    | Multiview 04           |              64              |        8         |
| **MV-05**    | Multiview 05           |              64              |        8         |
| **TOTALS**   | **5 Multiview Frames** |     **264 Destinations**     |  **32 Outputs**  |

---

## 2. Core Operational Constraints

1. **Operational Tracking, Not Hardware Control:**
   - The application models and edits tracked VIP configuration/state for planning, documentation, layout design, routing representation, and operator workflows.
   - Application edits affect VIP Tracker's application data only.
   - **No Direct Hardware Telemetry/Control:** Never add Evertz, Lawo, VSM, Magnum, router control, polling, or telemetry unless explicitly requested as a future project capability.
   - Never represent locally tracked data as confirmed live equipment state unless it came from an authoritative live source.

2. **Zero Data Fabrication:**
   - Never invent sources, productions, routing patches, or hardware state.
   - Blank source cells remain unassigned (`null`). Do **not** use placeholders like `UNKNOWN`, `N/A`, `TBD`, or `Admin`.
   - Preserve raw names and casing exactly (e.g., maintain both `HOH-WKB-01` and `HOH_WKB-03` without normalizing).
   - Preserve anomalous seed data as verified (e.g., `OUT:MV-03-03` mapped to destination 64 under `11 BOX`).

3. **Reference Integrity:**
   - `reference/Evertz VIP Source Tracker (mockup)(Sources).csv` is immutable. Never overwrite, rename, or delete reference files without explicit authorization.

4. **Layer Separation & Domain Independence:**
   - Domain logic (`src/domain/`) must remain pure TypeScript with zero React or DOM dependencies.
   - Data access is mediated through `TrackerRepository` (`src/services/TrackerRepository.ts`). UI components consume snapshots via `useTrackerSnapshot()` and domain selectors, never by importing raw CSV or seed records.

5. **Security & Secrets:**
   - Never commit credentials, passwords, tokens, API keys, private keys, or other secrets.
   - Internal hostnames and operational IP addresses may be stored when they are legitimate VIP Tracker engineering data required by the application.
   - Do not use `dangerouslySetInnerHTML`.

---

## 3. Real Repository Commands

Use only the verified commands defined in `package.json`:

| Purpose                 | Command                  | Notes                                                           |
| :---------------------- | :----------------------- | :-------------------------------------------------------------- |
| **Development**         | `npm run dev`            | Starts Vite dev server                                          |
| **Type Check**          | `npm run typecheck`      | Runs `tsc --noEmit` (fastest TypeScript check)                  |
| **Lint**                | `npm run lint`           | Runs `eslint .`                                                 |
| **Lint Auto-Fix**       | `npm run lint:fix`       | Runs `eslint . --fix`                                           |
| **Format Check**        | `npm run format:check`   | Runs `prettier --check .`                                       |
| **Format Fix**          | `npm run format`         | Runs `prettier --write .` (do not run repo-wide on small edits) |
| **Unit/Component Test** | `npm run test`           | Runs `vitest run` once                                          |
| **Targeted Test**       | `npm run test -- <path>` | e.g. `npm run test -- src/domain/selectors.test.ts`             |
| **Production Build**    | `npm run build`          | Runs `tsc -b && vite build`                                     |
| **Full Validation**     | `npm run validate`       | Runs format check, lint, typecheck, tests, and build            |

> [!WARNING]
> Never run `npm run test:watch` or interactive `vitest` in automated workflows; it will hang indefinitely waiting for input.

## Workspace

- Authoritative repo: C:\dev\VIP-Tracker (local clone; same path on home and work PCs). GitHub is the sync point.
- Data repo: C:\dev\VIP-Tracker-Data (PRIVATE, same path on home and work PCs). Holds data/import/*.csv and tracker.json. Real source data lives ONLY here, never in the public app repo.
- Agents may read and write the data repo when a task explicitly involves data. Commit and push data-repo changes from inside that repo, separately from app-repo commits.
- Never use Z:\ or any mirror/validation copy. Never copy files between workspaces. The "no copying between workspaces" rule refers to old mirrors (Z:\, C:\temp); it does not apply to the data repo.
- Never write, log, or commit GitHub tokens in either repo.
- Session start: `git pull --ff-only`. If it fails, STOP and report — do not merge or rebase on your own.
- Session end: all work committed and pushed. Unfinished work goes on a `wip/<feature>` branch, not main.

## Architecture map (read only what the task touches)

- Domain (pure TS): src/domain/ — models.ts, diff.ts, selectors.ts, operator.ts, operatorRoster.ts, attribution.ts, feedback.ts
- Persistence: src/services/ — TrackerRepository.ts, LocalTrackerRepository.ts, storage.ts, operatorStorage.ts
- State: src/app/TrackerRepositoryContext.tsx, src/app/context.ts, src/hooks/useTracker.ts
- UI: src/components/layout/ (AppShell, AppHeader, OperatorModal), src/components/multiview/ (OutputDetailModal, OutputDisplayCard, ReviewChangesModal, EditModeBanner)
- Pages: src/pages/ — DashboardPage.tsx (includes the operational status strip / top stats: VIP Cards count), LayoutAssignmentsPage.tsx, DestinationSourcesPage.tsx, NotFoundPage.tsx, ProductionsPage.tsx, SourceDirectoryPage.tsx
- Styles: src/styles/components.css
- Tests: src/test/ (UI tests: use src/test/helpers/renderWithProviders.tsx; do not hand-build providers.)

## Efficiency rules

- Do not re-read a file range already read this session.
- No baseline test run before changes.
- While iterating: run only the targeted test file.
- Before commit: applies to ALL changes including docs: always run `npx prettier --write <changed files>`, then `npm run validate` ONCE before committing. Do not run lint/typecheck/test/format separately.
- Run `npm run validate` in the foreground and wait for it to finish. Do not background it or poll task status.
- Shell is Windows PowerShell: do not use `&&`. Run git add, commit, and push as separate commands and stop if any one fails.
- Stage files explicitly by path (`git add <file> ...`). Never use `git add .` or `git add -A`.
- Browser verification: skip unless I ask or the change is visual/layout. Max one browser session.
- Commit and push in one step. If git does not finish within 60s, STOP and report. Do not poll.
- Final report: max 10 lines — files changed, validate result, commit hash.
- Execution time reporting: Record start time immediately before beginning work and end time after all requested work/validation completes. Calculate actual elapsed wall-clock time (never estimate), including commands, tests, validation, and Git operations. The final line of every completed task response must be `Total time: X min Y sec` (or `Total time: X sec` if under one minute).

---

## 4. Risk-Based Validation Matrix

**Evidence-Driven Validation:** Validation is evidence-driven, not checklist-driven. Run a command only when its result provides useful evidence for the change being made. Documentation-only changes and trivial static-content changes do not require application tests, typechecking, linting, builds, or full validation.

- Every reported validation result must include the command and pass/fail status (exit code `0` is required to claim an automated check passed).
- Terminated, timed-out, stalled, or incomplete commands are recorded as NOT VALIDATED, not passed.
- Static code review does not replace required automated validation for Level 3 changes.
- Browser smoke testing does not replace typecheck, tests, lint, or build.
- Automated testing does not replace browser validation for interaction behavior that tests do not exercise.

Match validation strictly to the scope and risk of the change.

- **Level 1 — Small / Low-Risk Change** (text, UI tweaks, CSS, test selectors):
  1. Targeted test (if relevant): `npm run test -- <path>`
  2. Typecheck (if TS modified): `npm run typecheck`
  3. Inspect `git diff`
- **Level 2 — Normal Application Change** (component logic, domain models, selectors):
  1. Targeted tests: `npm run test -- <path>`
  2. Typecheck: `npm run typecheck`
  3. Lint (if warranted): `npm run lint`
  4. Inspect `git diff`
- **Level 3 — High-Risk / Architectural Change** (routing model, storage schema, dependencies, build tooling):
  1. Run `npm run validate` once.
  2. Inspect `git diff`

**Anti-Redundancy Rule:** Do not run individual checks and then immediately run `npm run validate`.

---

## 5. Domain Invariants Checklist

Before completing any task:

- [ ] Explicit distinction preserved between Outputs (`OUT:MV-XX-YY`), MV Inputs / Router Destinations (`DEST:MV-XX-YY`), and PIPs (`PIP-##`).
- [ ] Multiview baseline preserved: 5 frames, 32 outputs, 264 destinations.
- [ ] Unassigned sources remain `null` (zero fabrication).
- [ ] Domain logic in `src/domain/` remains independent of React and DOM.
- [ ] No unintended files or generated build artifacts were introduced by the agent's work (never modify, delete, restore, or clean unrelated user changes merely to make the working tree clean).
