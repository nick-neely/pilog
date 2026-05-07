# PiLog PRD: Frictionless Developer Scratchpad to GitHub Issue Agent

## 1. Product Summary

**PiLog** is a desktop developer scratchpad that lets users instantly capture rough, stream-of-consciousness notes without leaving their current flow. A global hotkey opens a lightweight markdown editor where developers can jot down bugs, UX tweaks, feature ideas, refactors, and “fix this later” thoughts.

PiLog then uses a local AI agent, powered by the Pi agent harness, to analyze those notes, inspect the active repository for context, group related ideas, and generate GitHub-ready issues with clear titles, descriptions, affected files, implementation context, and acceptance criteria.

The core goal is to turn messy developer notes into useful GitHub issues with almost no context switching.

## 2. Working Name

**Recommended name: PiLog**

Rationale:

- Directly references Pi, the agent harness.
- Suggests logging thoughts, bugs, and dev notes.
- Short, memorable, developer-friendly.
- Better fit than `Dispatch`, which is already strongly associated with another AI coding-agent product.
- Better than `ComPile`, which is clever but visually ambiguous and may be harder to search or say out loud.

Domain note:

- Public search shows an existing `PiLog Group` enterprise data-governance company, so trademark/domain checks are still required before serious launch.
- `Dispatch` has stronger conflict risk because `withdispatch.dev` is already an AI coding-agent product.
- Recommended domain patterns to check manually: `pilog.dev`, `usepilog.dev`, `pilogapp.com`, `pilog.ai`, `getpilog.dev`, `trypilog.dev`.

## 3. Problem

Developers constantly notice small issues while working:

- “This spacing is broken on mobile.”
- “This save button needs a loading state.”
- “This auth redirect bug probably lives in middleware.”
- “We should split this database flow into smaller tasks.”

The pain is not writing notes. The pain is stopping current work, opening GitHub, choosing the right repository, deciding scope, writing a proper issue, adding acceptance criteria, labeling it, and then getting back into flow.

Most developers either:

- ignore the thought,
- leave a vague TODO,
- dump it in a notes app,
- create a low-quality issue,
- or forget it entirely.

PiLog solves this by separating **capture** from **triage**.

## 4. Target Users

Primary MVP users:

- Solo developers
- Indie hackers
- Freelancers
- Consultants
- Small GitHub-native teams
- Open-source maintainers

Best early use case:

- A developer working in a local repo who wants to quickly capture product/dev thoughts and later convert them into clean GitHub issues.

## 5. Core Product Principles

1. **Capture must be instant.** Opening the scratchpad should feel lighter than opening a browser tab.
2. **Review is the default.** Users should trust the generated issues before publishing.
3. **Auto-publish exists, but must be explicit.** Power users can send generated issues directly to GitHub after reviewing configuration and permissions.
4. **Repo context matters.** The issue should not sound like generic AI output. It should reference likely files, components, flows, labels, and project terminology.
5. **Grouping is a key feature.** The agent should merge related small notes and split complex notes into separate issues when appropriate.
6. **Never hide the raw source.** Every generated issue should show which original notes produced it.
7. **Local-first where possible.** Notes and settings should be stored locally by default.

## 6. MVP Scope

### Included in MVP

- Electron desktop app
- Global hotkey scratchpad
- Lightweight markdown editor
- Local note inbox
- Repository selection
- GitHub authentication
- GitHub repository/issue publishing
- Integrated/bundled Pi agent runtime
- Repo-aware issue generation
- Review mode
- Auto-publish mode
- Basic grouping/splitting logic
- Generated labels and priority suggestions
- Local persistence
- Settings screen

### Excluded from MVP

- Jira integration
- Linear integration
- Team accounts
- Cloud sync
- Multi-user collaboration
- Voice capture
- Mobile app
- Background daemon for every active editor
- Full project management dashboard
- Complex epic/milestone planning beyond basic parent/subtask draft structure

## 7. Tech Stack

### Desktop App

