/** Browser-safe failure vocabulary of the knowledge remote face. */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The local embedding service is not mounted or disabled. */
    'knowledge/embedding-unavailable': {}
    /** The workspace registry service is not mounted. */
    'knowledge/workspace-unavailable': {}
    /** No skill by that name in the named source. */
    'knowledge/skill-unknown': {}
    /** A save/delete hit an unwritable source or a filesystem failure. */
    'knowledge/skill-save-failed': {}
    'knowledge/skill-delete-failed': {}
    /** A knowledge-base call carried invalid arguments. */
    'knowledge/rag-invalid': {}
  }
}

/** Keep this file a module so the block above augments, not shadows. */
export {}
