/* Generated for @dsh/api-rag-knowledge — hand-maintained manifest, JsonValue wire contracts. */
import { z } from 'zod'

  let jsonValue$schema$value
  const jsonValue$schema = () => (jsonValue$schema$value ??= z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => jsonValue$schema())), z.record(z.string(), z.lazy(() => jsonValue$schema()))]))

export const TYPERT = {
  package: '@dsh/api-rag-knowledge',
  face: 'host',
  schemas: [
    {
      name: 'JsonValue',
      create: jsonValue$schema,
    },
  ],
  model: {
    "services": [
      {
        "tags": [],
        "key": "memoryRecallController",
        "exportName": "MemoryRecallController",
        "members": [
          {
            "kind": "method",
            "name": "connList",
            "signature": "connList(): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "connCreate",
            "signature": "connCreate(input: JsonValue): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "connUpdate",
            "signature": "connUpdate(input: JsonValue): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "connDelete",
            "signature": "connDelete(input: JsonValue): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "embeddingModels",
            "signature": "embeddingModels(): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "connQuery",
            "signature": "connQuery(input: JsonValue): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "connDocs",
            "signature": "connQuery(input: JsonValue): Promise<JsonValue>"
          }
        ],
        "types": []
      }
    ],
    "events": [],
    "objects": []
  },
  invocations: [
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
    }
  ],
}

export default TYPERT
