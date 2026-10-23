import fs from 'fs';
import path from 'path';
import { parseSourcesCsv } from '../src/services/csv/parseSourcesCsv';
import { VERIFIED_MULTIVIEWS } from '../src/domain/constants';
import { Multiview, MultiviewOutput, OperationalAssignment } from '../src/domain/models';
import { createOutputId, createAssignmentId, MultiviewId } from '../src/domain/identifiers';
import { validateSnapshot } from '../src/domain/validation';
import { SEED_SOURCES } from '../src/data/seed/sources';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.resolve(
  __dirname,
  '../reference/Evertz VIP Source Tracker (mockup)(Sources).csv'
);
const OUTPUT_DIR = path.resolve(__dirname, '../src/data/seed');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log(`Reading CSV from ${CSV_PATH}...`);
const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
const parseResult = parseSourcesCsv(csvContent);

if (parseResult.errors.length > 0) {
  console.warn('CSV Parse Warnings / Errors:', parseResult.errors);
}

// 1. Multiviews
const multiviews: Multiview[] = VERIFIED_MULTIVIEWS.map((mv) => ({ ...mv }));

// 2. Verified Initial Layout Assignments
interface SeedOutputAssignment {
  multiviewId: MultiviewId;
  outputNumber: number;
  layoutName: string;
  destinationStart: number;
  destinationEnd: number;
  assignmentName: string;
  notes?: string;
  locked?: boolean;
}

const VERIFIED_OUTPUT_ASSIGNMENTS: SeedOutputAssignment[] = [
  // MV-02
  {
    multiviewId: 'MV-02',
    outputNumber: 1,
    layoutName: '6 BOX',
    destinationStart: 1,
    destinationEnd: 3,
    assignmentName: 'BR ALERT 1',
  },
  {
    multiviewId: 'MV-02',
    outputNumber: 2,
    layoutName: '3 BOX',
    destinationStart: 4,
    destinationEnd: 6,
    assignmentName: 'BR ALERT 2',
  },
  {
    multiviewId: 'MV-02',
    outputNumber: 3,
    layoutName: '3 BOX',
    destinationStart: 8,
    destinationEnd: 10,
    assignmentName: 'BR ALERT 3',
  },
  {
    multiviewId: 'MV-02',
    outputNumber: 4,
    layoutName: '4 BOX',
    destinationStart: 11,
    destinationEnd: 14,
    assignmentName: 'BR ALERT 4',
  },

  // MV-03
  {
    multiviewId: 'MV-03',
    outputNumber: 1,
    layoutName: '4 BOX',
    destinationStart: 1,
    destinationEnd: 4,
    assignmentName: 'BR ALERT 4',
  },
  {
    multiviewId: 'MV-03',
    outputNumber: 2,
    layoutName: '8 BOX',
    destinationStart: 9,
    destinationEnd: 16,
    assignmentName: 'ENG TEST',
  },
  {
    multiviewId: 'MV-03',
    outputNumber: 3,
    layoutName: '11 BOX',
    destinationStart: 64,
    destinationEnd: 64,
    assignmentName: 'BOB TEST',
  },
  {
    multiviewId: 'MV-03',
    outputNumber: 4,
    layoutName: '10 BOX',
    destinationStart: 30,
    destinationEnd: 39,
    assignmentName: 'RANKINGS',
  },

  // MV-04
  {
    multiviewId: 'MV-04',
    outputNumber: 1,
    layoutName: '36 BOX',
    destinationStart: 1,
    destinationEnd: 36,
    assignmentName: 'JXS DEC',
  },
  {
    multiviewId: 'MV-04',
    outputNumber: 2,
    layoutName: '4 BOX',
    destinationStart: 37,
    destinationEnd: 40,
    assignmentName: 'HOH-WKB-01',
  },
  {
    multiviewId: 'MV-04',
    outputNumber: 3,
    layoutName: '12 BOX',
    destinationStart: 41,
    destinationEnd: 52,
    assignmentName: 'HOH-WKB-02',
  },

  // MV-05
  {
    multiviewId: 'MV-05',
    outputNumber: 1,
    layoutName: '36 BOX',
    destinationStart: 1,
    destinationEnd: 36,
    assignmentName: 'JXS ENC',
  },
  {
    multiviewId: 'MV-05',
    outputNumber: 4,
    layoutName: '4 BOX',
    destinationStart: 47,
    destinationEnd: 50,
    assignmentName: 'HOH_WKB-03',
  },
  {
    multiviewId: 'MV-05',
    outputNumber: 5,
    layoutName: '4 BOX',
    destinationStart: 51,
    destinationEnd: 54,
    assignmentName: 'HOH_WKB-04',
  },
  {
    multiviewId: 'MV-05',
    outputNumber: 6,
    layoutName: '4 BOX',
    destinationStart: 55,
    destinationEnd: 58,
    assignmentName: 'HOH_WKB-05',
  },
];

