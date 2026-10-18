/* Generated for @dsh/api-library — hand-maintained manifest, JsonValue wire contracts. */
import { z } from 'zod'

  let jsonValue$schema$value
  const jsonValue$schema = () => (jsonValue$schema$value ??= z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => jsonValue$schema())), z.record(z.string(), z.lazy(() => jsonValue$schema()))]))

export const TYPERT = {
  package: '@dsh/api-library',
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
        "key": "libraryController",
        "exportName": "LibraryController",
        "members": [
          {
            "kind": "method",
            "name": "ragList",
            "signature": "ragList(): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "ragCreate",
            "signature": "ragCreate(input: JsonValue): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "ragDelete",
            "signature": "ragDelete(input: JsonValue): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "ragIngest",
            "signature": "ragIngest(input: JsonValue): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "ragQuery",
            "signature": "ragQuery(input: JsonValue): Promise<JsonValue>"
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
      id: '@dsh/api-library#library/ragList',
      service: 'libraryController',
      namespace: 'library',
      method: 'ragList',
      invocation: { kind: 'direct' },
      parameters: [

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-library#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-library#library/ragCreate',
      service: 'libraryController',
      namespace: 'library',
      method: 'ragCreate',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-library#library/ragCreate:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-library#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-library#library/ragDelete',
      service: 'libraryController',
      namespace: 'library',
      method: 'ragDelete',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-library#library/ragDelete:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-library#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-library#library/ragIngest',
      service: 'libraryController',
      namespace: 'library',
      method: 'ragIngest',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-library#library/ragIngest:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-library#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-library#library/ragQuery',
      service: 'libraryController',
      namespace: 'library',
      method: 'ragQuery',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-library#library/ragQuery:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-library#JsonValue',
        create: jsonValue$schema,
      },
    }
  ],
}

export default TYPERT
