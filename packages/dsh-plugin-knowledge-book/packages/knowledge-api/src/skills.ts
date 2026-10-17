/**
 * Skill file management over the official discovery roots.
 *
 * The plugin manages the same files the official `dsh-skill-filesystem`
 * provider scans — nothing more. Listing, reading, writing, moving, and
 * deleting all happen through the documented roots and the documented
 * `<name>/SKILL.md` (or flat `<name>.md`) layout; the provider's watcher
 * picks every change up and republishes the session catalog on its own.
 *
 * Sources (v1):
 * - 全局      → ~/.dsh/skills                     (editable)
 * - 工作空间  → <workspace>/.dsh/skills            (editable, per workspace)
 * - 插件      → $DSH_BUNDLED_SKILL_DIR             (read-only, build output)
 * - 运行时    → in-memory registrations            (read-only, via ctx.skills)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'

/** One manageable skill entry as serialized over the wire. */
export interface SkillEntry {
  name: string
  description: string
  sourceId: string
  sourceLabel: string
  editable: boolean
  /** Directory form (`<name>/SKILL.md`) vs flat form (`<name>.md`). */
  form: 'dir' | 'flat' | 'runtime'
  /** Absolute skill file path for file-backed entries. */
  path?: string
  body?: string
}

/** One discovery root exposed to the UI as a source. */
export interface SkillSource {
  id: string
  label: string
  kind: 'global' | 'workspace' | 'bundled' | 'runtime'
  editable: boolean
  dir?: string
}

interface WorkspaceLike {
  list(): Array<{ record: { path: string; title?: string } }>
}
export type { WorkspaceLike }

