# CSV Ingestion & Seed Data Generation

## 1. Reference File Specification

The repository includes the baseline operational reference file:

```
reference/Evertz VIP Source Tracker (mockup)(Sources).csv
```

This reference file is strictly preserved as-is and must never be deleted, modified, or overwritten.

---

## 2. Real CSV Structure

The reference CSV is organized horizontally across all five multiview frames:

```csv
MV-01,,,MV-02,,,MV-03,,,MV-04,,,MV-05,
Destination,Source,,Destination,Source,,Destination,Source,,Destination,Source,,Destination,Source
MV-01-01,,,MV-02-01,,,MV-03-01,,,MV-04-01,,,MV-05-01,
MV-01-02,,,MV-02-02,,,MV-03-02,,,MV-04-02,,,MV-05-02,
...
```

### Column Layout

- **Columns 0 & 1:** MV-01 Destination ID and Source Name
- **Column 2:** Empty delimiter column
- **Columns 3 & 4:** MV-02 Destination ID and Source Name
- **Column 5:** Empty delimiter column
- **Columns 6 & 7:** MV-03 Destination ID and Source Name
- **Column 8:** Empty delimiter column
- **Columns 9 & 10:** MV-04 Destination ID and Source Name
- **Column 11:** Empty delimiter column
- **Columns 12 & 13:** MV-05 Destination ID and Source Name

---

## 3. Parsing and Ingestion Rules

1. **Unassigned Source Preservation:**
   - In the initial mockup CSV, source cells are blank.
   - Blank cells are treated strictly as unassigned (`assignedSourceId: null`).
   - The parser **never** fabricates source names, router routes, or placeholder text (`UNKNOWN`, `N/A`, `TBD`).

2. **Capacity & Format Validation:**
   - Destination identifiers are matched against `^MV-(\d{2})-(\d{2,3})$`.
   - The destination number is validated against the verified capacity of the corresponding multiview frame (36 for MV-01/02, 64 for MV-03/04/05).
   - Any malformed rows or overflow numbers are reported in the parse result rather than crashing.

3. **Bundled Seed Compilation:**
   - The build process does not require the browser to read local files or network paths (`Z:\`).
   - The parser (`src/services/csv/parseSourcesCsv.ts`) is invoked during data compilation via:
     ```bash
     npm run import:data
     ```
   - This compiles the raw CSV into immutable, strongly typed TypeScript files in `src/data/seed/`.
