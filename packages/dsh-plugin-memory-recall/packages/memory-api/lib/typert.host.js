/* Generated for @dsh/api-memory-recall — hand-maintained manifest, JsonValue wire contracts. */
import { z } from 'zod'

  let jsonValue$schema$value
  const jsonValue$schema = () => (jsonValue$schema$value ??= z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => jsonValue$schema())), z.record(z.string(), z.lazy(() => jsonValue$schema()))]))

export const TYPERT = {
  package: '@dsh/api-memory-recall',
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
    },
    {
      id: '@dsh/api-memory-recall#memory-recall/connQuery',
      service: 'memoryRecallController',
      namespace: 'memory-recall',
      method: 'connQuery',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-recall#memory-recall/connQuery:input',
            create: jsonValue$schema,
          },
        }

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-recall#JsonValue',
        create: jsonValue$schema,
      },
    }
  ],
}

export default TYPERT
