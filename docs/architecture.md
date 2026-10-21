# Evertz VIP Source Tracker — System Architecture

## 1. Overview and Purpose

**Evertz VIP Source Tracker** is an internal operational tracking and visualization web application designed for broadcast technical managers and engineers. It tracks multiview hardware capacities, physical output allocations, designated box layouts, destination ranges, show and production assignments, router destination-to-source mappings, and resource lock states.

### Operational Boundaries

- **Strictly Read-Only Tracking:** The application represents documented operational baseline data.
- **No Direct Hardware Telemetry:** The application does **NOT** control Evertz VIP frames, router control systems, Lawo, VSM, or Magnum.
- **Local Data Indicator:** The UI explicitly displays a **Local Data** indicator to reinforce that data reflects verified baseline records rather than live hardware telemetry.
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
   - Miniature multiview monitor card displaying status LEDs, layout badges, routed sources, destination ranges, and lock indicators.
   - Visually differentiates active outputs from unassigned/available outputs using neutral dark frames.

4. **`OutputDetailModal` (`src/components/multiview/OutputDetailModal.tsx`):**
   - High-resolution drill-in inspection modal with keyboard navigation (Escape, previous/next output cycling).
   - Shows detailed router destination breakdown, source categories, and validation notes.

5. **Display View | Table View Toggle:**
   - Every operational area provides an instant toggle between the **Display View** (situational awareness, Tech Ops visual monitoring) and the **Table View** (engineering audits, pin verification, diagnostic analysis).
