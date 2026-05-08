# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view <ID>`. If it has a parent PRD, pull that in too.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits and run tests.

The execution model for this run is `{{IMPLEMENTATION_MODEL}}`.
Reason: {{IMPLEMENTATION_MODEL_REASON}}

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

Pay extra attention to test files that touch the relevant parts of the code.

# UI/UX AND SHADCN (PRE-EDIT GATE)

If the issue touches **any** renderer UI/UX (components under `src/renderer/`, layout, typography, copy, theming, accessibility, or `src/renderer/src/assets/main.css` tokens), **before** you edit project files:

1. Invoke `/impeccable` and follow its setup. If `/impeccable` is unavailable, read `PRODUCT.md` and `DESIGN.md` at the repo root and align with PiLog’s Reading-Room Journal constraints, anti-references, and accessibility rules in `AGENTS.md`.
2. If the work adds, changes, or composes **shadcn/ui** primitives (`src/renderer/src/components/ui/` or `@renderer/components/ui`): invoke `/shadcn`. Prefer existing primitives; run `pnpm dlx shadcn@latest add <component>` when a standard primitive is the right building block. Run `pnpm dlx shadcn@latest docs <component>` when unsure of API. After any `add`, read the new files, fix project aliases and HugeIcons usage (no other icon libraries), and verify composition (accessibility, groups, variants) before using the component.

# EXECUTION

If applicable, use RGR to complete the task.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

# FEEDBACK LOOPS

Before committing, run `pnpm run typecheck` and `pnpm run test` to ensure the tests pass.

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix
2. Include task completed + PRD reference
3. Key decisions made
4. Files changed
5. Blockers or notes for next iteration

Keep it concise.

# THE ISSUE

If the task is not complete, leave a comment on the issue with what was done.

Do not close the issue - this will be done later.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
