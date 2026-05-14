# Pilog PRD: Context Quality v2

## 1. Product Summary

**Context Quality v2** is a product maturity direction for Pilog, not a semantic app version. It focuses on making generated **Issue Drafts** more grounded, faster to review, and safer to publish by preserving the right repo, note, git, and uncertainty context before automation.

Pilog already separates capture from triage. v2 deepens the triage side of that promise: the app should remember the shape of a linked **Repo**, preserve what was happening when a **Note** was captured, ask for clarification when the source material is too thin, and make auto-publish stricter about what is eligible to leave the machine.

The core goal is not to create more issues. The core goal is to make every issue draft easier to trust.

## 2. Product Theme

Context Quality means Pilog should make three things legible:

1. **What Pilog knew before generation.**
2. **What Pilog verified live during generation.**
3. **What Pilog still does not know.**

The v2 feature set should therefore improve generation quality without turning Pilog into a background repo watcher, a project management dashboard, or an autonomous issue bot.

## 3. Target Users

Same core users as the MVP:

- Solo developers
- Indie hackers
- Freelancers
- Consultants
- Small GitHub-native teams
- Open-source maintainers

The strongest v2 use case is a developer who captures rough notes while actively coding, then later wants Pilog to produce GitHub-ready drafts that reflect the repo structure, branch context, and uncertainty level without needing a full manual explanation.

## 4. Product Principles

1. **Context accelerates, evidence grounds.** A **Repo Index** can guide the agent toward likely files, but specific draft claims must be grounded in **Live Repo Evidence**.
2. **Do not preserve stale code as truth.** v2 stores structure and lightweight signals, not file contents, embeddings, or long code summaries.
3. **Ask before inventing.** Vague source notes should become **Clarification Drafts**, not fake-confident issues.
4. **Capture stays light.** **Capture Context** should be collected after save without turning the Scratchpad into a form.
5. **Automation remains auditable.** Auto-publish is user-initiated, repo-scoped, and recoverable through explicit reports and **Publish Undo**.
6. **Controls should shape output, not create a settings maze.** Saved repo defaults and temporary run overrides should be visible and understandable.

## 5. Narrative Chapters

These chapters describe the product story and dependency logic for v2. They are not implementation slices, delivery phases, or ticket boundaries.

### Chapter 1: Repo Memory

Pilog should keep a lightweight local map of each linked repo so generation does not begin from a blind traversal every time.

The **Repo Index** is created when a repo is linked, can be refreshed manually, and may be used when stale. A stale index is acceptable as navigation context, but it is not trusted evidence for specific claims. Generation should continue with a visible stale-index notice and require live repo reads before claiming affected files, routes, components, framework behavior, or implementation details.

Suggested Repo Index contents:

- Repo name, owner, local path, linked GitHub URL
- Default branch
- Last indexed timestamp
- Index version
- Package manager
- Languages and framework signals
- Important directories and their apparent role
- Route, page, component, API, server, and test directory candidates for common stacks
- GitHub issue templates and labels
- Recent commits and recently changed files
- Current branch at index time
- Ignore/exclusion summary for generated, dependency, binary-heavy, or build-output paths

The index should not contain:

- Full file contents
- Embeddings
- Long code summaries
- Persistent summaries of frequently changing source files
- Secret-bearing diff contents by default

User-facing behavior:

- Repositories show index status and last indexed time.
- Generation surfaces show compact index freshness.
- A **Re-index repo** action is available from repo settings and generation context.
- If no index exists, generation can fall back to live traversal and offer to create one afterward.
- If the repo path is unavailable, generation fails before starting.

### Chapter 2: Context-Aware Drafting

Pilog should preserve the context around a note and use it to draft more honestly.

**Capture Context** is saved with each Note after capture. It includes cheap git metadata by default:

- Repo ID
- Branch name
- Dirty file list
- Staged file list
- HEAD commit SHA and subject
- Capture timestamp

Diff content is more sensitive and more likely to contain half-written or proprietary work. Diff summaries should be opt-in per repo through privacy settings.

Issue generation should receive:

- Source notes
- Capture Context
- Repo Index
- Saved **Issue Style**
- Saved **Draft Content Toggles**
- Relevant Clarification History when regenerating
- Live repo tools for verification

