import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { createOperator, isValidOperator } from '../domain/operator';
import {
  OPERATOR_ROSTER,
  createRosterOperatorId,
  isRosterOperatorId,
} from '../domain/operatorRoster';
import { selectOutputLastChanged, formatLastChanged } from '../domain/attribution';
import { MemoryOperatorStorage } from '../services/operatorStorage';
import { MemoryTrackerStorage } from '../services/storage';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { OutputDetailModal } from '../components/multiview/OutputDetailModal';
import { AppHeader } from '../components/layout/AppHeader';
import { OperatorModal } from '../components/layout/OperatorModal';
import { ReviewChangesModal } from '../components/multiview/ReviewChangesModal';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { renderWithProviders } from './helpers/renderWithProviders';

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
    it('Requirement 1 & 2: OPERATOR_ROSTER contains all roster names in exact order with deterministic stable IDs', () => {
      expect(OPERATOR_ROSTER.length).toBe(26);

      const expectedNames = [
        'Alex S',
        'Barry A',
        'Bob S',
        'Chris P',
        'Faith L',
        'Greg P',
        'J J',
        'James A',
        'John V',
        'Jorge M',
        'Julia B',
        'Khirlu B',
        'Maddie P',
        'Marcus L',
        'Mark S',
        'Mark V',
        'Matt O',
        'Mike D',
        'Nathan C',
        'Prab G',
        'Rob G',
        'Robin O',
        'Ryan H',
        'Sarah R',
        'Ty Y',
        'Zach Z',
      ];

      expect(OPERATOR_ROSTER.map((o) => o.displayName)).toEqual(expectedNames);

      // Verify deterministic stable IDs
      expect(createRosterOperatorId('Zach Z')).toBe('op_zach_z');
      expect(createRosterOperatorId('J J')).toBe('op_j_j');
      expect(createRosterOperatorId('Alex S')).toBe('op_alex_s');

      for (const op of OPERATOR_ROSTER) {
        expect(op.id).toBe(createRosterOperatorId(op.displayName));
        expect(op.id).not.toMatch(/[A-Z\s]/);
        expect(isRosterOperatorId(op.id)).toBe(true);
        expect(isValidOperator(op)).toBe(true);
      }

      // Check createOperator returns deterministic roster ID for roster member
      const zach = createOperator('Zach Z');
      expect(zach.id).toBe('op_zach_z');
      expect(zach.displayName).toBe('Zach Z');

      operatorStorage.saveOperator(zach);
      const loaded = operatorStorage.loadOperator();
      expect(loaded).toEqual(zach);
    });

    it('Requirement 3: Operator can be switched and recent list filters to roster', () => {
      const op1 = OPERATOR_ROSTER.find((o) => o.displayName === 'Zach Z')!;
      const op2 = OPERATOR_ROSTER.find((o) => o.displayName === 'Alex S')!;

      operatorStorage.saveOperator(op1);
      expect(operatorStorage.loadOperator()?.displayName).toBe('Zach Z');

      operatorStorage.saveOperator(op2);
      expect(operatorStorage.loadOperator()?.displayName).toBe('Alex S');

      // Inject a non-roster operator in recents to test filtering
      operatorStorage.saveRecentOperator({ id: 'legacy_custom_id', displayName: 'Custom Person' });

      const recents = operatorStorage.loadRecentOperators();
      expect(recents.length).toBe(2);
      expect(recents[0].displayName).toBe('Alex S');
      expect(recents[1].displayName).toBe('Zach Z');
      expect(recents.some((r) => r.displayName === 'Custom Person')).toBe(false);
    });

    it('Non-roster saved operator is cleared from storage on load', () => {
      operatorStorage.saveOperator({ id: 'legacy_unknown_id', displayName: 'Unknown Legacy' });
      const loaded = operatorStorage.loadOperator();
      expect(loaded).toBeNull();
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
        renderWithProviders(<TestComponent />, {
          repository,
          operatorStorage,
          operator: null,
        });
      });

      expect(screen.getByTestId('debug-operator').textContent).toBe('NONE');
      expect(screen.getByTestId('debug-modal-open').textContent).toBe('OPEN');
      expect(screen.getByTestId('current-operator-name').textContent).toBe('TECH OPS');
    });

    it('interactive operator modal: roster dropdown lists all roster names in order, Continue is disabled until selection, and sets deterministic ID', async () => {
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
        renderWithProviders(<TestApp />, {
          repository,
          operatorStorage,
          operator: null,
        });
      });

      // Initially no operator selected
      expect(screen.getByTestId('current-operator-name').textContent).toBe('TECH OPS');
      expect(screen.getByTestId('operator-modal')).toBeDefined();

      const select = screen.getByTestId('operator-select') as HTMLSelectElement;
      expect(select).toBeDefined();

      // Check dropdown options: 1 placeholder + roster names
      const options = Array.from(select.options);
      expect(options.length).toBe(OPERATOR_ROSTER.length + 1);

      // Placeholder option
      expect(options[0].textContent).toBe('Select your name…');
      expect(options[0].value).toBe('');
      expect(options[0].disabled).toBe(true);

      // All 25 names in exact roster order
      for (let i = 0; i < OPERATOR_ROSTER.length; i++) {
        expect(options[i + 1].textContent).toBe(OPERATOR_ROSTER[i].displayName);
        expect(options[i + 1].value).toBe(OPERATOR_ROSTER[i].id);
      }

      // Continue button must be disabled initially
      const submitBtn = screen.getByTestId('operator-submit-btn');
      expect(submitBtn).toBeDisabled();

      // Select "Zach Z" (op_zach_z)
      act(() => {
        fireEvent.change(select, { target: { value: 'op_zach_z' } });
      });

      // Continue button is now enabled
      expect(submitBtn).not.toBeDisabled();

      // Click Continue
      act(() => {
        fireEvent.click(submitBtn);
      });

      // Header now displays "Zach Z"
      expect(screen.getByTestId('current-operator-name').textContent).toBe('Zach Z');

      // Operator persisted in storage with deterministic ID
      const savedOp = operatorStorage.loadOperator();
      expect(savedOp?.displayName).toBe('Zach Z');
      expect(savedOp?.id).toBe('op_zach_z');

      // Open Switch User modal
      act(() => {
        fireEvent.click(screen.getByTestId('switch-user-btn'));
      });

      expect(screen.getByTestId('operator-modal')).toBeDefined();

      const switchSelect = screen.getByTestId('operator-select') as HTMLSelectElement;
      const switchSubmitBtn = screen.getByTestId('operator-submit-btn');

      // When switching opens, Continue is disabled until a name is selected
      expect(switchSubmitBtn).toBeDisabled();

      // Select "Alex S" (op_alex_s) and submit
      act(() => {
        fireEvent.change(switchSelect, { target: { value: 'op_alex_s' } });
      });
      expect(switchSubmitBtn).not.toBeDisabled();

      act(() => {
        fireEvent.click(switchSubmitBtn);
      });

      expect(screen.getByTestId('current-operator-name').textContent).toBe('Alex S');
      expect(operatorStorage.loadOperator()?.displayName).toBe('Alex S');
      expect(operatorStorage.loadOperator()?.id).toBe('op_alex_s');
    });

    it('non-roster saved operator is cleared on load and prompts modal (first-use behavior)', async () => {
      // Simulate existing localStorage state with legacy / non-roster operator
      operatorStorage.saveOperator({ id: 'legacy_old_id', displayName: 'Legacy Operator' });

      const TestApp = () => {
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
        renderWithProviders(<TestApp />, {
          repository,
          operatorStorage,
          operator: undefined,
        });
      });

      // Non-roster operator was cleared
      expect(operatorStorage.loadOperator()).toBeNull();
      expect(screen.getByTestId('debug-operator').textContent).toBe('NONE');
      // Modal opened on first-use
      expect(screen.getByTestId('debug-modal-open').textContent).toBe('OPEN');
      expect(screen.getByTestId('current-operator-name').textContent).toBe('TECH OPS');
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
        renderWithProviders(
          <OutputDetailModal output={savedSnapshot.outputs[0]} onClose={() => {}} />,
          {
            repository,
            operatorStorage,
            operator: undefined,
          }
        );
      });

      const lastChangedEl = screen.getByTestId('output-last-changed');
      expect(lastChangedEl.textContent).toContain('Zach');
    });

    it('displays operator in ReviewChangesModal footer before saving', async () => {
      const zach = createOperator('Zach Z');
      operatorStorage.saveOperator(zach);

      await act(async () => {
        renderWithProviders(
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
          />,
          {
            repository,
            operatorStorage,
            operator: undefined,
          }
        );
      });

      const indicator = screen.getByTestId('review-attribution-indicator');
      expect(indicator.textContent).toContain('Zach Z');
    });
  });
});
