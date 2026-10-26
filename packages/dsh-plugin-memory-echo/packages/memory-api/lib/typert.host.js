/* Generated for @dsh/api-memory-echo — hand-maintained manifest, JsonValue wire contracts. */
import { z } from 'zod'

  let jsonValue$schema$value
  const jsonValue$schema = () => (jsonValue$schema$value ??= z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => jsonValue$schema())), z.record(z.string(), z.lazy(() => jsonValue$schema()))]))

export const TYPERT = {
  package: '@dsh/api-memory-echo',
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
        "key": "memoryEchoController",
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
      id: '@dsh/api-memory-echo#memory-echo/connList',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'connList',
      invocation: { kind: 'direct' },
      parameters: [

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-echo#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-memory-echo#memory-echo/connCreate',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'connCreate',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#memory-echo/connCreate:input',
            create: jsonValue$schema,
          },
        }

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-echo#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-memory-echo#memory-echo/connUpdate',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'connUpdate',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#memory-echo/connUpdate:input',
            create: jsonValue$schema,
          },
        }

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-echo#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-memory-echo#memory-echo/connDelete',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'connDelete',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#memory-echo/connDelete:input',
            create: jsonValue$schema,
          },
        }

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-echo#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-memory-echo#memory-echo/embeddingModels',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'embeddingModels',
      invocation: { kind: 'direct' },
      parameters: [

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-echo#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-memory-echo#memory-echo/connQuery',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'connQuery',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#memory-echo/connQuery:input',
            create: jsonValue$schema,
          },
        }

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-echo#JsonValue',
        create: jsonValue$schema,
      },
    }
  ],
}

export default TYPERT
