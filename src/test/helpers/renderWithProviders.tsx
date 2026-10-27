import React from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';
import { vi, MockInstance } from 'vitest';
import { TrackerRepositoryProvider } from '../../app/TrackerRepositoryContext';
import { LocalTrackerRepository } from '../../services/LocalTrackerRepository';
import { TrackerRepository } from '../../services/TrackerRepository';
import { MemoryOperatorStorage } from '../../services/operatorStorage';
import { INITIAL_SNAPSHOT } from '../../data/seed/snapshot';
import { OPERATOR_ROSTER } from '../../domain/operatorRoster';

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  readonly route?: string;
  readonly initialEntries?: MemoryRouterProps['initialEntries'];
  readonly repository?: TrackerRepository;
  readonly operatorStorage?: MemoryOperatorStorage;
  /**
   * Roster operator ID (e.g. "op_zach_z", "op_alex_s") or null for unauthenticated state.
   * Defaults to "op_zach_z".
   */
  readonly operator?: string | null;
}

export interface RenderWithProvidersResult extends RenderResult {
  readonly repository: TrackerRepository;
  readonly operatorStorage: MemoryOperatorStorage;
}

/**
 * Creates and returns a typed Vitest spy on window.open.
 */
export function createOpenSpy(): MockInstance {
  return vi.spyOn(window, 'open').mockImplementation(() => null);
}

/**
 * Wraps ui in TrackerRepositoryProvider and MemoryRouter using MemoryOperatorStorage
 * and default LocalTrackerRepository with INITIAL_SNAPSHOT.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options: RenderWithProvidersOptions = {}
): RenderWithProvidersResult {
  const {
    route = '/',
    initialEntries,
    repository = new LocalTrackerRepository(INITIAL_SNAPSHOT),
    operatorStorage = new MemoryOperatorStorage(),
    operator = options.operatorStorage ? undefined : 'op_zach_z',
    ...renderOptions
  } = options;

  if (operator !== undefined) {
    if (operator === null) {
      operatorStorage.clearOperator();
    } else {
      const rosterMatch = OPERATOR_ROSTER.find((op) => op.id === operator);
      if (rosterMatch) {
        operatorStorage.saveOperator({
          id: rosterMatch.id,
          displayName: rosterMatch.displayName,
        });
      } else {
        operatorStorage.saveOperator({
          id: operator,
          displayName: operator,
        });
      }
    }
  }

  const entries = initialEntries ?? [route];

  const result = render(
    <TrackerRepositoryProvider repository={repository} operatorStorage={operatorStorage}>
      <MemoryRouter initialEntries={entries}>{ui}</MemoryRouter>
    </TrackerRepositoryProvider>,
    renderOptions
  );

  return {
    ...result,
    repository,
    operatorStorage,
  };
}
