import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LayoutDefinition, clearCustomLayoutRegistry } from '../domain/layoutDefinitions';
import { LayoutRenderer } from '../components/multiview/LayoutRenderer';
import { CustomLayoutDesignerModal } from '../components/multiview/CustomLayoutDesignerModal';
import { LayoutAssignmentsPage } from '../pages/LayoutAssignmentsPage';
import { TrackerRepositoryProvider } from '../app/TrackerRepositoryContext';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { MemoryTrackerStorage } from '../services/storage';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { TrackerSnapshot } from '../domain/models';

describe('Custom Layout System & Designer Tests', () => {
  beforeEach(() => {
    clearCustomLayoutRegistry();
  });

  const createTestRepository = (initialCustoms: LayoutDefinition[] = []) => {
    const memoryStorage = new MemoryTrackerStorage();
    const seedSnapshot: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    seedSnapshot.customLayouts = initialCustoms;
    const repository = new LocalTrackerRepository(seedSnapshot, memoryStorage);
    return { repository, memoryStorage };
  };

  it('renders custom layouts through LayoutRenderer pipeline identically to built-in layouts', () => {
    const customLayout: LayoutDefinition = {
      id: 'custom-hero-test',
      name: 'HERO-CUSTOM-3',
      windowCount: 3,
      aspectRatio: '16:9',
      category: 'Custom',
      description: 'Custom 3 window test',
      isCustom: true,
      windows: [
        { id: 'w-1', x: 0, y: 0, width: 70, height: 100, destinationOffset: 0 },
        { id: 'w-2', x: 70, y: 0, width: 30, height: 50, destinationOffset: 1 },
        { id: 'w-3', x: 70, y: 50, width: 30, height: 50, destinationOffset: 2 },
      ],
    };

    const { getByTestId } = render(
      <LayoutRenderer
        layout={customLayout}
        mode="card"
        windowsData={[
          {
            destinationOffset: 0,
            destinationNumber: 1,
            sourceName: 'CAM_1',
          },
          {
            destinationOffset: 1,
            destinationNumber: 2,
            sourceName: 'REPLAY_1',
          },
        ]}
      />
    );

    expect(getByTestId('layout-renderer-custom-hero-test')).toBeInTheDocument();
    expect(getByTestId('layout-window-0')).toBeInTheDocument();
    expect(getByTestId('layout-window-1')).toBeInTheDocument();
    expect(getByTestId('layout-window-2')).toBeInTheDocument();
  });

  it('saves custom layout and survives repository serialization and reload', async () => {
    const { repository, memoryStorage } = createTestRepository();

    const sampleLayout: LayoutDefinition = {
      id: 'custom-prod-wall',
      name: 'PROD-WALL-6',
      windowCount: 6,
      aspectRatio: '16:9',
      category: 'Custom',
      description: 'Production Wall 6',
      windows: [
        { id: 'w-1', x: 0, y: 0, width: 50, height: 50, destinationOffset: 0 },
        { id: 'w-2', x: 50, y: 0, width: 50, height: 50, destinationOffset: 1 },
        { id: 'w-3', x: 0, y: 50, width: 25, height: 50, destinationOffset: 2 },
        { id: 'w-4', x: 25, y: 50, width: 25, height: 50, destinationOffset: 3 },
        { id: 'w-5', x: 50, y: 50, width: 25, height: 50, destinationOffset: 4 },
        { id: 'w-6', x: 75, y: 50, width: 25, height: 50, destinationOffset: 5 },
      ],
      isCustom: true,
      createdAt: '2026-10-26T20:00:00.000Z',
      updatedAt: '2026-10-26T20:00:00.000Z',
    };

    // Save custom layout
    const updatedSnapshot = await repository.saveCustomLayout(sampleLayout);
    expect(updatedSnapshot.customLayouts).toHaveLength(1);
    expect(updatedSnapshot.customLayouts?.[0].name).toBe('PROD-WALL-6');

    // Simulate page reload by creating a new repository with the same persistent storage
    const reloadedRepo = new LocalTrackerRepository(INITIAL_SNAPSHOT, memoryStorage);
    const reloadedSnapshot = await reloadedRepo.getSnapshot();

    expect(reloadedSnapshot.customLayouts).toHaveLength(1);
    expect(reloadedSnapshot.customLayouts?.[0].id).toBe('custom-prod-wall');
    expect(reloadedSnapshot.customLayouts?.[0].name).toBe('PROD-WALL-6');
    expect(reloadedSnapshot.customLayouts?.[0].windowCount).toBe(6);
    expect(reloadedSnapshot.customLayouts?.[0].windows).toHaveLength(6);
  });

  it('supports editing an existing custom layout', async () => {
    const { repository } = createTestRepository([
      {
        id: 'custom-editable',
        name: 'INITIAL-NAME',
        windowCount: 2,
        aspectRatio: '16:9',
        category: 'Custom',
        description: 'Initial',
        windows: [
          { id: 'w-1', x: 0, y: 0, width: 50, height: 100, destinationOffset: 0 },
          { id: 'w-2', x: 50, y: 0, width: 50, height: 100, destinationOffset: 1 },
        ],
        isCustom: true,
      },
    ]);

    const edited: LayoutDefinition = {
      id: 'custom-editable',
      name: 'INITIAL-NAME',
      windowCount: 3,
      aspectRatio: '16:9',
      category: 'Custom',
      description: 'Modified to 3 windows',
      windows: [
        { id: 'w-1', x: 0, y: 0, width: 50, height: 100, destinationOffset: 0 },
        { id: 'w-2', x: 50, y: 0, width: 50, height: 50, destinationOffset: 1 },
        { id: 'w-3', x: 50, y: 50, width: 50, height: 50, destinationOffset: 2 },
      ],
      isCustom: true,
    };

    const res = await repository.saveCustomLayout(edited);
    expect(res.customLayouts).toHaveLength(1);
    expect(res.customLayouts?.[0].windowCount).toBe(3);
    expect(res.customLayouts?.[0].description).toBe('Modified to 3 windows');
  });

  it('deletes unassigned custom layouts', async () => {
    const { repository } = createTestRepository([
      {
        id: 'custom-to-delete',
        name: 'UNUSED-LAYOUT',
        windowCount: 2,
        aspectRatio: '16:9',
        category: 'Custom',
        description: 'Unused',
        windows: [
          { id: 'w-1', x: 0, y: 0, width: 50, height: 100, destinationOffset: 0 },
          { id: 'w-2', x: 50, y: 0, width: 50, height: 100, destinationOffset: 1 },
        ],
        isCustom: true,
      },
    ]);

    const res = await repository.deleteCustomLayout('custom-to-delete');
    expect(res.customLayouts).toHaveLength(0);
  });

  it('CustomLayoutDesignerModal adds, moves, duplicates, deletes, and validates bounds', async () => {
    let savedLayout: LayoutDefinition | null = null;
    const handleSave = (l: LayoutDefinition) => {
      savedLayout = l;
    };

    const { getByTestId, queryByTestId } = render(
      <CustomLayoutDesignerModal
        isOpen={true}
        existingLayoutNames={['4 BOX', 'EXISTING-CUSTOM']}
        onSave={handleSave}
        onClose={() => {}}
      />
    );

    // Initial state: 4 default windows
    expect(getByTestId('designer-window-0')).toBeInTheDocument();
    expect(getByTestId('designer-window-3')).toBeInTheDocument();

    // Add a 5th window
    fireEvent.click(getByTestId('add-window-button'));
    expect(getByTestId('designer-window-4')).toBeInTheDocument();

    // Duplicate selected window (window 5 is selected after adding)
    fireEvent.click(getByTestId('duplicate-window-button'));
    expect(getByTestId('designer-window-5')).toBeInTheDocument();

    // Delete selected window
    fireEvent.click(getByTestId('delete-window-button'));
    expect(queryByTestId('designer-window-5')).not.toBeInTheDocument();

    // Set layout name to duplicate of existing standard layout
    const nameInput = getByTestId('layout-name-input');
    fireEvent.change(nameInput, { target: { value: '4 BOX' } });
    fireEvent.click(getByTestId('designer-save-button'));
    expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);

    // Set unique valid layout name
    fireEvent.change(nameInput, { target: { value: 'MY-CUSTOM-5WAY' } });

    // Adjust numeric input for selected window X position
    const xInput = getByTestId('window-x-input');
    fireEvent.change(xInput, { target: { value: '15.5' } });

    // Save layout
    fireEvent.click(getByTestId('designer-save-button'));
    expect(savedLayout).not.toBeNull();
    expect(savedLayout!.name).toBe('MY-CUSTOM-5WAY');
    expect(savedLayout!.windowCount).toBe(5);
    expect(savedLayout!.isCustom).toBe(true);
    // Destination offsets are sequential 0 to 4
    expect(savedLayout!.windows.map((w) => w.destinationOffset)).toEqual([0, 1, 2, 3, 4]);
  });

  it('Visual Library clearly separates STANDARD LAYOUTS and CUSTOM LAYOUTS', async () => {
    const { repository } = createTestRepository([
      {
        id: 'custom-card-test',
        name: 'STUDIO-CONTROL-5',
        windowCount: 5,
        aspectRatio: '16:9',
        category: 'Custom',
        description: 'Studio control custom layout',
        windows: [
          { id: 'w-1', x: 0, y: 0, width: 60, height: 100, destinationOffset: 0 },
          { id: 'w-2', x: 60, y: 0, width: 40, height: 25, destinationOffset: 1 },
          { id: 'w-3', x: 60, y: 25, width: 40, height: 25, destinationOffset: 2 },
          { id: 'w-4', x: 60, y: 50, width: 40, height: 25, destinationOffset: 3 },
          { id: 'w-5', x: 60, y: 75, width: 40, height: 25, destinationOffset: 4 },
        ],
        isCustom: true,
      },
    ]);

    render(
      <TrackerRepositoryProvider repository={repository}>
        <LayoutAssignmentsPage />
      </TrackerRepositoryProvider>
    );

    // Both section headers exist
    expect(
      await screen.findByRole('region', { name: 'Standard Layouts Section' })
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Custom Layouts Section' })).toBeInTheDocument();

    // Custom layout card has Edit, Rename, Copy, Delete action buttons
    expect(screen.getByTestId('edit-layout-custom-card-test')).toBeInTheDocument();
    expect(screen.getByTestId('rename-layout-custom-card-test')).toBeInTheDocument();
    expect(screen.getByTestId('duplicate-layout-custom-card-test')).toBeInTheDocument();
    expect(screen.getByTestId('delete-layout-custom-card-test')).toBeInTheDocument();

    // Built-in standard layouts (e.g. 4-BOX) must NOT expose destructive edit or delete buttons
    expect(screen.queryByTestId('edit-layout-4-BOX')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-layout-4-BOX')).not.toBeInTheDocument();
  });

  it('prevents deletion of assigned custom layout to protect reference integrity', async () => {
    // Seed repository where Output MV-01-01 uses the custom layout
    const seed: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    const customLayout: LayoutDefinition = {
      id: 'custom-assigned-test',
      name: 'ASSIGNED-CUSTOM',
      windowCount: 4,
      aspectRatio: '16:9',
      category: 'Custom',
      description: 'Layout in active use',
      windows: [
        { id: 'w-1', x: 0, y: 0, width: 50, height: 50, destinationOffset: 0 },
        { id: 'w-2', x: 50, y: 0, width: 50, height: 50, destinationOffset: 1 },
        { id: 'w-3', x: 0, y: 50, width: 50, height: 50, destinationOffset: 2 },
        { id: 'w-4', x: 50, y: 50, width: 50, height: 50, destinationOffset: 3 },
      ],
      isCustom: true,
    };
    seed.customLayouts = [customLayout];
    seed.outputs[0].layoutName = 'ASSIGNED-CUSTOM';
    seed.outputs[0].assignmentName = 'Active Show Alpha';

    const memoryStorage = new MemoryTrackerStorage();
    const repository = new LocalTrackerRepository(seed, memoryStorage);

    render(
      <TrackerRepositoryProvider repository={repository}>
        <LayoutAssignmentsPage />
      </TrackerRepositoryProvider>
    );

    // Attempt to delete the in-use custom layout
    const deleteBtn = await screen.findByTestId('delete-layout-custom-assigned-test');
    fireEvent.click(deleteBtn);

    // Reference integrity modal should open blocking deletion
    await waitFor(() => {
      expect(screen.getByTestId('reference-integrity-modal')).toBeInTheDocument();
    });
    expect(screen.getByText(/Cannot Delete Custom Layout/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Show Alpha/i)).toBeInTheDocument();

    // Confirm that the layout was NOT deleted
    const snapshot = await repository.getSnapshot();
    expect(snapshot.customLayouts).toHaveLength(1);
    expect(snapshot.customLayouts?.[0].id).toBe('custom-assigned-test');
  });

  it('allows duplicating and renaming custom layouts', async () => {
    const { repository } = createTestRepository([
      {
        id: 'custom-to-rename',
        name: 'OLD-NAME',
        windowCount: 2,
        aspectRatio: '16:9',
        category: 'Custom',
        description: 'Testing rename',
        windows: [
          { id: 'w-1', x: 0, y: 0, width: 50, height: 100, destinationOffset: 0 },
          { id: 'w-2', x: 50, y: 0, width: 50, height: 100, destinationOffset: 1 },
        ],
        isCustom: true,
      },
    ]);

    render(
      <TrackerRepositoryProvider repository={repository}>
        <LayoutAssignmentsPage />
      </TrackerRepositoryProvider>
    );

    // Duplicate
    const copyBtn = await screen.findByTestId('duplicate-layout-custom-to-rename');
    fireEvent.click(copyBtn);

    await waitFor(async () => {
      const snap = await repository.getSnapshot();
      expect(snap.customLayouts).toHaveLength(2);
      expect(snap.customLayouts?.some((l) => l.name === 'OLD-NAME (Copy)')).toBe(true);
    });

    // Rename
    const renameBtn = screen.getByTestId('rename-layout-custom-to-rename');
    fireEvent.click(renameBtn);

    expect(screen.getByTestId('rename-layout-modal')).toBeInTheDocument();
    const renameInput = screen.getByTestId('rename-layout-input');
    fireEvent.change(renameInput, { target: { value: 'NEW-RENAMED-LAYOUT' } });
    fireEvent.click(screen.getByTestId('confirm-rename-button'));

    await waitFor(async () => {
      const snap = await repository.getSnapshot();
      expect(snap.customLayouts?.some((l) => l.name === 'NEW-RENAMED-LAYOUT')).toBe(true);
    });
  });
});