// Generate all 32 outputs
const outputs: MultiviewOutput[] = [];
for (const mv of VERIFIED_MULTIVIEWS) {
  for (let outNum = 1; outNum <= mv.outputCapacity; outNum++) {
    const id = createOutputId(mv.id, outNum);
    const assigned = VERIFIED_OUTPUT_ASSIGNMENTS.find(
      (a) => a.multiviewId === mv.id && a.outputNumber === outNum
    );

    if (assigned) {
      outputs.push({
        id,
        multiviewId: mv.id,
        outputNumber: outNum,
        layoutName: assigned.layoutName,
        destinationStart: assigned.destinationStart,
        destinationEnd: assigned.destinationEnd,
        assignmentName: assigned.assignmentName,
        notes: assigned.notes ?? null,
        status: 'Assigned',
        locked: assigned.locked ?? false,
        updatedAt: null,
        updatedBy: null,
      });
    } else {
      outputs.push({
        id,
        multiviewId: mv.id,
        outputNumber: outNum,
        layoutName: null,
        destinationStart: null,
        destinationEnd: null,
        assignmentName: null,
        notes: null,
        status: 'Available',
        locked: false,
        updatedAt: null,
        updatedBy: null,
      });
    }
  }
}

// 3. Destinations from CSV
const destinations = parseResult.destinations;

// 4. Sources: use parsed sources if present in CSV, otherwise preserve SEED_SOURCES inventory
const sources = parseResult.sources.length > 0 ? parseResult.sources : SEED_SOURCES;

// 5. Operational assignments derived strictly from verified output data
const uniqueAssignmentNames = Array.from(
  new Set(outputs.map((o) => o.assignmentName).filter((n): n is string => Boolean(n)))
);

const operationalAssignments: OperationalAssignment[] = uniqueAssignmentNames.map((name) => ({
  id: createAssignmentId(name),
  rawName: name,
  displayName: name,
  active: true,
}));

// 6. Validation findings
const validationFindings = validateSnapshot(multiviews, outputs, destinations, sources);

// Write individual seed files and snapshot
fs.writeFileSync(
  path.join(OUTPUT_DIR, 'multiviews.ts'),
  `import { Multiview } from '../../domain/models';\n\nexport const SEED_MULTIVIEWS: Multiview[] = ${JSON.stringify(multiviews, null, 2)};\n`
);

fs.writeFileSync(
  path.join(OUTPUT_DIR, 'outputs.ts'),
  `import { MultiviewOutput } from '../../domain/models';\n\nexport const SEED_OUTPUTS: MultiviewOutput[] = ${JSON.stringify(outputs, null, 2)};\n`
);

fs.writeFileSync(
  path.join(OUTPUT_DIR, 'destinations.ts'),
  `import { Destination } from '../../domain/models';\n\nexport const SEED_DESTINATIONS: Destination[] = ${JSON.stringify(destinations, null, 2)};\n`
);

if (parseResult.sources.length > 0) {
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'sources.ts'),
    `import { Source } from '../../domain/models';\n\nexport const SEED_SOURCES: Source[] = ${JSON.stringify(sources, null, 2)};\n`
  );
}

fs.writeFileSync(
  path.join(OUTPUT_DIR, 'destinationAssignments.ts'),
  `import { OperationalAssignment } from '../../domain/models';\n\nexport const SEED_OPERATIONAL_ASSIGNMENTS: OperationalAssignment[] = ${JSON.stringify(operationalAssignments, null, 2)};\n`
);

fs.writeFileSync(
  path.join(OUTPUT_DIR, 'snapshot.ts'),
  `import { TrackerSnapshot } from '../../domain/models';\nimport { SEED_SOURCES } from './sources';\n\nexport const INITIAL_SNAPSHOT: TrackerSnapshot = {\n  multiviews: ${JSON.stringify(multiviews, null, 2)},\n  outputs: ${JSON.stringify(outputs, null, 2)},\n  destinations: ${JSON.stringify(destinations, null, 2)},\n  sources: SEED_SOURCES,\n  operationalAssignments: ${JSON.stringify(operationalAssignments, null, 2)},\n  changeRecords: [],\n  validationFindings: ${JSON.stringify(validationFindings, null, 2)},\n  generatedAt: ${JSON.stringify(new Date().toISOString())},\n};\n`
);

console.log('Seed data generated successfully:');
console.log(`- Multiviews: ${multiviews.length}`);
console.log(
  `- Outputs: ${outputs.length} (${outputs.filter((o) => o.status === 'Assigned').length} assigned, ${outputs.filter((o) => o.status === 'Available').length} available)`
);
console.log(`- Destinations: ${destinations.length}`);
console.log(`- Unique nonblank sources: ${sources.length}`);
console.log(`- Operational assignments: ${operationalAssignments.length}`);
console.log(`- Validation findings: ${validationFindings.length}`);
