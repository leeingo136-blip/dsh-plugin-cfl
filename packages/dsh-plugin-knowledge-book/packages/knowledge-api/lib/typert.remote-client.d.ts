/* Hand-maintained remote-client types for @dsh/api-knowledge-book. */
import type {
  RemoteResult,
  TypertRemoteContribution,
} from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$6b6e6f776c65646765 {
    skillSources: () => Promise<RemoteResult<JsonValue>>
    skillList: () => Promise<RemoteResult<JsonValue>>
    skillRead: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    skillSave: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    skillDelete: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    ragList: () => Promise<RemoteResult<JsonValue>>
    ragCreate: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    ragDelete: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    ragIngest: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    ragQuery: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
  }
  interface TypertRemoteMap {
    'knowledge/skillSources': () => Promise<RemoteResult<JsonValue>>
    'knowledge/skillList': () => Promise<RemoteResult<JsonValue>>
    'knowledge/skillRead': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    'knowledge/skillSave': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    'knowledge/skillDelete': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    'knowledge/ragList': () => Promise<RemoteResult<JsonValue>>
    'knowledge/ragCreate': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    'knowledge/ragDelete': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    'knowledge/ragIngest': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    'knowledge/ragQuery': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
  }
  interface TypertRemoteNamespaceMap {
    'knowledge': TypertRemoteNamespace$6b6e6f776c65646765
  }
}

export declare const TYPERT_REMOTE: TypertRemoteContribution
export default TYPERT_REMOTE
