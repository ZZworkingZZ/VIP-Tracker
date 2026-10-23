import {
  Multiview,
  MultiviewOutput,
  Destination,
  Source,
  OperationalAssignment,
  TrackerSnapshot,
} from '../domain/models';
import { VERIFIED_MULTIVIEWS } from '../domain/constants';

export const mockMultiviews: Multiview[] = [...VERIFIED_MULTIVIEWS];

export const mockOutputs: MultiviewOutput[] = [
  {
    id: 'OUT:MV-02-01',
    multiviewId: 'MV-02',
    outputNumber: 1,
    layoutName: '6 BOX',
    destinationStart: 1,
    destinationEnd: 3,
    assignmentName: 'BR ALERT 1',
    notes: null,
    status: 'Assigned',
    locked: false,
    updatedAt: null,
    updatedBy: null,
  },
  {
    id: 'OUT:MV-02-02',
    multiviewId: 'MV-02',
    outputNumber: 2,
    layoutName: '3 BOX',
    destinationStart: 4,
    destinationEnd: 6,
    assignmentName: 'BR ALERT 2',
    notes: null,
    status: 'Assigned',
    locked: false,
    updatedAt: null,
    updatedBy: null,
  },
  {
    id: 'OUT:MV-02-03',
    multiviewId: 'MV-02',
    outputNumber: 3,
    layoutName: null,
    destinationStart: null,
    destinationEnd: null,
    assignmentName: null,
    notes: null,
    status: 'Available',
    locked: false,
    updatedAt: null,
    updatedBy: null,
  },
  {
    id: 'OUT:MV-02-04',
    multiviewId: 'MV-02',
    outputNumber: 4,
    layoutName: null,
    destinationStart: null,
    destinationEnd: null,
    assignmentName: null,
    notes: null,
    status: 'Available',
    locked: false,
    updatedAt: null,
    updatedBy: null,
  },
];

export const mockDestinations: Destination[] = [
  {
    id: 'DEST:MV-02-01',
    multiviewId: 'MV-02',
    destinationNumber: 1,
    assignedSourceId: 'SRC:CAM_1',
    assignmentName: null,
    locked: false,
    updatedAt: null,
    updatedBy: null,
  },
  {
    id: 'DEST:MV-02-02',
    multiviewId: 'MV-02',
    destinationNumber: 2,
    assignedSourceId: null,
    assignmentName: null,
    locked: false,
    updatedAt: null,
    updatedBy: null,
  },
  {
    id: 'DEST:MV-02-03',
    multiviewId: 'MV-02',
    destinationNumber: 3,
    assignedSourceId: null,
    assignmentName: null,
    locked: false,
    updatedAt: null,
    updatedBy: null,
  },
];

export const mockSources: Source[] = [
  {
    id: 'SRC:CAM_1',
    name: 'CAM 1',
    normalizedName: 'CAM 1',
    category: 'Virtual Camera',
    active: true,
    upstreamSourceId: null,
    sourceType: 'virtual',
  },
];

export const mockAssignments: OperationalAssignment[] = [
  {
    id: 'ASSIGN:BR_ALERT_1',
    rawName: 'BR ALERT 1',
    displayName: 'BR ALERT 1',
    active: true,
  },
];

export const mockSnapshot: TrackerSnapshot = {
  multiviews: mockMultiviews,
  outputs: mockOutputs,
  destinations: mockDestinations,
  sources: mockSources,
  operationalAssignments: mockAssignments,
  changeRecords: [],
  validationFindings: [],
  generatedAt: '2026-10-21T00:00:00.000Z',
};
