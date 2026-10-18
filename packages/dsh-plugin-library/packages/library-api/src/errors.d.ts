/** Browser-safe failure vocabulary of the library remote face. */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The local embedding service is not mounted or disabled. */
    'library/embedding-unavailable': {}
    /** A knowledge-base call carried invalid arguments. */
    'library/rag-invalid': {}
  }
}

/** Keep this file a module so the block above augments, not shadows. */
export {}