- **Electron** for native desktop shell
- **electron-vite** for project scaffolding, dev server, build pipeline, and clean Electron/Vite integration
- **pnpm** as the package manager
- **React** for UI
- **TypeScript** across app, agent bridge, and backend-like local services
- **Tailwind CSS** for styling
- **shadcn/ui** for base components
- **HugeIcons React** (`@hugeicons/react` + `@hugeicons/core-free-icons`) for icons
- **CodeMirror 6** or **Milkdown** for markdown editing

Rationale:

- `electron-vite` gives the MVP a fast React/Vite development loop while preserving a clean Electron split between main, preload, and renderer code.
- `pnpm` keeps dependency management consistent and avoids mixing Bun package management with Node/Electron runtime assumptions.
- Avoid `bun:sqlite` in MVP because the app runs inside Electron/Node, not Bun.

### Local Data

Recommended MVP storage:

- **SQLite-compatible local database** for persistence
- **Drizzle ORM** for schema and queries
- **better-sqlite3** as the MVP SQLite driver

Product guidance:

- Use local SQLite for MVP. Do not require Turso Cloud, cloud sync, or a hosted database.
- Use `better-sqlite3` instead of `bun:sqlite` because the Electron main process runs on Node/Electron, not Bun.
- Turso/local libSQL can be considered later if multi-device sync becomes a requirement.
- GitHub tokens and other secrets must not be stored in the database. Use OS credential storage.

Store locally:

- notes
- generated issue drafts
- linked repositories
- settings
- non-sensitive GitHub auth metadata
- agent run history
- publish history

### Agent Harness

- **Pi agent harness** as the local agent substrate
- PiLog should integrate Pi directly inside the app experience. The user should not need to manually install the Pi CLI or run a separate setup process outside PiLog.
- Preferred MVP approach: bundle or embed Pi through the available package/runtime integration and expose Pi configuration through PiLog's settings/onboarding screens.
- Fallback approach: if direct embedding is blocked by Pi packaging constraints, PiLog may manage the Pi binary/CLI internally, including installation, updates, and health checks, without requiring the user to leave the app.

Use Pi to:

- inspect repository files
- summarize relevant code areas
- generate issue drafts
- group notes into issues
- split complex notes into multiple issues
- propose affected files and labels

The Electron app owns the UX, local data, GitHub publishing flow, and session lifecycle. Pi is the internal agent runtime behind the app, not an external prerequisite the user has to understand before using PiLog.

### GitHub Integration

MVP approach:

- GitHub OAuth device flow or local browser OAuth callback
- Store tokens securely using Electron-safe credential storage
- Do not use Better Auth in MVP. It is reserved for a future hosted account layer, cloud sync, billing, or team features.

Use GitHub REST or GraphQL API to:

- list repositories
- list labels
- read existing issue templates if available
- create issues
- optionally create task lists in issue bodies

### Recommended Initial Project Structure

```txt
pilog/
  package.json
  pnpm-lock.yaml
  electron.vite.config.ts
  drizzle.config.ts
  src/
    main/
      index.ts
      window/
        create-main-window.ts
        create-scratchpad-window.ts
      hotkeys/
        register-global-hotkeys.ts
      db/
        client.ts
        schema.ts
        migrations.ts
      github/
        auth.ts
        client.ts
        issues.ts
        repos.ts
      pi/
        runtime.ts
        agent-session.ts
        issue-generation.ts
        config.ts
      repos/
        git.ts
        local-repo-service.ts
      ipc/
        handlers.ts
        channels.ts
      security/
        secrets.ts
    preload/
      index.ts
      api.ts
    renderer/
      index.html
      src/
        main.tsx
        app.tsx
        components/
          ui/
        features/
          scratchpad/
          inbox/
          issue-drafts/
          repositories/
          github/
          agent-runs/
          settings/
        lib/
          ipc-client.ts
          markdown.ts
          utils.ts
  drizzle/
    migrations/
```

