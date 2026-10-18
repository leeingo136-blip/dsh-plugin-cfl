/* Hand-maintained remote-client types for @dsh/api-skill-book. */
import type {
  RemoteResult,
  TypertRemoteContribution,
} from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$736b696c6c2d626f6f6b {
    skillSources: () => Promise<RemoteResult<JsonValue>>
    skillList: () => Promise<RemoteResult<JsonValue>>
    skillRead: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    skillSave: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    skillDelete: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
  }
  interface TypertRemoteMap {
    'skill-book/skillSources': () => Promise<RemoteResult<JsonValue>>
    'skill-book/skillList': () => Promise<RemoteResult<JsonValue>>
    'skill-book/skillRead': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    'skill-book/skillSave': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    'skill-book/skillDelete': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
  }
  interface TypertRemoteNamespaceMap {
    'skill-book': TypertRemoteNamespace$736b696c6c2d626f6f6b
  }
}

export declare const TYPERT_REMOTE: TypertRemoteContribution
export default TYPERT_REMOTE
