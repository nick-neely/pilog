export const LOCAL_FIRST_DISCLOSURE =
  'Notes, drafts, repo metadata, run history, and publish logs stay in local SQLite. Provider keys, GitHub tokens, and search keys are stored through OS-backed safe storage.'

export const GENERATION_EGRESS_DISCLOSURE =
  'Generating sends selected notes and bounded repository context to your configured Pi provider. Drafts and run history are saved locally.'

export const PUBLISH_EGRESS_DISCLOSURE =
  'Publishing is the GitHub write. Local drafts stay on this machine until you publish them.'

export const AUTO_PUBLISH_EGRESS_DISCLOSURE =
  'This plan was generated through your Pi provider. Publishing writes the selected drafts to GitHub; closing keeps them as local drafts.'

