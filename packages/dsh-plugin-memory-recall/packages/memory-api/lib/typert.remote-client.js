/* Generated for @dsh/api-memory-recall — hand-maintained manifest, JsonValue wire contracts. */
import { z } from 'zod'

  let jsonValue$schema$value
  const jsonValue$schema = () => (jsonValue$schema$value ??= z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => jsonValue$schema())), z.record(z.string(), z.lazy(() => jsonValue$schema()))]))

const TYPERT_REMOTE = {
  package: '@dsh/api-memory-recall',
  descriptors: [
    {
      id: '@dsh/api-memory-recall#memory-recall/connList',
      service: 'memoryRecallController',
      namespace: 'memory-recall',
      method: 'connList',
      invocation: { kind: 'direct' },
      parameters: [

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-recall#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-memory-recall#memory-recall/connCreate',
      service: 'memoryRecallController',
      namespace: 'memory-recall',
      method: 'connCreate',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-recall#memory-recall/connCreate:input',
            create: jsonValue$schema,
          },
        }

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-recall#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-memory-recall#memory-recall/connUpdate',
      service: 'memoryRecallController',
      namespace: 'memory-recall',
      method: 'connUpdate',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-recall#memory-recall/connUpdate:input',
            create: jsonValue$schema,
          },
        }

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-recall#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-memory-recall#memory-recall/connDelete',
      service: 'memoryRecallController',
      namespace: 'memory-recall',
      method: 'connDelete',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-recall#memory-recall/connDelete:input',
            create: jsonValue$schema,
          },
        }

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-recall#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-memory-recall#memory-recall/embeddingModels',
      service: 'memoryRecallController',
      namespace: 'memory-recall',
      method: 'embeddingModels',
      invocation: { kind: 'direct' },
      parameters: [

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-recall#JsonValue',
        create: jsonValue$schema,
      },
    }
  ],
}

export default TYPERT_REMOTE
export { TYPERT_REMOTE }
