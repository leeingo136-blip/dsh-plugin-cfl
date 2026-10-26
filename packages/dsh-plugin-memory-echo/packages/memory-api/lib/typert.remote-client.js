/* Generated for @dsh/api-memory-echo — hand-maintained manifest, JsonValue wire contracts. */
import { z } from 'zod'

  let jsonValue$schema$value
  const jsonValue$schema = () => (jsonValue$schema$value ??= z.union([z.literal(null), z.string(), z.number(), z.literal(false), z.literal(true), z.array(z.lazy(() => jsonValue$schema())), z.record(z.string(), z.lazy(() => jsonValue$schema()))]))

const TYPERT_REMOTE = {
  package: '@dsh/api-memory-echo',
  descriptors: [
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
    },
    {
      id: '@dsh/api-memory-echo#memory-echo/generatePresets',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'generatePresets',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-echo#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-memory-echo#memory-echo/workspaceOptions',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'workspaceOptions',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-echo#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-memory-echo#memory-echo/presetOptions',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'presetOptions',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-echo#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-memory-echo#memory-echo/createCharacterSession',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'createCharacterSession',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/createCharacterPreset',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'createCharacterPreset',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/importSeedToDb',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'importSeedToDb',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/openDatabaseLocation',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'openDatabaseLocation',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/cardState',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'cardState',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/cardDisposition',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'cardDisposition',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/setCardDisposition',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'setCardDisposition',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/emotionChangeLog',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'emotionChangeLog',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/databaseFiles',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'databaseFiles',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: '@dsh/api-memory-echo#JsonValue',
        create: jsonValue$schema,
      },
    },
    {
      id: '@dsh/api-memory-echo#memory-echo/loadDatabase',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'loadDatabase',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/setSelfState',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'setSelfState',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/listEntities',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'listEntities',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/saveEntity',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'saveEntity',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/deleteEntity',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'deleteEntity',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/listMemories',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'listMemories',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/addMemory',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'addMemory',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/deleteMemory',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'deleteMemory',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/setEntityState',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'setEntityState',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@dsh/api-memory-echo#JsonValue',
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
      id: '@dsh/api-memory-echo#memory-echo/dreamList',
      service: 'memoryEchoController',
      namespace: 'memory-echo',
      method: 'dreamList',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: '@dsh/api-memory-echo#JsonValue', create: jsonValue$schema },
        }
      ],
      result: { mode: 'strict', typeSymbol: '@dsh/api-memory-echo#JsonValue', create: jsonValue$schema },
    },
  ],
}

export default TYPERT_REMOTE
export { TYPERT_REMOTE }