/** Minimal YAML frontmatter reader: name/description scalars only. */
function parseFrontmatter(raw: string): { name?: string; description?: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (match === null) return { body: raw }
  const head = match[1] ?? ''
  const read = (key: string): string | undefined => {
    const line = head.split('\n').find(one => one.startsWith(`${key}:`))
    if (line === undefined) return undefined
    let value = line.slice(key.length + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    return value === '' ? undefined : value
  }
  const name = read('name')
  const description = read('description')
  return {
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
    body: raw.slice(match[0].length),
  }
}

/** The catalog description derives from the body's first meaningful line. */
function descriptionOf(body: string): string {
  const line = body.split('\n').map(one => one.trim()).find(one => one !== '')
  const text = (line ?? '').replace(/^#+\s*/, '')
  return text.length > 200 ? `${text.slice(0, 197)}…` : text
}

/** Render one skill file: official frontmatter (name + description) + body.
 *  A body that already carries frontmatter is unwrapped; its description wins. */
function renderSkillFile(name: string, body: string): string {
  const parsed = parseFrontmatter(body)
  const text = (parsed.description ?? descriptionOf(parsed.body)).replaceAll('"', "'")
  return `---\nname: ${name}\ndescription: "${text}"\n---\n\n${parsed.body.trimStart()}`
}

/** Kebab-case any user-typed name; empty (e.g. pure CJK) yields a dated stem. */
export function sanitizeSkillName(raw: string): string {
  const slug = raw.trim().toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
  if (slug !== '') return slug
  // Official grammar is ASCII kebab-case; a name that reduces to nothing
  // still needs a valid, unique directory stem.
  return `skill-${Date.now().toString(36)}`
}

/**
 * Resolve a name collision inside one root the way the registry's own
 * grammar allows: keep kebab-case and append `-2`, `-3`, … until free.
 */
export function resolveConflict(root: string, name: string, form: 'dir' | 'flat'): string {
  const taken = (candidate: string): boolean =>
    form === 'dir' ? existsSync(join(root, candidate)) : existsSync(join(root, `${candidate}.md`))
  if (!taken(name)) return name
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${name}-${index}`
    if (!taken(candidate)) return candidate
  }
  return `${name}-${Date.now()}`
}

/** Read every skill in one directory root (both official forms). */
function scanRoot(source: SkillSource): SkillEntry[] {
  const dir = source.dir
  const entries: SkillEntry[] = []
  if (dir === undefined || !existsSync(dir)) return entries
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue
    if (item.isDirectory()) {
      const path = join(dir, item.name, 'SKILL.md')
      if (!existsSync(path)) continue
      const parsed = parseFrontmatter(readFileSync(path, 'utf8'))
      entries.push({
        name: parsed.name ?? item.name,
        description: parsed.description ?? '',
        sourceId: source.id,
        sourceLabel: source.label,
        editable: source.editable,
        form: 'dir',
        path,
      })
    } else if (item.name.endsWith('.md')) {
      const path = join(dir, item.name)
      const parsed = parseFrontmatter(readFileSync(path, 'utf8'))
      entries.push({
        name: parsed.name ?? basename(item.name, '.md'),
        description: parsed.description ?? '',
        sourceId: source.id,
        sourceLabel: source.label,
        editable: source.editable,
        form: 'flat',
        path,
      })
    }
  }
  return entries
}

/** The workspace registry carries every registered workspace root. */
export function skillSources(workspaces: WorkspaceLike): SkillSource[] {
  const sources: SkillSource[] = []
  const globalDir = join(homedir(), '.dsh', 'skills')
  sources.push({ id: 'global', label: '全局', kind: 'global', editable: true, dir: globalDir })
  let workspaceSeen = false
  try {
    for (const entity of workspaces.list()) {
      const path = entity.record.path
      if (typeof path !== 'string' || path === '') continue
      workspaceSeen = true
      const title = entity.record.title ?? basename(path)
      sources.push({
        id: `workspace:${path}`,
        label: `工作空间：${title}`,
        kind: 'workspace',
        editable: true,
        dir: join(path, '.dsh', 'skills'),
      })
    }
  } catch {
    // The registry can be mid-boot; file sources below still work.
  }
  void workspaceSeen
  const bundledDir = process.env.DSH_BUNDLED_SKILL_DIR
  if (typeof bundledDir === 'string' && bundledDir !== '') {
    sources.push({ id: 'bundled', label: '插件', kind: 'bundled', editable: false, dir: bundledDir })
  }
  sources.push({ id: 'runtime', label: '会话', kind: 'runtime', editable: false })
  return sources
}

/** Full listing: file-backed entries from the roots + runtime registrations. */
export function listSkills(
  sources: SkillSource[],
  runtimeSkills: Array<{ name: string; description: string; source?: string }>,
): SkillEntry[] {
  const entries: SkillEntry[] = []
  for (const source of sources) {
    if (source.kind === 'runtime') continue
    entries.push(...scanRoot(source))
  }
  const fileNames = new Set(entries.map(one => one.name))
  for (const skill of runtimeSkills) {
    if (fileNames.has(skill.name)) continue
    entries.push({
      name: skill.name,
      description: skill.description,
      sourceId: 'runtime',
      sourceLabel: skill.source !== undefined && skill.source !== '' && skill.source !== 'runtime'
        ? `会话：${skill.source}`
        : '会话',
      editable: false,
      form: 'runtime',
    })
  }
  return entries.sort((left, right) =>
    left.sourceLabel.localeCompare(right.sourceLabel) || left.name.localeCompare(right.name))
}

/** Body of one skill: file-backed entries read from disk, runtime via the registry. */
export function readSkillBody(entry: SkillEntry, registryRead?: (name: string) => string | undefined): string {
  if (entry.path !== undefined && existsSync(entry.path)) {
    return parseFrontmatter(readFileSync(entry.path, 'utf8')).body
  }
  return registryRead?.(entry.name) ?? ''
}

export interface SaveRequest {
  /** Empty when creating a new skill. */
  fromName?: string
  fromSourceId?: string
  fromForm?: 'dir' | 'flat'
  targetSourceId: string
  name: string
  body: string
}

export interface SaveResult {
  name: string
  sourceId: string
  sourceLabel: string
  renamed: boolean
  moved: boolean
  created: boolean
}

/**
 * Create or update one skill, optionally moving it between sources. A name
 * collision at the target is resolved by the kebab-case suffix rule; the
 * caller learns the final name from the result.
 */
export function saveSkill(sources: SkillSource[], request: SaveRequest): SaveResult {
  const target = sources.find(one => one.id === request.targetSourceId)
  if (target === undefined || !target.editable || target.dir === undefined) {
    throw new Error(`来源不可写（${request.targetSourceId}）`)
  }
  const safeName = sanitizeSkillName(request.name)
  const updating = request.fromName !== undefined && request.fromSourceId === request.targetSourceId
  let finalName = safeName
  let renamed = false
  if (updating && request.fromName !== safeName) {
    // Rename within the same source: the new name must simply be free.
    finalName = resolveConflict(target.dir, safeName, 'dir')
    renamed = finalName !== safeName
  } else if (!updating) {
    finalName = resolveConflict(target.dir, safeName, 'dir')
    renamed = finalName !== safeName
  }
  const content = renderSkillFile(finalName, request.body)
  mkdirSync(target.dir, { recursive: true })
  const newPath = join(target.dir, finalName, 'SKILL.md')
  const oldDirForm = request.fromName !== undefined && request.fromSourceId !== undefined
    ? sources.find(one => one.id === request.fromSourceId)?.dir
    : undefined
  const oldPath = request.fromName !== undefined && oldDirForm !== undefined
    ? join(oldDirForm, request.fromName, 'SKILL.md')
    : undefined
  const moved = oldPath !== undefined && oldPath !== newPath
  if (moved && oldPath !== undefined && existsSync(oldPath)) {
    mkdirSync(join(newPath, '..'), { recursive: true })
    writeFileSync(newPath, content)
    rmSync(join(oldPath, '..'), { recursive: true, force: true })
  } else {
    mkdirSync(join(newPath, '..'), { recursive: true })
    writeFileSync(newPath, content)
  }
  return {
    name: finalName,
    sourceId: target.id,
    sourceLabel: target.label,
    renamed,
    moved,
    created: request.fromName === undefined,
  }
}

/** Remove one file-backed skill (directory form). Runtime and bundled reject. */
export function deleteSkill(sources: SkillSource[], sourceId: string, name: string): void {
  const source = sources.find(one => one.id === sourceId)
  if (source === undefined || !source.editable || source.dir === undefined) {
    throw new Error(`来源不可删除（${sourceId}）`)
  }
  const path = join(source.dir, name)
  if (existsSync(path)) rmSync(path, { recursive: true, force: true })
  const flat = `${path}.md`
  if (existsSync(flat)) rmSync(flat, { force: true })
}
