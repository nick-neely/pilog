# Prompt Quality Loop

Issue 37 adds a deterministic Phase 6 loop for checking prompt-quality regressions before prompt changes ship.

Run it with:

```sh
pnpm run quality:prompt
```

The command evaluates three fixture repos:

- `focused-bug` checks a single clear bug becomes one publish-ready draft.
- `related-note-grouping` checks related settings notes stay grouped into one draft.
- `broad-feature-refactor` checks broad account-lifecycle work becomes a parent-style draft with checklist subtasks while vague dashboard work splits into a clarification draft.

The loop copies each fixture repo from `fixtures/prompt-quality/*/repo` into a temporary git repo, builds the same issue-generation prompt used by the app, exercises the app's read-only repo tools (`list_dir`, `read_file`, `grep`, `git_status`), validates output through `submit_issue_drafts`, normalizes labels with the existing repo-label matcher, and persists drafts through the normal issue-draft persistence path so repo issue templates are applied.

Interpretation rules:

- `PASS` means the fixture still satisfies its expected draft count, source-note grouping, affected files, labels, acceptance criteria, template application, and clarification behavior.
- `FAIL` means a prompt or generation-path change dropped required draft structure. Treat the listed failure as the first regression to inspect.
- The loop is deterministic and does not make live GitHub or model-provider calls. It is a structural baseline, not a replacement for human review of generated issue quality.
- When intentionally changing prompt behavior, update the relevant fixture response and expected properties in `src/main/pi/prompt-quality-fixtures.ts` in the same commit.

`pnpm run test` also runs `src/main/pi/prompt-quality-loop.test.ts`, so CI fails when this baseline regresses.
