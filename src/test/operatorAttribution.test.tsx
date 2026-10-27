import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createOperator, isValidOperator } from '../domain/operator';
import { selectOutputLastChanged, formatLastChanged } from '../domain/attribution';
import { MemoryOperatorStorage } from '../services/operatorStorage';
import { MemoryTrackerStorage } from '../services/storage';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { TrackerRepositoryProvider } from '../app/TrackerRepositoryContext';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { OutputDetailModal } from '../components/multiview/OutputDetailModal';
import { AppHeader } from '../components/layout/AppHeader';
import { OperatorModal } from '../components/layout/OperatorModal';
import { ReviewChangesModal } from '../components/multiview/ReviewChangesModal';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { BrowserRouter } from 'react-router-dom';

describe('Trust-based Operator Identity & Change Attribution', () => {
  let memoryStorage: MemoryTrackerStorage;
  let operatorStorage: MemoryOperatorStorage;
  let repository: LocalTrackerRepository;

  beforeEach(() => {
    memoryStorage = new MemoryTrackerStorage();
    operatorStorage = new MemoryOperatorStorage();
    repository = new LocalTrackerRepository(INITIAL_SNAPSHOT, memoryStorage);
  });

  describe('1. Operator Domain Model & Storage', () => {
    it('Requirement 1 & 2: An operator can be created with a stable ID and persists locally', () => {
      const op = createOperator('Zach');
      expect(op.displayName).toBe('Zach');
      expect(op.id).toMatch(/^op_zach_[a-z0-9]+$/);
      expect(isValidOperator(op)).toBe(true);

      operatorStorage.saveOperator(op);
      const loaded = operatorStorage.loadOperator();
      expect(loaded).toEqual(op);
    });

    it('Requirement 3: Operator can be switched and tracks recent operators', () => {
      const op1 = createOperator('Zach', 'op_zach_fixed');
      const op2 = createOperator('Alex', 'op_alex_fixed');

      operatorStorage.saveOperator(op1);
      expect(operatorStorage.loadOperator()?.displayName).toBe('Zach');

      operatorStorage.saveOperator(op2);
      expect(operatorStorage.loadOperator()?.displayName).toBe('Alex');

      const recents = operatorStorage.loadRecentOperators();
      expect(recents.length).toBe(2);
      expect(recents[0].displayName).toBe('Alex');
      expect(recents[1].displayName).toBe('Zach');
    });
  });

  describe('2. Save, Draft & Discard Semantics', () => {
    it('Requirement 4: Draft changes do not alter persisted Last Changed metadata', async () => {
      const snapshot = await repository.getSnapshot();
      const output = snapshot.outputs.find((o) => o.id === 'OUT:MV-01-01')!;

      expect(output.updatedAt).toBeNull();
      expect(output.updatedBy).toBeNull();
      expect(selectOutputLastChanged(output)).toBeNull();

      // Modify output in a draft clone
      const draft = JSON.parse(JSON.stringify(snapshot));
      draft.outputs[0].layoutName = '12 BOX';

      // Persisted repository state must remain untouched
      const currentPersisted = await repository.getSnapshot();
      expect(currentPersisted.outputs[0].layoutName).toBe(output.layoutName);
      expect(currentPersisted.outputs[0].updatedAt).toBeNull();
      expect(currentPersisted.outputs[0].updatedBy).toBeNull();
      expect(selectOutputLastChanged(currentPersisted.outputs[0])).toBeNull();
    });

    it('Requirement 5: Discarded changes do not alter Last Changed metadata or create history', async () => {
      const snapshot = await repository.getSnapshot();
      const initialHistory = await repository.getChangeHistory();

      // Draft modification
      const draft = JSON.parse(JSON.stringify(snapshot));
      draft.outputs[0].layoutName = '12 BOX';

      // Discard simulation (repository.saveSnapshot is never invoked)
      const afterDiscardSnapshot = await repository.getSnapshot();
      const afterDiscardHistory = await repository.getChangeHistory();

      expect(afterDiscardSnapshot.outputs[0].updatedAt).toBeNull();
      expect(afterDiscardHistory.length).toBe(initialHistory.length);
      expect(selectOutputLastChanged(afterDiscardSnapshot.outputs[0])).toBeNull();
    });

    it('Requirement 6, 7 & 8: Successful save records active operator, timestamp, and updates MV Output Last Changed', async () => {
      const zach = createOperator('Zach', 'op_zach');
      const snapshot = await repository.getSnapshot();

      const draft = JSON.parse(JSON.stringify(snapshot));
      draft.outputs[0].layoutName = '12 BOX';

      const changeSet = {
        id: 'cs_test_1',
        timestamp: '2026-10-27T18:01:00.000Z',
        summary: '1 change',
        changes: [
          {
            entityType: 'output' as const,
            entityId: 'OUT:MV-01-01',
            entityLabel: 'MV-01-01 Output',
            field: 'layoutName',
            previousValue: snapshot.outputs[0].layoutName,
            newValue: '12 BOX',
            description: 'Layout: 4 BOX -> 12 BOX',
          },
        ],
      };

      const savedSnapshot = await repository.saveSnapshot(draft, changeSet, zach);
      const savedOutput = savedSnapshot.outputs.find((o) => o.id === 'OUT:MV-01-01')!;

      // Output entity has attribution
      expect(savedOutput.updatedBy).toBe('Zach');
      expect(savedOutput.operatorId).toBe('op_zach');
      expect(savedOutput.updatedAt).toBe('2026-10-27T18:01:00.000Z');

      // ChangeRecord has structured operator info
      const history = await repository.getChangeHistory();
      const lastRecord = history[history.length - 1];
      expect(lastRecord.entityId).toBe('OUT:MV-01-01');
      expect(lastRecord.field).toBe('layoutName');
      expect(lastRecord.changedBy).toBe('Zach');
      expect(lastRecord.operatorId).toBe('op_zach');
      expect(lastRecord.operatorName).toBe('Zach');
      expect(lastRecord.changedAt).toBe('2026-10-27T18:01:00.000Z');

      // Domain selector retrieves structured attribution
      const attribution = selectOutputLastChanged(savedOutput, history);
      expect(attribution).toEqual({
        operatorId: 'op_zach',
        operatorName: 'Zach',
        timestamp: '2026-10-27T18:01:00.000Z',
      });

      // Presentation formatting
      const fixedNow = new Date('2026-10-27T20:00:00.000Z');
      const formatted = formatLastChanged(attribution, { now: fixedNow });
      expect(formatted).toContain('Zach');
    });

    it('Requirement 9: Attribution survives application reload from persistent storage', async () => {
      const zach = createOperator('Zach', 'op_zach_123');
      const snapshot = await repository.getSnapshot();

      const draft = JSON.parse(JSON.stringify(snapshot));
      draft.outputs[0].layoutName = '8 BOX';

      const changeSet = {
        id: 'cs_test_reload',
        timestamp: '2026-10-27T19:15:00.000Z',
        summary: '1 change',
        changes: [
          {
            entityType: 'output' as const,
            entityId: 'OUT:MV-01-01',
            entityLabel: 'MV-01-01 Output',
            field: 'layoutName',
            previousValue: snapshot.outputs[0].layoutName,
            newValue: '8 BOX',
            description: 'Layout changed',
          },
        ],
      };

      await repository.saveSnapshot(draft, changeSet, zach);

      // Simulate application reload by constructing a fresh repository from the same storage
      const reloadedRepo = new LocalTrackerRepository(INITIAL_SNAPSHOT, memoryStorage);
      const reloadedSnapshot = await reloadedRepo.getSnapshot();
      const reloadedOutput = reloadedSnapshot.outputs.find((o) => o.id === 'OUT:MV-01-01')!;

      expect(reloadedOutput.updatedBy).toBe('Zach');
      expect(reloadedOutput.operatorId).toBe('op_zach_123');
      expect(reloadedOutput.updatedAt).toBe('2026-10-27T19:15:00.000Z');

      const reloadedHistory = await reloadedRepo.getChangeHistory();
      const attr = selectOutputLastChanged(reloadedOutput, reloadedHistory);
      expect(attr?.operatorName).toBe('Zach');
      expect(attr?.timestamp).toBe('2026-10-27T19:15:00.000Z');
    });
  });

  describe('3. Legacy Data & Zero Fabrication', () => {
    it('Requirement 10 & 11: Existing legacy data without attribution loads cleanly and does not receive fabricated attribution', async () => {
      // Seed legacy storage payload without operator/attribution metadata
      const legacyPayload = {
        schemaVersion: 2,
        outputs: INITIAL_SNAPSHOT.outputs.map((o) => ({
          ...o,
          updatedAt: null,
          updatedBy: null,
          operatorId: null,
        })),
        destinations: INITIAL_SNAPSHOT.destinations.map((d) => ({
          ...d,
          updatedAt: null,
          updatedBy: null,
        })),
        sources: INITIAL_SNAPSHOT.sources,
        operationalAssignments: INITIAL_SNAPSHOT.operationalAssignments,
        changeRecords: [],
        savedAt: '2025-01-01T00:00:00.000Z',
      };

      const legacyStorage = new MemoryTrackerStorage();
      legacyStorage.seedRaw(legacyPayload);

      const legacyRepo = new LocalTrackerRepository(INITIAL_SNAPSHOT, legacyStorage);
      const loadedSnapshot = await legacyRepo.getSnapshot();

      expect(loadedSnapshot.outputs.length).toBe(32);
      for (const out of loadedSnapshot.outputs) {
        expect(out.updatedAt).toBeNull();
        expect(out.updatedBy).toBeNull();
        expect(selectOutputLastChanged(out)).toBeNull();
        expect(formatLastChanged(selectOutputLastChanged(out))).toBe('Not recorded');
        expect(formatLastChanged(selectOutputLastChanged(out), { includePrefix: true })).toBe(
          'Last Changed: Not recorded'
        );
      }
    });
  });

  describe('4. Multi-Entity Save & PIP Routing', () => {
    it('Requirement 12: Multiple changed entities receive the appropriate save attribution while untouched entities remain unchanged', async () => {
      const alex = createOperator('Alex', 'op_alex_456');
      const snapshot = await repository.getSnapshot();

      const draft = JSON.parse(JSON.stringify(snapshot));
      draft.outputs[0].layoutName = '6 BOX';
      draft.outputs[1].assignmentName = 'STUDIO A';
      draft.destinations[0].assignedSourceId = 'SRC:CAM_1';

      const changeSet = {
        id: 'cs_multi',
        timestamp: '2026-10-27T20:30:00.000Z',
        summary: '3 changes',
        changes: [
          {
            entityType: 'output' as const,
            entityId: 'OUT:MV-01-01',
            entityLabel: 'MV-01-01 Output',
            field: 'layoutName',
            previousValue: '4 BOX',
            newValue: '6 BOX',
            description: 'Layout changed',
          },
          {
            entityType: 'output' as const,
            entityId: 'OUT:MV-01-02',
            entityLabel: 'MV-01-02 Output',
            field: 'assignmentName',
            previousValue: null,
            newValue: 'STUDIO A',
            description: 'Assignment changed',
          },
          {
            entityType: 'destination' as const,
            entityId: 'DEST:MV-01-01',
            entityLabel: 'MV-01 Dest 01',
            field: 'assignedSourceId',
            previousValue: null,
            newValue: 'SRC:CAM_1',
            description: 'Source routed',
          },
        ],
      };

      const saved = await repository.saveSnapshot(draft, changeSet, alex);

      // Affected entities updated
      expect(saved.outputs[0].updatedBy).toBe('Alex');
      expect(saved.outputs[0].operatorId).toBe('op_alex_456');
      expect(saved.outputs[0].updatedAt).toBe('2026-10-27T20:30:00.000Z');

      expect(saved.outputs[1].updatedBy).toBe('Alex');
      expect(saved.outputs[1].updatedAt).toBe('2026-10-27T20:30:00.000Z');

      expect(saved.destinations[0].updatedBy).toBe('Alex');
      expect(saved.destinations[0].updatedAt).toBe('2026-10-27T20:30:00.000Z');

      // Untouched entities remain untouched
      expect(saved.outputs[2].updatedBy).toBeNull();
      expect(saved.outputs[2].updatedAt).toBeNull();
      expect(saved.destinations[1].updatedBy).toBeNull();
      expect(saved.destinations[1].updatedAt).toBeNull();
    });

    it('Requirement 13: Existing PIP assignment, save, and discard behavior remains intact with attribution', async () => {
      const operator = createOperator('Zach', 'op_zach');
      const snapshot = await repository.getSnapshot();

      const draft = JSON.parse(JSON.stringify(snapshot));
      // Assign PIP-01 on OUT:MV-01-01 to DEST:MV-01-10
      draft.outputs[0].pipAssignments = {
        ...draft.outputs[0].pipAssignments,
        'PIP-01': 'DEST:MV-01-10',
      };

      const changeSet = {
        id: 'cs_pip',
        timestamp: '2026-10-27T21:00:00.000Z',
        summary: '1 change',
        changes: [
          {
            entityType: 'output' as const,
            entityId: 'OUT:MV-01-01',
            entityLabel: 'MV-01-01 Output',
            field: 'pipAssignment:PIP-01',
            previousValue: 'Unassigned',
            newValue: 'MV-01-10 Input',
            description: 'PIP-01 routed',
          },
        ],
      };

      const saved = await repository.saveSnapshot(draft, changeSet, operator);
      expect(saved.outputs[0].pipAssignments?.['PIP-01']).toBe('DEST:MV-01-10');
      expect(saved.outputs[0].updatedBy).toBe('Zach');
      expect(saved.outputs[0].updatedAt).toBe('2026-10-27T21:00:00.000Z');
    });
  });

  describe('5. Interactive UI Integration Tests', () => {
    it('shows OperatorModal on first use when no operator is selected, and allows entering a name', async () => {
      const TestComponent = () => {
        const { currentOperator, isOperatorModalOpen } = useTrackerSnapshot();
        return (
          <div>
            <AppHeader />
            <div data-testid="debug-operator">{currentOperator?.displayName || 'NONE'}</div>
            <div data-testid="debug-modal-open">{isOperatorModalOpen ? 'OPEN' : 'CLOSED'}</div>
          </div>
        );
      };

      await act(async () => {
        render(
          <BrowserRouter>
            <TrackerRepositoryProvider repository={repository} operatorStorage={operatorStorage}>
              <TestComponent />
            </TrackerRepositoryProvider>
          </BrowserRouter>
        );
      });

      expect(screen.getByTestId('debug-operator').textContent).toBe('NONE');
      expect(screen.getByTestId('debug-modal-open').textContent).toBe('OPEN');
      expect(screen.getByTestId('current-operator-name').textContent).toBe('TECH OPS');
    });

    it('interactive operator modal: entering a name sets operator, persists to storage, and updates header', async () => {
      const TestApp = () => {
        const {
          currentOperator,
          recentOperators,
          setOperatorByName,
          setOperator,
          isOperatorModalOpen,
          closeOperatorModal,
        } = useTrackerSnapshot();
        return (
          <div>
            <AppHeader />
            <OperatorModal
              isOpen={isOperatorModalOpen}
              currentOperator={currentOperator}
              recentOperators={recentOperators}
              onSelectOperator={setOperatorByName}
              onSwitchToOperator={setOperator}
              onClose={closeOperatorModal}
            />
          </div>
        );
      };

      await act(async () => {
        render(
          <BrowserRouter>
            <TrackerRepositoryProvider repository={repository} operatorStorage={operatorStorage}>
              <TestApp />
            </TrackerRepositoryProvider>
          </BrowserRouter>
        );
      });

      // Initially no operator
      expect(screen.getByTestId('current-operator-name').textContent).toBe('TECH OPS');
      expect(screen.getByTestId('operator-modal')).toBeDefined();

      // Enter "Zach" and submit
      const input = screen.getByTestId('operator-name-input');
      act(() => {
        fireEvent.change(input, { target: { value: 'Zach' } });
      });

      act(() => {
        fireEvent.click(screen.getByTestId('operator-submit-btn'));
      });

      // Header now displays Zach
      expect(screen.getByTestId('current-operator-name').textContent).toBe('Zach');

      // Operator persisted in storage
      expect(operatorStorage.loadOperator()?.displayName).toBe('Zach');

      // Open Switch User modal
      act(() => {
        fireEvent.click(screen.getByTestId('switch-user-btn'));
      });

      expect(screen.getByTestId('operator-modal')).toBeDefined();

      // Enter "Alex" and submit
      const switchInput = screen.getByTestId('operator-name-input');
      act(() => {
        fireEvent.change(switchInput, { target: { value: 'Alex' } });
      });

      act(() => {
        fireEvent.click(screen.getByTestId('operator-submit-btn'));
      });

      expect(screen.getByTestId('current-operator-name').textContent).toBe('Alex');
      expect(operatorStorage.loadOperator()?.displayName).toBe('Alex');
    });

    it('displays Last Changed attribution in OutputDetailModal', async () => {
      const zach = createOperator('Zach', 'op_zach');
      const snapshot = await repository.getSnapshot();

      const draft = JSON.parse(JSON.stringify(snapshot));
      draft.outputs[0].layoutName = '12 BOX';

      const changeSet = {
        id: 'cs_detail',
        timestamp: '2026-10-27T18:01:00.000Z',
        summary: '1 change',
        changes: [
          {
            entityType: 'output' as const,
            entityId: 'OUT:MV-01-01',
            entityLabel: 'MV-01-01 Output',
            field: 'layoutName',
            previousValue: '4 BOX',
            newValue: '12 BOX',
            description: 'Layout changed',
          },
        ],
      };

      const savedSnapshot = await repository.saveSnapshot(draft, changeSet, zach);

      await act(async () => {
        render(
          <BrowserRouter>
            <TrackerRepositoryProvider repository={repository} operatorStorage={operatorStorage}>
              <OutputDetailModal output={savedSnapshot.outputs[0]} onClose={() => {}} />
            </TrackerRepositoryProvider>
          </BrowserRouter>
        );
      });

      const lastChangedEl = screen.getByTestId('output-last-changed');
      expect(lastChangedEl.textContent).toContain('Zach');
    });

    it('displays operator in ReviewChangesModal footer before saving', async () => {
      const zach = createOperator('Zach', 'op_zach');
      operatorStorage.saveOperator(zach);

      await act(async () => {
        render(
          <BrowserRouter>
            <TrackerRepositoryProvider repository={repository} operatorStorage={operatorStorage}>
              <ReviewChangesModal
                isOpen={true}
                changes={[
                  {
                    entityType: 'output',
                    entityId: 'OUT:MV-01-01',
                    entityLabel: 'MV-01-01 Output',
                    field: 'layoutName',
                    previousValue: '4 BOX',
                    newValue: '12 BOX',
                    description: 'Layout: 4 BOX -> 12 BOX',
                  },
                ]}
                onClose={() => {}}
                onSave={() => {}}
              />
            </TrackerRepositoryProvider>
          </BrowserRouter>
        );
      });

      const indicator = screen.getByTestId('review-attribution-indicator');
      expect(indicator.textContent).toContain('Zach');
    });
  });
});
