# Evertz VIP Source Tracker — System Architecture

## 1. Overview and Purpose

**Evertz VIP Source Tracker** is an internal operational tracking and visualization web application designed for broadcast technical managers and engineers. It tracks multiview hardware capacities, physical output allocations, designated box layouts, show and production assignments, router destination-to-source mappings, and resource lock states.

### Operational Boundaries & Editing Architecture

- **Active Operational Tracking:** Technical managers and engineers actively maintain layouts, source patches, and production ownership directly through a controlled staged-editing interface.
- **Controlled Draft/Staged State:** Edits are staged in draft state and reviewed via pure-domain difference calculation before committing.
- **Local Persistence Boundary:** Data is persisted in browser local storage via an abstracted storage service (`TrackerStorage`), with full capability to reset back to the verified baseline dataset.
- **No Direct Hardware Telemetry:** The application does **NOT** directly control or poll Evertz VIP frames, router control systems, Lawo, VSM, or Magnum.
- **Local Data Indicator:** The UI explicitly displays a **Local Data** indicator with active operating states (`ACTIVE`, `EDIT MODE`, `EDIT MODE • UNSAVED`) to reinforce that data reflects tracked operational documentation rather than live hardware telemetry.
- **Zero Sensitive Secrets:** Contains no internal credentials, passwords, network IP addresses, or infrastructure hostnames.

---

## 2. Core Architecture & Layer Separation

```
[ Reference Documentation / Sources CSV ]
                   │
                   ▼ (npm run import:data)
[ Deterministic Bundled Typed Seed Snapshot ]
                   │
                   ▼
       [ TrackerRepository (Interface) ]
                   │
                   ├── LocalTrackerRepository (In-memory baseline)
                   └── (Future: ApiTrackerRepository)
                   │
                   ▼
     [ TrackerRepositoryContext / Provider ]
                   │
     ┌─────────────┴─────────────┐
     ▼                           ▼
[ Tested Domain Selectors ]   [ Structured Validation Engine ]
     │                           │
     └─────────────┬─────────────┘
                   ▼
  [ Operational View Pages & Components ]
  (Dashboard, Layouts, Destinations, Productions, Directory)
```

### Architectural Principles

1. **Domain Isolation:**
   - All domain logic (`src/domain/`) is 100% pure TypeScript with zero React or DOM dependencies.
   - Models, validation rules, identifier utilities, and selectors can be tested in isolation in Node or any JS runtime.

2. **Repository Abstraction:**
   - Data access is mediated through the asynchronous `TrackerRepository` interface (`src/services/TrackerRepository.ts`).
   - The current implementation (`LocalTrackerRepository`) loads the bundled, immutable typed baseline snapshot.
   - Future REST API backends or WebSocket streams can replace `LocalTrackerRepository` without rewriting any page components.

3. **No Direct Component Seed Ingestion:**
   - React components never import raw CSV files or seed JSON directly. They consume data via `useTrackerSnapshot()` and pure selector functions.

4. **Explicit Identifiers:**
   - Output and Destination entities share similar visual numbering (e.g., `MV-04-02` output vs `MV-04-37` destination).
   - The system uses explicit, branded string types (`OUT:MV-04-02` vs `DEST:MV-04-37`) to guarantee that output and destination entities are never confused.

---

## 3. Technology Stack

- **Framework:** React 18 with TypeScript 5 (Strict Mode enabled)
- **Build Tool:** Vite 6
- **Routing:** React Router 6 with environment-aware basename
- **Testing:** Vitest 2, React Testing Library 16, jsdom 25
- **Code Standards:** ESLint 9 (flat config), Prettier 3, EditorConfig
- **Styling:** Standard Vanilla CSS with CSS custom properties (`tokens.css`, `global.css`, `components.css`). No heavy CSS frameworks.

---

## 4. Operational Visualization Architecture (V1.1)

V1.1 shifts the application from a data-first table presentation to an **Evertz-style Displays-First Operational Interface** designed for broadcast technical managers and EICs.

```
                  [ LayoutDefinition ]
             (id, name, aspectRatio, windows[])
                           │
                           ▼
                  [ LayoutRenderer ]
    ┌──────────────────────┼──────────────────────┐
    ▼                      ▼                      ▼
[ Thumbnail Mode ]    [ Card Mode ]         [ Detail Mode ]
(Layout Library)     (Outputs Display)      (Focus Inspection Modal)
```

### Key Components

1. **Pure Geometry Layout Definitions (`src/domain/layoutDefinitions.ts`):**
   - Declarative definitions of standard Evertz layouts (`1 BOX`, `2 BOX`, `3 BOX`, `4 BOX`, `6 BOX`, `8 BOX`, `10 BOX`, `11 BOX`, `12 BOX`, `16 BOX`, `20 Box Audio`, `36 BOX`).
   - Models real Evertz window geometry (hero windows, auxiliary splits, audio meters) as percentage coordinates `(x, y, width, height)` rather than uniform CSS grids.
   - Provides deterministic fallback grid generation for custom or unrecognized box layouts.

2. **Unified `LayoutRenderer` (`src/components/multiview/LayoutRenderer.tsx`):**
   - Renders a 16:9 aspect-ratio monitor representation.
   - Resolves router destination offsets to patched broadcast sources.
   - Color-codes source tallies by broadcast category (`CAM`, `VTR`, `GFX`, `ROUTER`, `NET`, `LINE`, `MISC`).

3. **`OutputDisplayCard` (`src/components/multiview/OutputDisplayCard.tsx`):**
   - Miniature multiview monitor card displaying status LEDs, layout badges, routed sources, and lock indicators.
   - Visually differentiates active outputs from unassigned/available outputs using neutral dark frames.

4. **`OutputDetailModal` (`src/components/multiview/OutputDetailModal.tsx`):**
   - High-resolution drill-in inspection modal with keyboard navigation (Escape, previous/next output cycling).
   - Shows detailed router destination breakdown, source categories, and validation notes.

5. **Display View | Table View Toggle:**
   - Every operational area provides an instant toggle between the **Display View** (situational awareness, Tech Ops visual monitoring) and the **Table View** (engineering audits, pin verification, diagnostic analysis).

6. **Evertz Visual Design System (`--ev-*` Tokens & Utilitarian Control Surface):**
   - **Color Language:** Modeled after Evertz VIP/SDVN interfaces with canvas (`#141414`), sidebar (`#202020`), control surfaces (`#262626`–`#343434`), top command bar (`#2864a3`), and broadcast status LEDs (`#54d54a` healthy tracking, `#e2b93b` warnings, `#d84c4c` conflicts).
   - **Compact Sans-Serif Typography:** Uses system utilitarian typography (`Arial, Helvetica, "Segoe UI", sans-serif`) with condensed spacing and crisp operational labels rather than heavy modern web fonts.
   - **Hardware Control Console Shell:** Evertz top system bar with branding, `Local Data` tracking status, `READ-ONLY` indicator, `TECH OPS` role, and collapsible vertical sidebar navigation (`🖥 Multiviewers`, `▦ Layouts`, `⇄ Sources`, `◫ Assignments`, `⎘ Source Directory`).
   - **Evertz MV Display Cards:** Real Evertz display card structure with thin gray outline, pure black background, output identifier, upper-right status dot, routed source geometry with `Src XX` pin numbers, and bottom assignment footer.
