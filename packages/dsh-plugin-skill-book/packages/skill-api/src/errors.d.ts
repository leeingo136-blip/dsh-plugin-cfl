/** Browser-safe failure vocabulary of the skill-book remote face. */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The workspace registry service is not mounted. */
    'skill-book/workspace-unavailable': {}
    /** No skill by that name in the named source. */
    'skill-book/skill-unknown': {}
    /** A save/delete hit an unwritable source or a filesystem failure. */
    'skill-book/skill-save-failed': {}
    'skill-book/skill-delete-failed': {}
  }
}

/** Keep this file a module so the block above augments, not shadows. */
export {}
