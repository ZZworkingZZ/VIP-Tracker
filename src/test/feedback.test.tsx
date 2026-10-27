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
    const urlString = buildFeedbackUrl('Jane Doe', 'Dashboard');
    const parsed = new URL(urlString);

    expect(`${parsed.origin}${parsed.pathname}`).toBe(FEEDBACK_FORM_BASE);
    expect(parsed.searchParams.get('id')).toBe(FEEDBACK_FORM_ID);
    expect(parsed.searchParams.has(FEEDBACK_PARAM_REPORTED_BY)).toBe(true);
    expect(parsed.searchParams.has(FEEDBACK_PARAM_VIEW)).toBe(true);
  });

  it('substitutes and encodes operator name and view including spaces and special characters', () => {
    const operatorName = 'Jane Doe';
    const view = 'Layouts & Assignments';
    const urlString = buildFeedbackUrl(operatorName, view);
    const parsed = new URL(urlString);

    expect(parsed.searchParams.get(FEEDBACK_PARAM_REPORTED_BY)).toBe(operatorName);
    expect(parsed.searchParams.get(FEEDBACK_PARAM_VIEW)).toBe(view);

    // Verify raw query string encoding
    expect(urlString).toContain(`${FEEDBACK_PARAM_REPORTED_BY}=Jane+Doe`);
    expect(urlString).toContain(`${FEEDBACK_PARAM_VIEW}=Layouts+%26+Assignments`);
  });

  it('produces an empty Reported By value when operator is null', () => {
    const urlString = buildFeedbackUrl(null, 'Dashboard');
    const parsed = new URL(urlString);

    expect(parsed.searchParams.get(FEEDBACK_PARAM_REPORTED_BY)).toBe('');
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
