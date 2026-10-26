/* Generated for @dsh/api-rag-knowledge — hand-maintained manifest, JsonValue wire contracts. */
import { z } from 'zod'

  let jsonValue$schema$value
  const jsonValue$schema = () => (jsonValue$schema$value ??= z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => jsonValue$schema())), z.record(z.string(), z.lazy(() => jsonValue$schema()))]))

const TYPERT_REMOTE = {
  package: '@dsh/api-rag-knowledge',
  descriptors: [
    {
      id: '@dsh/api-rag-knowledge#rag-knowledge/connList',
      service: 'memoryRecallController',
      namespace: 'rag-knowledge',
      method: 'connList',
      invocation: { kind: 'direct' },
      parameters: [

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-rag-knowledge#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-rag-knowledge#rag-knowledge/connCreate',
      service: 'memoryRecallController',
      namespace: 'rag-knowledge',
      method: 'connCreate',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-rag-knowledge#rag-knowledge/connCreate:input',
            create: jsonValue$schema,
          },
        }

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-rag-knowledge#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-rag-knowledge#rag-knowledge/connUpdate',
      service: 'memoryRecallController',
      namespace: 'rag-knowledge',
      method: 'connUpdate',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-rag-knowledge#rag-knowledge/connUpdate:input',
            create: jsonValue$schema,
          },
        }

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-rag-knowledge#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-rag-knowledge#rag-knowledge/connDelete',
      service: 'memoryRecallController',
      namespace: 'rag-knowledge',
      method: 'connDelete',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-rag-knowledge#rag-knowledge/connDelete:input',
            create: jsonValue$schema,
          },
        }

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-rag-knowledge#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-rag-knowledge#rag-knowledge/embeddingModels',
      service: 'memoryRecallController',
      namespace: 'rag-knowledge',
      method: 'embeddingModels',
      invocation: { kind: 'direct' },
      parameters: [

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-rag-knowledge#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-rag-knowledge#rag-knowledge/connQuery',
      service: 'memoryRecallController',
      namespace: 'rag-knowledge',
      method: 'connQuery',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-rag-knowledge#rag-knowledge/connQuery:input',
            create: jsonValue$schema,
          },
        }

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-rag-knowledge#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-rag-knowledge#rag-knowledge/connDocs',
      service: 'memoryRecallController',
      namespace: 'rag-knowledge',
      method: 'connDocs',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-rag-knowledge#rag-knowledge/connDocs:input',
            create: jsonValue$schema,
          },
        }

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-rag-knowledge#JsonValue',
        create: jsonValue$schema,
      },
    }
  ],
}

export default TYPERT_REMOTE
export { TYPERT_REMOTE }