Structure guidance:

- Keep GitHub, database, Pi runtime, file-system, and token handling in the Electron main process.
- Expose only narrow, typed IPC methods through the preload layer.
- Keep the renderer focused on UI state, forms, review workflows, and issue draft editing.
- Do not expose raw Node APIs directly to the renderer.

### Security

- Use OS keychain/keytar or Electron safeStorage for secrets
- Never store GitHub tokens in plain text
- Never store model provider API keys in PiLog's SQLite database
- Make auto-publish opt-in per repository
- Show clear model/data settings before sending repo content to any model
- Keep issue publishing auditable with a local publish log

### AI Provider and BYOK Model

PiLog is BYOK by design. AI provider configuration is delegated to Pi, but exposed through PiLog's own onboarding/settings UX.

Requirements:

- Users configure provider credentials and model choices through Pi-native configuration surfaced inside PiLog.
- PiLog should not require users to install Pi separately, open a terminal, or manually edit config files for the normal setup path.
- PiLog should not own a separate model-provider abstraction in MVP. Pi remains the authority for model/provider support.
- PiLog may show the selected/default model and provide a guided setup flow, but it should avoid duplicating Pi's full provider configuration system.
- Advanced users may optionally open/edit the underlying Pi config from PiLog.

## 8. Main User Flows

### Flow 1: Capture a Note

1. User presses global hotkey.
2. PiLog opens a small always-on-top scratchpad.
3. User writes rough markdown notes.
4. User closes the window or presses save.
5. Notes are saved locally to the inbox.

Example note:

```md
settings page spacing is weird on mobile
save button needs loading state
profile avatar upload errors silently
auth redirect after session expires is broken, maybe middleware?
```

### Flow 2: Review Mode Issue Generation

1. User opens PiLog inbox.
2. User selects one or more notes.
3. User clicks **Generate Draft Issues**.
4. Agent inspects notes and local repo context.
5. App displays generated issue drafts as cards.
6. User can edit, split, merge, dismiss, or publish.
7. User clicks **Publish to GitHub** for selected drafts.

Review mode is the default mode.

### Flow 3: Auto-Publish Mode

1. User selects notes or chooses “process current inbox.”
2. User clicks **Generate and Publish**.
3. App shows a confirmation if auto-publish is not enabled for the repo.
4. Agent generates grouped issues.
5. App creates issues in GitHub automatically.
6. App shows a publish report with links to created issues.

Auto-publish requirements:

- Must be explicitly enabled.
- Must be repo-specific.
- Should support a “dry run first” setting.
- Should create a local publish log.
- Should never run silently in the background without user action in MVP.

## 9. Feature Requirements

### 9.1 Global Scratchpad

Requirements:

- Configurable global hotkey
- Small floating window
- Fast open/close behavior
- Markdown input
- Save on close
- Manual save shortcut
- Optional repository selector
- Optional note tags

Nice-to-have:

- Detect active repo based on current working directory or last selected repo
- Detect current git branch if opened from a repo context

### 9.2 Note Inbox

Requirements:

- List captured notes
- Search notes
- Filter by repo/status/date
- Edit raw notes
- Select multiple notes for processing
- Statuses:
  - `unprocessed`
  - `drafted`
  - `published`
  - `dismissed`

### 9.3 Issue Draft Generation

Generated issue fields:

- Title
- Body/description
- Source notes
- Suggested labels
- Suggested priority
- Suggested affected files
- Acceptance criteria
- Implementation notes
- Confidence level
- Reasoning summary, concise and user-facing

Important: do not expose raw chain-of-thought. The “reasoning summary” should be a short explanation like:

> Grouped these notes because they all affect the settings form UX. Associated with `SettingsForm.tsx` because it owns the save action and form layout.

### 9.4 Grouping and Splitting

The agent should classify notes into issue groups:

- **Merge into one issue** when notes are related small fixes in the same area.
- **Split into separate issues** when notes affect unrelated systems.
- **Create parent issue with subtasks** when a note describes a larger multi-step feature or refactor.
- **Ask for clarification** when a note is too vague.

