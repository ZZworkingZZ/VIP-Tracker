# Future XLSX Ingestion Boundary

## 1. Current State & Intentional Scope

The original Excel workbook (`reference/Evertz VIP Source Tracker (mockup).xlsx`) is **not** currently present in the repository.

Per operational directives:

- No XLSX file has been fabricated or reconstructed.
- No XLSX parsing script (`extract-workbook-data.py`) has been added in this foundation phase.
- The application relies on the verified CSV reference file for destination/source topology and explicitly verified project specifications for initial output layout assignments.

---

## 2. Ingestion Boundary Specification

The application architecture establishes a strict import boundary designed so that when the complete workbook becomes available, an ingestion script can be introduced without modifying UI components, page layouts, or routing.

### Expected Future Ingestion Flow

```
[ Evertz VIP Source Tracker (mockup).xlsx ]
                   │
                   ▼ (Future: scripts/extract-workbook-data.py or Node script)
          [ Workbook Ingestion Boundary ]
                   │
                   ├── Validates Sheet Schemas & Capacities
                   ├── Maps Outputs, Layouts, and Ranges to domain models
                   ├── Maps Patched Sources to Source catalog
                   └── Emits typed TrackerSnapshot
                   │
                   ▼
       [ src/data/seed/snapshot.ts ]
```

### Required Ingestion Contract

Any future workbook importer must adhere to the domain contracts defined in `src/domain/models.ts`:

1. **Multiview Verification:**
   - Must confirm the 5 verified multiview frames (MV-01 to MV-05) and validate against known capacities (36/36/64/64/64).

2. **Output Layout Mapping:**
   - Must emit `MultiviewOutput` records with explicit `OutputId` (`OUT:MV-XX-YY`), internal destination coordinates (`destinationStart`, `destinationEnd`), and exact raw assignment names.

3. **Destination Mapping:**
   - Must emit `Destination` records with explicit `DestinationId` (`DEST:MV-XX-YY`) and associate verified `SourceId` values.

4. **Preservation of Raw Values:**
   - Must not silently normalize inconsistent naming (e.g. `HOH-WKB` vs `HOH_WKB`).
   - Must preserve special cases such as `MV-03-03` with layout `11 BOX` and single-destination mapping `64-64`.

5. **Validation Pipeline Integration:**
   - Must execute `validateSnapshot()` upon generation to verify that no overlapping output ranges or out-of-capacity numbers are committed.
