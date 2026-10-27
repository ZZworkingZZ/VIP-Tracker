import React, { useState, useEffect, useRef } from 'react';
import { Operator } from '../../domain/operator';
import {
  OPERATOR_ROSTER,
  isRosterOperatorId,
  findRosterOperatorById,
} from '../../domain/operatorRoster';

export interface OperatorModalProps {
  readonly isOpen: boolean;
  readonly currentOperator: Operator | null;
  readonly recentOperators: readonly Operator[];
  readonly onSelectOperator: (name: string) => void;
  readonly onSwitchToOperator?: (operator: Operator) => void;
  readonly onClose: () => void;
}

export const OperatorModal: React.FC<OperatorModalProps> = ({
  isOpen,
  currentOperator,
  recentOperators,
  onSelectOperator,
  onSwitchToOperator,
  onClose,
}) => {
  const [selectedId, setSelectedId] = useState('');
  const selectRef = useRef<HTMLSelectElement>(null);

  const isSwitching = Boolean(currentOperator && isRosterOperatorId(currentOperator.id));

  useEffect(() => {
    if (isOpen) {
      setSelectedId('');
      // Focus after mount
      setTimeout(() => {
        selectRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSwitching) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSwitching, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedId) return;
    const rosterOp = findRosterOperatorById(selectedId);
    if (!rosterOp) return;
    if (onSwitchToOperator) {
      onSwitchToOperator(rosterOp);
    } else {
      onSelectOperator(rosterOp.displayName);
    }
  };

  const handleRecentClick = (op: Operator) => {
    const rosterOp = findRosterOperatorById(op.id) ?? op;
    if (onSwitchToOperator) {
      onSwitchToOperator(rosterOp);
    } else {
      onSelectOperator(rosterOp.displayName);
    }
  };

  const validRecentOperators = recentOperators.filter((op) => isRosterOperatorId(op.id));

  return (
    <div
      className="output-modal-backdrop"
      onClick={isSwitching ? onClose : undefined}
      data-testid="operator-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="operator-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: '16px',
        fontFamily: 'var(--ev-font)',
      }}
    >
      <div
        className="output-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#1c1c1c',
          border: '1px solid #3b4252',
          borderRadius: '4px',
          maxWidth: '460px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            backgroundColor: '#242424',
            borderBottom: '1px solid #333333',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '16px',
                color: '#38bdf8',
              }}
              aria-hidden="true"
            >
              👤
            </span>
            <span
              id="operator-modal-title"
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              {isSwitching ? 'Switch Operator' : "Who's using VIP Tracker?"}
            </span>
          </div>

          {isSwitching && (
            <button
              type="button"
              onClick={onClose}
              data-testid="operator-modal-close-btn"
              aria-label="Close operator modal"
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '2px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#cccccc',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          <p
            style={{
              margin: '0 0 16px 0',
              fontSize: '12px',
              color: '#94a3b8',
              lineHeight: 1.5,
            }}
          >
            Identify who is operating the console so saved configuration changes and routing patches
            can be attributed accurately. (Trust-based identification)
          </p>

          <label
            htmlFor="operator-select"
            style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 700,
              color: '#e2e8f0',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}
          >
            Operator Name
          </label>

          <select
            id="operator-select"
            ref={selectRef}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            data-testid="operator-select"
            aria-label="Operator Name"
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              fontWeight: 600,
              backgroundColor: '#121212',
              color: selectedId ? '#ffffff' : '#94a3b8',
              border: '1px solid #38bdf8',
              borderRadius: '2px',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: '16px',
              cursor: 'pointer',
            }}
          >
            <option value="" disabled style={{ color: '#64748b', backgroundColor: '#1c1c1c' }}>
              Select your name…
            </option>
            {OPERATOR_ROSTER.map((op) => (
              <option
                key={op.id}
                value={op.id}
                style={{ color: '#ffffff', backgroundColor: '#1c1c1c' }}
              >
                {op.displayName}
              </option>
            ))}
          </select>

          {/* Recent Operators Quick-Select */}
          {validRecentOperators.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <span
                style={{
                  display: 'block',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  marginBottom: '6px',
                }}
              >
                Recent Operators
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {validRecentOperators.map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => handleRecentClick(op)}
                    data-testid={`recent-operator-btn-${op.id}`}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: currentOperator?.id === op.id ? '#1e3a5f' : '#262626',
                      color: currentOperator?.id === op.id ? '#38bdf8' : '#cbd5e1',
                      border:
                        currentOperator?.id === op.id ? '1px solid #2864a3' : '1px solid #404040',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    {op.displayName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '10px',
              marginTop: '8px',
            }}
          >
            {isSwitching && (
              <button
                type="button"
                onClick={onClose}
                data-testid="operator-cancel-btn"
                style={{
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: '#2a2a2a',
                  color: '#cbd5e1',
                  border: '1px solid #444444',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={!selectedId}
              data-testid="operator-submit-btn"
              style={{
                padding: '7px 20px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: selectedId ? '#2864a3' : '#1e3a5a',
                color: selectedId ? '#ffffff' : '#64748b',
                border: `1px solid ${selectedId ? '#38bdf8' : '#2864a3'}`,
                borderRadius: '2px',
                cursor: selectedId ? 'pointer' : 'not-allowed',
              }}
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
