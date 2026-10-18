/* Hand-maintained remote-client types for @dsh/api-memory-recall. */
import type {
  RemoteResult,
  TypertRemoteContribution,
} from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$6d656d6f72792d726563616c6c {
    connList: () => Promise<RemoteResult<JsonValue>>
    connCreate: (connCreate: JsonValue) => Promise<RemoteResult<JsonValue>>
    connUpdate: (connUpdate: JsonValue) => Promise<RemoteResult<JsonValue>>
    connDelete: (connDelete: JsonValue) => Promise<RemoteResult<JsonValue>>
    embeddingModels: () => Promise<RemoteResult<JsonValue>>
  }
  interface TypertRemoteMap {
    'memory-recall/connList': () => Promise<RemoteResult<JsonValue>>
    'memory-recall/connCreate': (connCreate: JsonValue) => Promise<RemoteResult<JsonValue>>
    'memory-recall/connUpdate': (connUpdate: JsonValue) => Promise<RemoteResult<JsonValue>>
    'memory-recall/connDelete': (connDelete: JsonValue) => Promise<RemoteResult<JsonValue>>
    'memory-recall/embeddingModels': () => Promise<RemoteResult<JsonValue>>
  }
  interface TypertRemoteNamespaceMap {
    'memory-recall': TypertRemoteNamespace$6d656d6f72792d726563616c6c
  }
}

export declare const TYPERT_REMOTE: TypertRemoteContribution
export default TYPERT_REMOTE
