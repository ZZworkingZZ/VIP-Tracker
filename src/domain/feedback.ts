/**
 * Microsoft Form feedback URL builder.
 * Pure TypeScript domain helper with no React or DOM dependencies.
 */

export const FEEDBACK_FORM_BASE = 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx';
export const FEEDBACK_FORM_ID =
  'JYi0DnHoWUS8ctDs1o8fOWZP7fwX_QNLtLUVZGrCLzJUODMwQVI3SjJKTkVHMTdGMVdFREk3UjFQUi4u';
export const FEEDBACK_PARAM_REPORTED_BY = 'r5098f02a44da425fb97cb710e1ed7cfb';
export const FEEDBACK_PARAM_VIEW = 'r9736afc4d81c441fb7c070cf4f6c30c9';

/**
 * Builds the Microsoft Form feedback URL prefilled with operator identity and current view.
 *
 * @param operatorName The display name of the active operator, or null/undefined if unassigned.
 * @param currentView The name of the active view or page.
 * @returns Fully constructed and encoded feedback form URL.
 */
export function buildFeedbackUrl(operatorName: string | null, currentView: string): string {
  const url = new URL(FEEDBACK_FORM_BASE);
  url.searchParams.set('id', FEEDBACK_FORM_ID);
  url.searchParams.set(FEEDBACK_PARAM_REPORTED_BY, operatorName ?? '');
  url.searchParams.set(FEEDBACK_PARAM_VIEW, currentView);
  return url.toString();
}
