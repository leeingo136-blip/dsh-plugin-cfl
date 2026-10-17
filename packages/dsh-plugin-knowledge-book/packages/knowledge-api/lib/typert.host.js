/* Generated for @dsh/api-knowledge-book — hand-maintained manifest, JsonValue wire contracts. */
import { z } from 'zod'

  let jsonValue$schema$value
  const jsonValue$schema = () => (jsonValue$schema$value ??= z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => jsonValue$schema())), z.record(z.string(), z.lazy(() => jsonValue$schema()))]))

export const TYPERT = {
  package: '@dsh/api-knowledge-book',
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
        "key": "knowledgeController",
        "exportName": "KnowledgeController",
        "members": [
          {
            "kind": "method",
            "name": "skillSources",
            "signature": "skillSources(): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "skillList",
            "signature": "skillList(): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "skillRead",
            "signature": "skillRead(input: JsonValue): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "skillSave",
            "signature": "skillSave(input: JsonValue): Promise<JsonValue>"
          },
          {
            "kind": "method",
            "name": "skillDelete",
            "signature": "skillDelete(input: JsonValue): Promise<JsonValue>"
          },
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
      id: '@dsh/api-knowledge-book#knowledge/skillSources',
      service: 'knowledgeController',
      namespace: 'knowledge',
      method: 'skillSources',
      invocation: { kind: 'direct' },
      parameters: [

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-knowledge-book#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-knowledge-book#knowledge/skillList',
      service: 'knowledgeController',
      namespace: 'knowledge',
      method: 'skillList',
      invocation: { kind: 'direct' },
      parameters: [

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-knowledge-book#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-knowledge-book#knowledge/skillRead',
      service: 'knowledgeController',
      namespace: 'knowledge',
      method: 'skillRead',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-knowledge-book#knowledge/skillRead:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-knowledge-book#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-knowledge-book#knowledge/skillSave',
      service: 'knowledgeController',
      namespace: 'knowledge',
      method: 'skillSave',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-knowledge-book#knowledge/skillSave:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-knowledge-book#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-knowledge-book#knowledge/skillDelete',
      service: 'knowledgeController',
      namespace: 'knowledge',
      method: 'skillDelete',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-knowledge-book#knowledge/skillDelete:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-knowledge-book#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-knowledge-book#knowledge/ragList',
      service: 'knowledgeController',
      namespace: 'knowledge',
      method: 'ragList',
      invocation: { kind: 'direct' },
      parameters: [

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-knowledge-book#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-knowledge-book#knowledge/ragCreate',
      service: 'knowledgeController',
      namespace: 'knowledge',
      method: 'ragCreate',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-knowledge-book#knowledge/ragCreate:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-knowledge-book#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-knowledge-book#knowledge/ragDelete',
      service: 'knowledgeController',
      namespace: 'knowledge',
      method: 'ragDelete',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-knowledge-book#knowledge/ragDelete:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-knowledge-book#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-knowledge-book#knowledge/ragIngest',
      service: 'knowledgeController',
      namespace: 'knowledge',
      method: 'ragIngest',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-knowledge-book#knowledge/ragIngest:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-knowledge-book#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-knowledge-book#knowledge/ragQuery',
      service: 'knowledgeController',
      namespace: 'knowledge',
      method: 'ragQuery',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-knowledge-book#knowledge/ragQuery:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-knowledge-book#JsonValue',
        create: jsonValue$schema,
      },
    }
  ],
}

export default TYPERT