MVP grouping examples:

Input:

```md
settings mobile spacing bad
save button should show loading
avatar upload error is silent
```

Output:

- Issue 1: Polish settings page UX
  - mobile spacing
  - save loading state
  - avatar upload error display

Input:

```md
session expires and redirect breaks, probably middleware. also token refresh chain seems messy and database session table may need cleanup
```

Output:

- Issue 1: Fix expired-session redirect handling
- Issue 2: Review token refresh/session persistence flow
- Optional parent issue if the repo appears to use GitHub task lists heavily

### 9.5 Review Screen

Each issue draft card should support:

- Edit title/body
- Edit labels
- Edit acceptance criteria
- View source notes
- View suspected affected files
- Merge with another draft
- Split into separate draft
- Dismiss
- Publish

### 9.6 GitHub Publishing

Requirements:

- Select GitHub account
- Select repo
- Pull available labels
- Create issue with generated markdown body
- Apply selected labels
- Return issue URL
- Mark local draft as published

MVP issue body template:

```md
## Summary

[Generated summary]

## Context

[Relevant repo/context summary]

## Source Notes

- [Original note 1]
- [Original note 2]

## Suggested Affected Files

- `path/to/file.tsx`
- `path/to/other-file.ts`

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Implementation Notes

[Concise technical notes]
```

### 9.7 Settings

Settings should include:

- Global hotkey
- Default mode: Review or Auto-publish
- Default repository
- GitHub account connection
- Model/provider setup and selection through Pi, surfaced inside PiLog
- Repo indexing settings
- Auto-publish safety settings
- Data/privacy controls

Auto-publish settings:

- Enable/disable per repo
- Require confirmation before publish
- Limit max issues per run
- Always add label, e.g. `triaged-by-pilog`
- Optional draft-only dry run

## 10. Agent Behavior Specification

The agent should follow this workflow:

1. Read selected notes.
2. Identify candidate themes.
3. Inspect repository structure.
4. Search likely files/components/routes based on note language.
5. Pull issue templates and labels if available.
6. Group or split notes into issue drafts.
7. Generate concise, actionable GitHub issue content.
8. Include confidence and affected-file rationale.
9. Return structured JSON to the Electron app.

### Expected Agent Output Shape

```ts
type GeneratedIssueDraft = {
  title: string
  summary: string
  context: string
  sourceNoteIds: string[]
  suggestedLabels: string[]
  priority?: 'low' | 'medium' | 'high'
  affectedFiles: Array<{
    path: string
    reason: string
  }>
  acceptanceCriteria: string[]
  implementationNotes: string[]
  confidence: 'low' | 'medium' | 'high'
  groupingReason: string
  publishReady: boolean
  needsClarification?: string[]
}
```

## 11. Data Model Draft

```ts
type Note = {
  id: string
  repoId?: string
  content: string
  status: 'unprocessed' | 'drafted' | 'published' | 'dismissed'
  createdAt: string
  updatedAt: string
}

type Repo = {
  id: string
  name: string
  owner: string
  localPath: string
  githubUrl?: string
  defaultBranch?: string
  autoPublishEnabled: boolean
  createdAt: string
  updatedAt: string
}

type IssueDraft = {
  id: string
  repoId: string
  title: string
  body: string
  labels: string[]
  sourceNoteIds: string[]
  affectedFilesJson: string
  confidence: 'low' | 'medium' | 'high'
  status: 'draft' | 'published' | 'dismissed'
  githubIssueUrl?: string
  createdAt: string
  updatedAt: string
}
```

## 12. UI Structure

Recommended screens:

1. **Scratchpad Window**
   - Tiny markdown editor
   - Save/close
   - Repo selector

2. **Inbox**
   - Notes list
   - Filters
   - Generate Draft Issues
   - Generate and Publish

3. **Draft Review**
   - Issue draft cards
   - Edit/split/merge/publish controls

