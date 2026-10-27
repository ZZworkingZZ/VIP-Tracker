import { Operator, isValidOperator } from '../domain/operator';

export const CURRENT_OPERATOR_STORAGE_KEY = 'vip_tracker_operator_v1';
export const RECENT_OPERATORS_STORAGE_KEY = 'vip_tracker_recent_operators_v1';
export const MAX_RECENT_OPERATORS = 5;

export interface OperatorStorage {
  loadOperator(): Operator | null;
  saveOperator(operator: Operator): void;
  clearOperator(): void;
  loadRecentOperators(): Operator[];
  saveRecentOperator(operator: Operator): void;
}

export class BrowserOperatorStorage implements OperatorStorage {
  constructor(
    private currentKey: string = CURRENT_OPERATOR_STORAGE_KEY,
    private recentKey: string = RECENT_OPERATORS_STORAGE_KEY
  ) {}

  loadOperator(): Operator | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(this.currentKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return isValidOperator(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  saveOperator(operator: Operator): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(this.currentKey, JSON.stringify(operator));
      this.saveRecentOperator(operator);
    } catch (err) {
      console.error('Failed to save current operator to local storage:', err);
    }
  }

  clearOperator(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(this.currentKey);
    } catch (err) {
      console.error('Failed to clear operator from local storage:', err);
    }
  }

  loadRecentOperators(): Operator[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = window.localStorage.getItem(this.recentKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidOperator);
    } catch {
      return [];
    }
  }

  saveRecentOperator(operator: Operator): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const recents = this.loadRecentOperators().filter(
        (o) =>
          o.id !== operator.id && o.displayName.toLowerCase() !== operator.displayName.toLowerCase()
      );
      recents.unshift(operator);
      const trimmed = recents.slice(0, MAX_RECENT_OPERATORS);
      window.localStorage.setItem(this.recentKey, JSON.stringify(trimmed));
    } catch (err) {
      console.error('Failed to save recent operator to local storage:', err);
    }
  }
}

export class MemoryOperatorStorage implements OperatorStorage {
  private current: Operator | null = null;
  private recents: Operator[] = [];

  loadOperator(): Operator | null {
    return this.current ? { ...this.current } : null;
  }

  saveOperator(operator: Operator): void {
    this.current = { ...operator };
    this.saveRecentOperator(operator);
  }

  clearOperator(): void {
    this.current = null;
  }

  loadRecentOperators(): Operator[] {
    return [...this.recents];
  }

  saveRecentOperator(operator: Operator): void {
    this.recents = [
      operator,
      ...this.recents.filter(
        (o) =>
          o.id !== operator.id && o.displayName.toLowerCase() !== operator.displayName.toLowerCase()
      ),
    ].slice(0, MAX_RECENT_OPERATORS);
  }
}

export const defaultOperatorStorage: OperatorStorage = new BrowserOperatorStorage();
