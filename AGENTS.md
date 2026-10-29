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

### Windows Command Execution

- On Windows PowerShell, use `npm.cmd` and `npx.cmd` instead of bare `npm` or `npx`.
- This avoids failures caused by PowerShell execution policies blocking `npm.ps1` or `npx.ps1`.

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

### Source-Related Architecture Map

For features involving source identity, source search, source routing, or source display, inspect these primary locations first:

- `src/domain/models.ts`
- `src/domain/selectors.ts`
- `src/pages/SourceDirectoryPage.tsx`
- `src/pages/DestinationSourcesPage.tsx`
- `src/components/multiview/LayoutRenderer.tsx`
- `src/components/multiview/OutputDisplayCard.tsx`
- `src/components/multiview/OutputDetailModal.tsx`
- `src/components/multiview/SourceRoutingSelectorModal.tsx`
- `src/components/multiview/SourceSignalFlowModal.tsx`

Do not inspect `DashboardPage.tsx`, `ProductionsPage.tsx`, or `LayoutAssignmentsPage.tsx` for source-display changes unless references or test failures indicate they are directly involved.

### GitHub Repository Test Mocks

- Mock responses for `GitHubClient.fetchFileContents` and GitHub `/contents/` endpoints must include `type: "file"`.

## Efficiency rules

### Targeted discovery first

- If the prompt names target files, start there. Don't search the whole repo unless those files point you elsewhere.
- Cap exploration at about 15 searches or reads before the first edit. If you need more, say why in one line.
- Read whole relevant sections once. Don't re-read the same file in small slices.
- Skip components that are clearly unrelated to the task, like modals and pages that never reference the feature.

### Pre-edit dependency mapping

Before modifying shared domain behavior, repository/context actions, selectors, persistence behavior, diff/change-review behavior, or shared editing behavior:

- Identify likely direct implementation dependencies.
- Identify existing tests most likely to be affected.
- Identify serialization/storage/diff dependencies when data model or persisted state is involved.
- **Identify broadly, read narrowly:** Establish the likely blast radius first, then read only files necessary to implement safely. Do not broadly read the repository.
- **VIP Tracker Shared-State Checklist:** Changes involving `TrackerSnapshot`, `operationalAssignments`, `MultiviewOutput`, production assignments, or other persisted shared-state concepts should consider the relevant portions of:
  - domain models (`src/domain/models.ts`)
  - selectors (`src/domain/selectors.ts`)
  - serialization/storage (`src/services/storage.ts`, `LocalTrackerRepository.ts`)
  - diff/change review (`src/domain/diff.ts`, Review modals)
  - TrackerRepositoryContext / context actions (`src/app/TrackerRepositoryContext.tsx`)
  - affected UI components and pages
  - associated editing, reliability, and component tests
    _(This is a dependency checklist to prevent omissions, NOT permission to automatically read every listed file)._

### Predict test impact before implementation

At the end of an investigation/planning phase, briefly identify:

- existing tests likely to be affected
- new regression tests likely required
- important behavioral invariants that must remain intact

Use this prediction to guide the implementation rather than discovering obvious test dependencies only after failures.

### Cohesive edit passes

- When multiple related changes to the same file are already known, plan them together.
- Prefer one cohesive edit pass over many small sequential edits.
- Additional edits are appropriate when tests, typechecking, or newly discovered evidence reveal something that was not reasonably knowable during the initial pass.
- Do not over-plan trivial changes.
- Edit files directly with the built-in edit tool.
- Don't create helper or throwaway scripts (e.g. `update_files.js`, `fix_*.js`) to apply edits. If an edit fails because of whitespace or line endings, re-read the exact lines and retry the edit.
- Line endings: let Prettier normalize them. Don't investigate CRLF manually.

### Formatting

- Run `npx.cmd prettier --write <touched files>` only on the files you changed, once, after you finish editing.
- Don't run the repo-wide `format:check` as a debugging step.

### Validation order & feedback loops

For substantive changes, follow this validation order:
`Implementation` → `format touched files` → `run smallest relevant targeted tests` → `run TypeScript/typecheck when applicable` → `fix failures` → `rerun affected targeted validation` → `run full npm run validate (only after targeted checks are green)` → `commit` → `push`.

- **Final gate, not diagnostic tool:** `npm run validate` is the FINAL validation gate, not the primary diagnostic tool. Do not run full validation while known targeted test or TypeScript failures remain.
- **Avoid repeated full suites:** Avoid repeatedly running the full validation suite unless a subsequent change after the first full validation could realistically affect other parts of the repository.
- **Optimize for feedback loops, not execution time:** Do not sacrifice correctness or validation just to reduce elapsed execution time. For a normal feature/change, aim for:
  - one focused investigation pass
  - one primary implementation pass
  - one targeted validation/fix loop when possible
  - one final full validation
  - one commit/push cycle
    _(This is a target, not a hard limit; correctness takes priority when additional investigation or validation is genuinely necessary)._

### Scope discipline

- Only touch files required by the task plus their directly related tests.
- If you notice unintended diffs, revert them right away with `git checkout -- <file>`.
- Never modify the private data repo unless explicitly told to.

### Git hygiene & execution rules

- Before you commit, run `git status` and make sure there are no untracked temp files. Delete any you created.
- Stage files explicitly by path (`git add <file> ...`). Never use `git add .` or `git add -A`.
- Do not re-read a file range already read this session.
- No baseline test run before changes.
- While iterating: run only the targeted test file.
- Before commit: for substantive changes, run prettier on touched files, verify targeted tests/typecheck, then run `npm run validate` ONCE as the final gate. Documentation-only changes do not require application tests, typecheck, or full validate (see Section 4).
- Run `npm run validate` in the foreground and wait for it to finish. Do not background it or poll task status.
- Shell is Windows PowerShell: do not use `&&`. Run git add, commit, and push as separate commands and stop if any one fails.
- Browser verification: skip unless I ask or the change is visual/layout. Max one browser session.
- Commit and push in one step. If git does not finish within 60s, STOP and report. Do not poll.
- Final report: max 10 lines — files changed, validate result, commit hash.
- Execution-time reporting: Record start time immediately before beginning work and end time after all requested work/validation completes. Calculate actual elapsed wall-clock time (never estimate), including commands, tests, validation, and Git operations. Execution time is an observation metric, not a performance target. The final line of every completed task response must be `Total time: X min Y sec` (or `Total time: X sec` if under one minute).

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
