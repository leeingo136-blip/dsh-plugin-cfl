/** Browser-safe failure vocabulary of the memory-recall remote face. */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** A connection-card call carried invalid arguments. */
    'memory-recall/invalid-input': {}
    /** The card name is already taken (names are the tool-facing handles). */
    'memory-recall/name-duplicate': { readonly name: string }
    /** The card id is unknown. */
    'memory-recall/not-found': { readonly id: string }
  }
}

/** Keep this file a module so the block above augments, not shadows. */
export {}