When a note is too vague, Pilog should create a **Clarification Draft**. Clarification is a draft workflow state, not a Note status, because one source note can produce both publish-ready work and clarification work after grouping or splitting.

Clarification behavior:

- Clarification Drafts appear in Draft Review with a clear filter.
- The card shows specific questions, not just a low-confidence warning.
- The user answers prompts inline.
- Answers are stored as **Clarification History** with timestamped question/answer pairs.
- The original Note is not rewritten.
- Regeneration is explicit. Pilog should not spend model calls automatically after every typed answer.
- Regeneration uses the original source notes plus Clarification History and may produce a replacement publish-ready draft.
- If context is still insufficient, the Clarification Draft may ask another round of questions.

Draft quality controls:

- Each repo has saved Issue Style defaults.
- Each run can temporarily override those defaults.
- Temporary overrides are not saved unless the user explicitly promotes them to repo defaults.
- Issue Style controls depth: `concise`, `balanced`, or `detailed`.
- Issue Style controls audience: `internal` or `open_source`.
- Bug, feature, and refactor classification belongs to each Issue Draft, not to saved repo style.

Draft Content Toggles:

- Include implementation notes
- Include affected files
- Include source notes
- Include acceptance criteria
- Include confidence/rationale
- Include reproduction steps when possible

The generation surface should show the current context quietly, for example:

```txt
Repo index: fresh · Branch: feat/auth · 4 changed files · Style: Balanced / Internal
```

### Chapter 3: Safer Auto-Publish

Auto-publish should become more powerful only after draft context is more trustworthy.

Auto-publish remains:

- Explicit
- Repo-specific
- User-initiated
- Auditable
- Never silently running in the background

v2 adds **Auto-Publish Eligibility** as a per-draft gate.

Eligibility rules:

- Clarification Drafts are never eligible.
- Low-confidence drafts are never eligible.
- Default minimum confidence is `high`.
- Repos may explicitly lower the minimum confidence threshold to `medium`.
- Drafts with unknown affected files are skipped by default, configurable per repo.
- Drafts missing required sections based on the repo's Draft Content Toggles are skipped.
- Auto-publish applies the repo's saved Issue Style and Draft Content Toggles.
- Auto-publish reports both published and skipped drafts with concrete reasons.

Auto-publish profiles may include:

- Enabled/disabled
- Max issues per run
- Minimum confidence threshold
- Default label, such as `triaged-by-pilog`
- Require known affected files
- Require confirmation
- Dry-run mode

Publish reports should include:

- Created issue links
- Skipped drafts
- Skip reasons
- Labels applied
- Source notes
- Run ID
- Repo
- Timestamp

**Publish Undo** means audited closure, not deletion. From a publish report, the user can close created issues. Pilog comments on each GitHub issue with the run ID and then closes it. The Publish Log remains immutable, the Issue Draft remains published, and partial close failures remain visible.

## 6. UI Requirements

Context should be visible at decision points and quiet everywhere else.

Repositories:

- Show Repo Index status.
- Show last indexed time.
- Show stale/missing index state.
- Provide **Re-index repo**.
- Show saved Issue Style and auto-publish profile summary.

Generation surface:

- Show compact context row before generation.
- Show stale-index notice without blocking generation.
- Allow temporary Issue Style and Draft Content Toggle overrides.
- Allow **Save as repo default** for overrides.
- Make privacy-sensitive diff capture status visible when relevant.

Draft Review:

- Show source notes.
- Show Capture Context when relevant.
- Show affected files and whether file claims were verified from Live Repo Evidence.
- Show confidence and concise rationale.
- Provide a Needs Clarification filter.
- Show Clarification Draft questions inline.
- Store answers as Clarification History.
- Provide explicit **Regenerate draft**.

Settings and privacy:

- Explain what Capture Context is collected automatically.
- Make diff summary capture opt-in per repo.
- Explain that Repo Index stores structure and lightweight signals, not file contents.
- Show auto-publish thresholds and skip rules.

Avoid:

- A Context Quality score.
- A metrics dashboard.
- Gamified quality indicators.
- Modal-first clarification flows.
- Large AI-themed banners or decorative status cards.

## 7. Data and Privacy Boundaries

