/**
 * Skill Book host seam: skill file management across the official discovery
 * roots, exposed as the `skill-book` remote namespace. Registry entries
 * (runtime sessions, plugin-carried bundles) are read-only; file-backed roots
 * (global/user + per-workspace) are editable.
 *
 * Every method takes and returns plain JSON values, so the hand-written
 * Typert manifest (lib/typert.host.js) carries one reusable codec.
 */
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import zschema from '@deepseek-ai/schemastery'
import {
  deleteSkill, listSkills, readSkillBody, saveSkill, skillSources,
  type SkillEntry, type SkillSource, type WorkspaceLike,
} from './skills.ts'

export const name = 'skill-api'

/** The schema class instance type, nameable without dragging cosmokit in. */
type SchemaNode = InstanceType<typeof zschema>

/**
 * No runtime settings surface of our own (v1); the schema stays because the
 * loader always mounts one.
 */
export const Config = zschema.object({}) as unknown as SchemaNode


/** Plain-object projection for the wire: drops undefined fields. */
const asJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

/** Lazy service lookups the controller performs per call. */
interface HostContext {
  get<T = unknown>(name: string): T | undefined
}

/** The settings registry shape we read workspace-independent config through. */
interface SkillsRegistry {
  list(options?: unknown): Promise<Array<{ name: string; description: string; source?: string }>>
  get(name: string): Promise<{ content?: string } | undefined>
}

/**
 * Host service backing the generated `ctx.remote['skill-book']` namespace.
 * @typert service skillBookController
 */
export class SkillBookController extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'skillBookController', { namespace: 'skill-book' })
  }

  /** One lazy optional-service lookup, untyped at the boundary. */
  private svc<T>(name: string): T | undefined {
    return (this.ctx as unknown as HostContext).get<T>(name)
  }

  private workspaces(): WorkspaceLike {
    const registry = this.svc<WorkspaceLike>('workspaceRegistry')
    if (registry === undefined) throw new RemoteError('skill-book/workspace-unavailable', '工作区服务不可用', {})
    return registry
  }

  private sources(): SkillSource[] {
    return skillSources(this.workspaces())
  }

  /** Registry summaries (all providers), or empty when the stack is absent. */
  private async registrySkills(): Promise<Array<{
    name: string; description: string; provider?: string; source?: string
  }>> {
    const skills = this.svc<SkillsRegistry>('skills')
    if (skills === undefined) return []
    try {
      const all = await skills.list({})
      return all.map(one => {
        const raw = one as {
          name: string; description: string; provider?: unknown; source?: unknown
        }
        return {
          name: raw.name,
          description: raw.description,
          provider: typeof raw.provider === 'string' && raw.provider !== '' ? raw.provider : 'runtime',
          ...(typeof raw.source === 'string' && raw.source !== '' ? { source: raw.source } : {}),
        }
      })
    } catch {
      // Registry unavailable (no skill stack mounted): file listing still works.
      return []
    }
  }

  private async fullList(): Promise<SkillEntry[]> {
    return listSkills(this.sources(), await this.registrySkills())
  }

  private async entryFor(name: string, sourceId: string): Promise<SkillEntry> {
    const entry = (await this.fullList()).find(one => one.name === name && one.sourceId === sourceId)
    if (entry === undefined) throw new RemoteError('skill-book/skill-unknown', `技能不存在（${name}）`, {})
    return entry
  }

  /** Every manageable source, for the source dropdowns. */
  @Remote
  async skillSources(): Promise<JsonValue> {
    return asJson({ sources: this.sources() })
  }

  /** Every skill across all sources (file-backed + registry: runtime/plugin). */
  @Remote
  async skillList(): Promise<JsonValue> {
    return asJson({ skills: await this.fullList() })
  }

  /** Body of one skill (file-backed read from disk; runtime/plugin via the registry). */
  @Remote
  async skillRead(input: JsonValue): Promise<JsonValue> {
    const { name, sourceId } = input as { name: string; sourceId: string }
    const entry = await this.entryFor(name, sourceId)
    let body = readSkillBody(entry)
    if (body === '' && entry.form === 'runtime') {
      const skills = this.svc<SkillsRegistry>('skills')
      const loaded = await skills?.get(name)
      body = loaded?.content ?? ''
    }
    return asJson({ name: entry.name, description: entry.description, sourceId: entry.sourceId, body })
  }

  /**
   * Create or update one skill; moving between editable sources rides the
   * same call (fromSourceId + fromName identify the previous location).
   */
  @Remote
  async skillSave(input: JsonValue): Promise<JsonValue> {
    const request = input as unknown as Parameters<typeof saveSkill>[1]
    try {
      return asJson(saveSkill(this.sources(), request))
    } catch (error) {
      throw new RemoteError('skill-book/skill-save-failed',
        error instanceof Error ? error.message : String(error), {})
    }
  }

  /** Delete one file-backed skill from an editable source. */
  @Remote
  async skillDelete(input: JsonValue): Promise<JsonValue> {
    const { name, sourceId } = input as { name: string; sourceId: string }
    try {
      deleteSkill(this.sources(), sourceId, name)
      return asJson({ message: `已删除技能 ${name}` })
    } catch (error) {
      throw new RemoteError('skill-book/skill-delete-failed',
        error instanceof Error ? error.message : String(error), {})
    }
  }
}

export function apply(ctx: Context): void {
  ctx.plugin(SkillBookController)
}
