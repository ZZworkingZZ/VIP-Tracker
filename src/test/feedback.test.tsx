import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import {
  FEEDBACK_FORM_BASE,
  FEEDBACK_FORM_ID,
  FEEDBACK_PARAM_REPORTED_BY,
  FEEDBACK_PARAM_VIEW,
  buildFeedbackUrl,
} from '../domain/feedback';
import { AppHeader } from '../components/layout/AppHeader';
import { renderWithProviders, createOpenSpy } from './helpers/renderWithProviders';

describe('Feedback domain logic', () => {
  it('builds URL with the correct base, form id, and both param keys', () => {
    const rawUrl = buildFeedbackUrl('Jane Doe', 'Dashboard');

    expect(rawUrl.startsWith(`${FEEDBACK_FORM_BASE}?`)).toBe(true);
    expect(rawUrl).toContain(`id=${FEEDBACK_FORM_ID}`);
    expect(rawUrl).toContain(`${FEEDBACK_PARAM_REPORTED_BY}=`);
    expect(rawUrl).toContain(`${FEEDBACK_PARAM_VIEW}=`);
  });

  it('substitutes and encodes operator name and view including spaces and special characters as %20 and %26', () => {
    const operatorName = 'Maddie P';
    const view = 'Layout Assignments & BR Alert';
    const rawUrl = buildFeedbackUrl(operatorName, view);

    expect(rawUrl).toContain(`${FEEDBACK_PARAM_REPORTED_BY}=Maddie%20P`);
    expect(rawUrl).not.toContain('Maddie+P');

    expect(rawUrl).toContain('Layout%20Assignments');
    expect(rawUrl).not.toContain('Layout+Assignments');

    expect(rawUrl).toContain('%26');
  });

  it('produces an empty Reported By value when operator is null', () => {
    const rawUrl = buildFeedbackUrl(null, 'Dashboard');

    expect(rawUrl).toContain(`${FEEDBACK_PARAM_REPORTED_BY}=&`);
  });
});

describe('Feedback UI integration', () => {
  it('renders Feedback button in header and calls window.open with the built URL, "_blank", "noopener"', () => {
    const openSpy = createOpenSpy();

    renderWithProviders(<AppHeader />, {
      route: '/layouts',
      operator: 'op_alex_s',
    });

    const feedbackBtn = screen.getByTestId('feedback-btn');
    expect(feedbackBtn).toBeInTheDocument();
    expect(feedbackBtn).toHaveTextContent('Feedback');

    fireEvent.click(feedbackBtn);

    const expectedUrl = buildFeedbackUrl('Alex S', 'Layout Assignments');
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(expectedUrl, '_blank', 'noopener');
    openSpy.mockRestore();
  });

  it('handles null operator gracefully on click in header', () => {
    const openSpy = createOpenSpy();

    renderWithProviders(<AppHeader />, {
      route: '/',
      operator: null,
    });

    const feedbackBtn = screen.getByTestId('feedback-btn');
    fireEvent.click(feedbackBtn);

    const expectedUrl = buildFeedbackUrl(null, 'Dashboard');
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(expectedUrl, '_blank', 'noopener');
    openSpy.mockRestore();
  });
});