Local-first remains the stance.

Stored locally:

- Repo Index
- Capture Context
- Issue Style defaults
- Draft Content Toggle defaults
- Clarification History
- Auto-publish profile settings
- Auto-publish reports
- Publish Undo events

Not stored by default:

- Full source file contents
- Embeddings
- Long persistent code summaries
- Raw diff contents
- Model/provider secrets in SQLite
- GitHub tokens in SQLite

Diff summaries require explicit per-repo opt-in. Live repo inspection during Agent Runs should remain bounded, auditable, and tied to user-initiated generation.

## 8. Acceptance Criteria

Repo Memory:

- Pilog stores a local Repo Index for a linked Repo.
- The Repo Index is created after repo linking.
- The user can manually refresh the Repo Index.
- The UI shows index freshness and stale state.
- Generation can use a stale Repo Index as navigation context.
- Specific draft claims about affected files, routes, components, or implementation behavior require Live Repo Evidence.
- Pilog does not store full file contents or long code summaries in the Repo Index.

Context-Aware Drafting:

- Notes store Capture Context with branch, dirty files, staged files, HEAD commit, and timestamp.
- Diff summary capture is disabled by default and configurable per repo.
- Generation receives Capture Context when available.
- User can configure saved Issue Style per repo.
- User can configure saved Draft Content Toggles per repo.
- Generation surface shows saved style and allows temporary run overrides.
- Temporary run overrides are not saved unless explicitly promoted to repo defaults.
- Agent can return Clarification Drafts.
- Clarification Drafts live on Issue Drafts, not Notes.
- Clarification questions are shown as actionable draft cards.
- User answers are stored as Clarification History.
- Regeneration uses source notes plus Clarification History.
- Raw source notes are not rewritten by clarification answers.

Safer Auto-Publish:

- Auto-publish skips Clarification Drafts.
- Auto-publish skips low-confidence drafts.
- Default auto-publish minimum confidence is high.
- Repos can explicitly lower auto-publish minimum confidence to medium.
- Auto-publish skips drafts with unknown affected files by default.
- Auto-publish respects max issue count.
- Auto-publish applies the repo's saved style and content settings.
- Auto-publish report lists published and skipped drafts.
- Skipped drafts include concrete skip reasons.
- Publish Undo comments on and closes created GitHub issues.
- Publish Undo does not delete GitHub issues.
- Publish Undo does not rewrite the Publish Log.

## 9. Success Criteria

v2 is successful when:

- Users can tell what repo and git context Pilog used before they publish.
- Most generated drafts cite source notes, Capture Context, and Live Repo Evidence when making specific file claims.
- Vague notes become Clarification Drafts instead of fake-confident issues.
- Regenerating with Clarification History produces a publish-ready draft when the user supplies enough detail.
- Repeat generation on the same repo starts from the Repo Index instead of blind repo traversal.
- Auto-publish reports both published and skipped drafts with concrete reasons.
- Auto-publish never publishes low-confidence or clarification drafts.
- Users can close created issues from an auto-publish run without losing audit history.

Speed is a goal, but this PRD does not promise a specific generation-speed percentage. The more defensible product outcome is fewer blind traversals and higher review trust.

## 10. v2 Non-Goals

These are non-goals for Context Quality v2 only. They do not permanently rule out future product directions.

- Background repo watching.
- Semantic code search database.
- Persistent embeddings or full-code-content caches.
- Autonomous issue publishing without a user-initiated run.
- Project management dashboard.
- Replacing Live Repo Evidence with stale Repo Index claims.
- Multi-agent implementation planning.
- Cloud sync.
- Team accounts.

## 11. Open Questions for Later Planning

These should be answered during implementation planning, not in this PRD:

- Exact SQLite schema for Repo Index, Capture Context, Clarification History, and auto-publish reports.
- Exact stale-index threshold.
- Exact framework detectors for the first Repo Index pass.
- Whether index refresh should run synchronously on repo link or as a visible background job.
- Whether Clarification Drafts are represented as a new draft status or a structured draft subtype.
- Exact UI placement for run-level style overrides.
- Exact Publish Undo storage shape.
- Whether prompt-quality fixtures should become the first benchmark harness for Context Quality regressions.
