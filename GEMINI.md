# GEMINI.md — Operational Policy for Gemini Agent

This document defines execution rules for Gemini in the **VIP Tracker** repository. Core architectural invariants, routing models, and repository commands are defined in [`AGENTS.md`](AGENTS.md).

---

## 1. Scope & Investigation Discipline

- **Minimal Safe Change:** Prefer the smallest surgical edit that satisfies the user's prompt.
- **Targeted Inspection:** Start with files directly relevant to the task. Do not perform broad repository scans or recursive searches for small or routine changes unless targeted inspection reveals a concrete need to expand scope.
- **Zero Scope Creep:** Do not refactor unrelated code, reformat untouched files, or clean up code outside the requested scope.

---

## 2. Execution & Process Discipline

- **Targeted Testing First:** Prefer narrow verification (`npm run test -- <path>` or `npm run typecheck`) over repo-wide validation.
- **Proportional Validation:** Match validation effort strictly to risk (Level 1, 2, or 3 in `AGENTS.md`). Do not run `npm run validate` for routine or UI edits.
- **Process Guardrail:** Never intentionally invoke persistent/watch-mode commands (`npm run test:watch`, bare `vitest`) for automated validation. If a command runs unexpectedly long or appears stalled, inspect the process and invocation before retrying or terminating it. Never repeatedly execute the same hanging or failing command without first determining the cause.

---

## 3. Review & Git Policy

- **Diff Verification:** Review `git status` and `git diff` before completion to guarantee that only intended files were modified.
- **Clean Commits:** Keep commits atomic, concise, and accurately described.
- **Completion Workflow:** For implementation tasks where the user asks to make, apply, fix, add, remove, or implement a change, treat review, commit, and push as part of completing the task after successful proportional validation.

  Do not commit or push for:
  - investigation
  - planning
  - audits
  - review-only tasks
  - documentation analysis
  - tasks where the user explicitly requests local-only/no-commit/no-push behavior

  If the user explicitly says not to commit or push, that always overrides the normal completion workflow.

  For larger phased work, preserve logical phase/feature commit boundaries. Never include unrelated user changes in a commit and never revert unrelated user changes simply to obtain a clean working tree.
