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
- **Process Guardrail & Polling Discipline:** Never intentionally invoke persistent/watch-mode commands (`npm run test:watch`, bare `vitest`) for automated validation. If a command runs unexpectedly long or appears stalled, inspect the process and invocation before retrying or terminating it.
  - Do not repeatedly poll or narrate that a background process is still running without gathering new evidence.
  - After one initial status check, inspect the task log, process command line, CPU activity, child processes, prompts, and authentication state.
  - Every follow-up action must either gather new diagnostic evidence or correct an identified blocking condition.
  - Do not issue repeated “waiting,” “standing by,” or equivalent status messages.
  - Do not launch duplicate copies of a stalled command.
  - When a normally short-lived command remains unresolved, diagnose before retrying.
  - Retry a corrected command once. If it stalls again, stop and report the command as not validated.
- **Validation Sequencing:** Follow this order during validation:
  1. Use targeted checks while implementing.
  2. Correct failures using the smallest safe changes.
  3. For Level 3 work, run `npm run validate` once after targeted corrections succeed.
  4. Do not run every individual full-repository check and then immediately duplicate all of them with `npm run validate`.
  5. Do not repeatedly run the full test suite unless a subsequent code change invalidates the prior result.
  6. Run formatting only against changed files during implementation.
  7. Allow `npm run validate` to perform the final repository-wide format check.
  8. If the final format check fails, format only the reported files where practical, then rerun `npm run validate` once.
- **Local Validation Workflow:**
  - Detect whether the active repository is running from the SMB-backed `Z:` workspace before starting Node-based validation.
  - For Level 2 or Level 3 validation from `Z:`, prefer a current local-disk clone or disposable validation worktree.
  - Confirm the local validation copy references the intended branch/commit and contains the exact changes being validated.
  - Run dependency installation and validation only in the local copy when network-share execution is known to stall.
  - Do not repeatedly retry Vitest, TypeScript, ESLint, Prettier, or Vite commands from `Z:` after network-path behavior has been established.
  - Do not copy the entire local repository back to `Z:`.
  - If fixes are made locally, transfer only the intentional changed files, review the authoritative repository diff, and commit from the authoritative repository.
  - Preserve unrelated changes in both locations.
- **Local Copy Safety:**
  - Before `Remove-Item -Recurse`, `git reset --hard`, or similar destructive cleanup in a local validation copy, confirm the resolved path is the disposable local copy and not `Z:\ZZ\VIP Tracker`.
  - Never run destructive cleanup against the authoritative repository.
  - Do not delete a local copy that contains untransferred fixes.
  - Prefer reusing or refreshing a known disposable validation directory rather than creating many abandoned clones.
- **Validation Claim Discipline:**
  - Do not call a phase, feature, or fix “validated,” “verified,” “passing,” or “complete” unless the required checks actually completed successfully.
  - Clearly distinguish:
    - automated validation passed;
    - browser workflow verified;
    - statically reviewed;
    - not tested;
    - partially verified.
  - Report exactly which browser scenarios were exercised.
  - Do not imply untested browser workflows were manually verified merely because unit tests passed.
  - If only a core browser smoke test was performed, describe it as a core browser smoke test.
  - Never convert implementation assumptions or checklist review into claimed test results.

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
