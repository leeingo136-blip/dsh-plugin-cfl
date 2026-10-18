/* Generated for @dsh/api-skill-book — hand-maintained manifest, JsonValue wire contracts. */
import { z } from 'zod'

  let jsonValue$schema$value
  const jsonValue$schema = () => (jsonValue$schema$value ??= z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => jsonValue$schema())), z.record(z.string(), z.lazy(() => jsonValue$schema()))]))

const TYPERT_REMOTE = {
  package: '@dsh/api-skill-book',
  descriptors: [
    {
      id: '@dsh/api-skill-book#skill-book/skillSources',
      service: 'skillBookController',
      namespace: 'skill-book',
      method: 'skillSources',
      invocation: { kind: 'direct' },
      parameters: [

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-skill-book#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-skill-book#skill-book/skillList',
      service: 'skillBookController',
      namespace: 'skill-book',
      method: 'skillList',
      invocation: { kind: 'direct' },
      parameters: [

      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-skill-book#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-skill-book#skill-book/skillRead',
      service: 'skillBookController',
      namespace: 'skill-book',
      method: 'skillRead',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-skill-book#skill-book/skillRead:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-skill-book#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-skill-book#skill-book/skillSave',
      service: 'skillBookController',
      namespace: 'skill-book',
      method: 'skillSave',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-skill-book#skill-book/skillSave:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-skill-book#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-skill-book#skill-book/skillDelete',
      service: 'skillBookController',
      namespace: 'skill-book',
      method: 'skillDelete',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-skill-book#skill-book/skillDelete:input',
            create: jsonValue$schema,
          },
        }
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-skill-book#JsonValue',
        create: jsonValue$schema,
      },
    }
  ],
}

export default TYPERT_REMOTE
export { TYPERT_REMOTE }
