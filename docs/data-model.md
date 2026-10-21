# Evertz VIP Source Tracker — Domain Data Model

## 1. Multiview Hardware Capacities

The application tracks five physical multiview processor frames with verified capacities:

| Multiview ID | Display Name           | Destination / Input Capacity | Physical Output Capacity |
| :----------- | :--------------------- | :--------------------------: | :----------------------: |
| **MV-01**    | Multiview 01 (MV-01)   |              36              |            4             |
| **MV-02**    | Multiview 02 (MV-02)   |              36              |            4             |
| **MV-03**    | Multiview 03 (MV-03)   |              64              |            8             |
| **MV-04**    | Multiview 04 (MV-04)   |              64              |            8             |
| **MV-05**    | Multiview 05 (MV-05)   |              64              |            8             |
| **TOTALS**   | **5 Multiview Frames** |     **264 Destinations**     |      **32 Outputs**      |

---

## 2. Entity Models

### 2.1 MultiviewOutput

Represents an individual physical display output from a multiview frame.

- `id`: `OutputId` (e.g. `'OUT:MV-02-01'`)
- `multiviewId`: `MultiviewId`
- `outputNumber`: `number` (1-indexed, 1 to `outputCapacity`)
- `layoutName`: `string | null` (e.g. `'4 BOX'`, `'6 BOX'`)
- `destinationStart`: `number | null` (1-indexed start input)
- `destinationEnd`: `number | null` (inclusive 1-indexed end input)
- `assignmentName`: `string | null` (Operational show/monitoring assignment label)
- `notes`: `string | null`
- `status`: `'Available' | 'Assigned' | 'Reserved'`
- `locked`: `boolean`
- `updatedAt`: `string | null`
- `updatedBy`: `string | null`

### 2.2 Destination

Represents a physical router input destination fed into the multiview frame.

- `id`: `DestinationId` (e.g. `'DEST:MV-04-37'`)
- `multiviewId`: `MultiviewId`
- `destinationNumber`: `number` (1-indexed, 1 to `destinationCapacity`)
- `assignedSourceId`: `SourceId | null` (ID of patched broadcast source, or null if unassigned)
- `assignmentName`: `string | null` (derived operational assignment)
- `locked`: `boolean`
- `updatedAt`: `string | null`
- `updatedBy`: `string | null`

### 2.3 Source

Represents a cataloged router source signal.

- `id`: `SourceId` (e.g. `'SRC:CAM_1'`)
- `name`: `string` (Exact preserved raw label)
- `normalizedName`: `string`
- `category`: `SourceCategory`
- `active`: `boolean`

### 2.4 OperationalAssignment

Represents a distinct operational assignment group derived from output records.

- `id`: `AssignmentId`
- `rawName`: `string`
- `displayName`: `string`
- `active`: `boolean`

### 2.5 ValidationFinding

Represents a structured data quality observation, warning, or error.

- `id`: `string`
- `severity`: `'error' | 'warning' | 'info'`
- `code`: `ValidationCode`
- `message`: `string`
- `entityType`: `'multiview' | 'output' | 'destination' | 'source' | 'assignment'`
- `entityId`: `string`
- `relatedEntityIds`: `string[]`

### 2.6 ChangeSet & FieldChange

Represents a staged, reviewed difference collection committed to persistent storage.

- `id`: `string`
- `timestamp`: `string` (ISO 8601)
- `summary`: `string`
- `changes`: `FieldChange[]` (each item detailing `entityType`, `entityId`, `field`, `previousValue`, `newValue`, `description`)

### 2.7 Authoritative Entity Hierarchy

The configuration follows a single authoritative relationship:

```
Production / Show Assignment
       │
       ▼
VIP Physical Output
       │
       ▼
Layout Geometry Definition
       │
       ▼
Covered Destination Windows
       │
       ▼
Tracked Router Source
```

Derived views (Displays, Sources Matrix, Operational Assignments, Layout Library, Table audits) calculate presentation dynamically from this canonical relationship.

---

## 3. Preserved Raw Operational Seed Records

### MV-03-03 Record Preservation

- Output `OUT:MV-03-03` has verified layout `'11 BOX'`, assignment `'BOB TEST'`, and destination range `64-64`.
- The data model preserves `destinationStart: 64` and `destinationEnd: 64` exactly as verified.
- The validation engine raises a `BOX_COUNT_RANGE_MISMATCH` warning for operator visibility without mutating or fabricating data.

### Preserved Naming Patterns

- Outputs `OUT:MV-04-02` and `OUT:MV-04-03` use hyphenated naming: `'HOH-WKB-01'` and `'HOH-WKB-02'`.
- Outputs `OUT:MV-05-04`, `OUT:MV-05-05`, and `OUT:MV-05-06` use underscore naming: `'HOH_WKB-03'`, `'HOH_WKB-04'`, `'HOH_WKB-05'`.
- These raw values are strictly preserved without normalization. An informational finding (`NAMING_INCONSISTENCY`) notes the variation.
