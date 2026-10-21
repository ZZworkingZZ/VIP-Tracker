# Evertz VIP Source Tracker

An operational tracking and visualization web application for broadcast technical managers and engineers, providing structured visibility into Evertz VIP multiview processor capacities, physical output allocations, designated box layouts, destination ranges, show production assignments, and router source patches.

---

## 1. Operational Purpose & Scope

The application tracks:

- **Multiview Processor Capacities:** Frame-level destination input and physical output capabilities across five multiviews (MV-01 through MV-05).
- **Output Layout Assignments:** Physical display allocations (32 total outputs), designated box count layouts, and inclusive destination ranges.
- **Destination Sources:** Individual router destination input pins (264 total) and patched broadcast sources.
- **Production Packages:** Grouped operational assignment tracking across multiview frames.
- **Data Quality & Validation:** Automated detection of range overlaps, capacity violations, and box count discrepancies.

### Operational Boundaries & Safety Declarations

- **Strictly Read-Only Tracking:** The application represents documented operational baseline data.
- **No Hardware Telemetry or Control:** The application does **NOT** communicate with, control, or send commands to Evertz VIP hardware, router control systems, Lawo, VSM, or Magnum.
- **Local Data Indicator:** The UI prominently displays a **Local Data** indicator to reinforce that presented records reflect tracked baseline data rather than live hardware telemetry.
- **Zero Sensitive Infrastructure Data:** Contains no credentials, authentication tokens, operational network IP addresses, or internal hostnames.

---

## 2. Technology Stack

- **Core:** React 18 with TypeScript 5 (Strict Mode enabled)
- **Build & Dev Tooling:** Vite 6
- **Routing:** React Router 6 (configured with environment-aware basename)
- **Testing:** Vitest 2, React Testing Library 16, jsdom 25
- **Code Quality:** ESLint 9 (flat config), Prettier 3, EditorConfig
- **Styling:** Standard Vanilla CSS using CSS custom properties (`tokens.css`, `global.css`, `components.css`). No UI component frameworks or utility libraries.

---

## 3. Verified Capacities & Baseline Totals

| Multiview ID | Display Name           | Destination / Input Capacity | Physical Output Capacity |
| :----------- | :--------------------- | :--------------------------: | :----------------------: |
| **MV-01**    | Multiview 01 (MV-01)   |              36              |            4             |
| **MV-02**    | Multiview 02 (MV-02)   |              36              |            4             |
| **MV-03**    | Multiview 03 (MV-03)   |              64              |            8             |
| **MV-04**    | Multiview 04 (MV-04)   |              64              |            8             |
| **MV-05**    | Multiview 05 (MV-05)   |              64              |            8             |
| **TOTALS**   | **5 Multiview Frames** |     **264 Destinations**     |      **32 Outputs**      |

---

## 4. Getting Started

### Prerequisites

- Node.js 20 or higher
- npm 10 or higher

### Installation

```bash
npm install
```

### Development

Start the local development server:

```bash
npm run dev
```

Open your browser at `http://localhost:5173`.

### Full Quality Validation

Run the full five-stage validation pipeline (format check, linting, type check, automated tests, and production build):

```bash
npm run validate
```

Individual commands:

```bash
npm run format:check  # Check Prettier formatting
npm run format        # Auto-format all files
npm run lint          # Run ESLint
npm run typecheck     # Run TypeScript compiler check
npm run test          # Run Vitest unit & UI test suite
npm run build         # Build production bundle to dist/
npm run preview       # Preview production build locally
npm run import:data   # Recompile CSV into bundled seed data
```

---

## 5. Reference Data & Ingestion Boundary

### Available Reference File

The repository tracks the baseline CSV export:

```
reference/Evertz VIP Source Tracker (mockup)(Sources).csv
```

This file is preserved exactly as-is. In accordance with operational rules:

- Unassigned source cells are preserved as `null`.
- Source values are never fabricated or guessed.
- The original Excel workbook (`.xlsx`) is **not** currently present in the repository and has not been fabricated.
- A documented ingestion boundary is detailed in [`docs/future-xlsx-import.md`](docs/future-xlsx-import.md) for future workbook ingestion.

---

## 6. GitHub Pages & Deployment Considerations

- The application is configured with an environment-aware Vite base path (`base: process.env.GITHUB_ACTIONS ? '/VIP-Tracker/' : '/'`).
- A GitHub Actions workflow is provided at `.github/workflows/deploy-pages.yml`.
- **Security Notice:** GitHub Pages is not an authorization boundary. A private GitHub repository does not automatically guarantee that deployed Pages sites are private. Operationally sensitive broadcast routing data must not be deployed to public hosts without an approved access-control architecture.

---

## 7. Architecture Documentation Links

- [System Architecture](docs/architecture.md)
- [Domain Data Model](docs/data-model.md)
- [CSV Ingestion Process](docs/csv-import.md)
- [Future XLSX Import Boundary](docs/future-xlsx-import.md)
- [Agent Guidelines (AGENTS.md)](AGENTS.md)
