/* Generated for @dsh/api-knowledge-book — hand-maintained manifest, JsonValue wire contracts. */
import { z } from 'zod'

  let jsonValue$schema$value
  const jsonValue$schema = () => (jsonValue$schema$value ??= z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => jsonValue$schema())), z.record(z.string(), z.lazy(() => jsonValue$schema()))]))

const TYPERT_REMOTE = {
  package: '@dsh/api-knowledge-book',
  descriptors: [
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

export default TYPERT_REMOTE
export { TYPERT_REMOTE }