4. **Repositories**
   - Add local repo
   - Connect GitHub repo
   - Configure auto-publish

5. **Settings**
   - Hotkey
   - Provider/model
   - GitHub auth
   - Privacy
   - Auto-publish limits

## 13. MVP Success Criteria

The MVP is successful if:

- A developer can capture a note in under 3 seconds.
- A developer can turn 5 rough notes into 1-3 useful GitHub issue drafts.
- Generated issues include meaningful acceptance criteria.
- Generated issues reference likely affected files with a useful explanation.
- Review mode feels safe and fast.
- Auto-publish works but is clearly controlled and auditable.
- The app is useful for a real repo without requiring a cloud backend.

## 14. Suggested Implementation Plan

### Phase 1: Desktop Shell and Local Notes

- Create Electron + electron-vite + React + TypeScript app.
- Configure pnpm workspace/scripts.
- Add Tailwind CSS and shadcn/ui.
- Add global hotkey.
- Add scratchpad window.
- Add local SQLite database using Drizzle + better-sqlite3.
- Save notes locally.
- Build inbox screen.

### Phase 2: GitHub and Repo Setup

- Add local repo selector.
- Detect git metadata.
- Add GitHub device flow or local OAuth callback.
- List repos and labels.
- Create test issue from app.

### Phase 3: Integrated Pi Agent Runtime

- Add internal Pi runtime/bridge service.
- Bundle or manage Pi so users do not need a separate Pi install.
- Add guided Pi provider/model setup inside PiLog.
- Send selected notes and repo path to the agent.
- Let agent inspect repo files.
- Return structured issue draft JSON.
- Store generated drafts locally.

### Phase 4: Review Mode

- Build draft review cards.
- Support edit, dismiss, publish.
- Add source note display.
- Add affected file display.

### Phase 5: Auto-Publish Mode

- Add repo-level auto-publish toggle.
- Add confirmation modal.
- Add max issue limit per run.
- Generate and publish issues in one action.
- Show publish report with GitHub links.

### Phase 6: Polish

- Improve grouping prompts.
- Add issue-template awareness.
- Add label matching.
- Polish embedded Pi model/provider settings.
- Improve loading states and error handling.

## 15. Prompting Guidance for the Agent

The issue-generation prompt should emphasize:

- Do not create one issue per note by default.
- Group related minor UX notes.
- Split unrelated or complex notes.
- Use repo context when available.
- Prefer concrete acceptance criteria.
- Avoid overclaiming certainty.
- Return structured JSON only.
- Include concise rationale, not hidden reasoning.
- Mark vague notes as needing clarification.

Example instruction:

```txt
You are generating GitHub issue drafts from rough developer scratchpad notes.
Use the local repository context to infer likely affected areas, but do not invent details.
Group related small notes into one issue when they affect the same feature, page, component, or user flow.
Split notes into separate issues when they affect unrelated systems or require separate implementation work.
For larger work, create a parent issue with checklist subtasks only when the scope clearly crosses multiple implementation areas.
Return structured JSON matching the provided schema.
```

## 16. Open Questions

- Can Pi be embedded cleanly through a package/runtime integration, or does PiLog need to internally manage a bundled Pi binary/CLI?
- Should repo indexing be persistent or done per generation run?
- Should issue templates be parsed in MVP or added shortly after?
- Should auto-publish be hidden behind an “advanced” setting?
- Should the app support multiple scratchpads per repo or a single universal inbox?

## 17. Recommended MVP Default Settings

- Default mode: Review
- Auto-publish: Disabled
- Max auto-published issues per run: 5
- Add default label: `triaged-by-pilog`
- Store notes locally only
- Require manual GitHub auth through device flow or local OAuth callback
- Require manual repo linking
- Use local SQLite-compatible storage with Drizzle + better-sqlite3
- Use Pi-managed BYOK provider configuration surfaced inside PiLog
- Show source notes on every generated issue
