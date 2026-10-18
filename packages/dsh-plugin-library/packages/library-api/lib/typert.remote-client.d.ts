/* Hand-maintained remote-client types for @dsh/api-library. */
import type {
  RemoteResult,
  TypertRemoteContribution,
} from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$6c696272617279 {
    ragList: () => Promise<RemoteResult<JsonValue>>
    ragCreate: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    ragDelete: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    ragIngest: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    ragQuery: (input: JsonValue) => Promise<RemoteResult<JsonValue>>
  }
  interface TypertRemoteMap {
    'library/ragList': () => Promise<RemoteResult<JsonValue>>
    'library/ragCreate': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    'library/ragDelete': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    'library/ragIngest': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
    'library/ragQuery': (input: JsonValue) => Promise<RemoteResult<JsonValue>>
  }
  interface TypertRemoteNamespaceMap {
    'library': TypertRemoteNamespace$6c696272617279
  }
}

export declare const TYPERT_REMOTE: TypertRemoteContribution
export default TYPERT_REMOTE
