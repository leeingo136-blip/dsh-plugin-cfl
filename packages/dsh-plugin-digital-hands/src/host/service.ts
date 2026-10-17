/**
 * Digital Hands settings service: plan-file CRUD plus delegations to the
 * capabilities the main component attaches at apply time. Kept as a plain
 * provided object (no fiber of its own) — the component's own effect owns
 * teardown, and the service only forwards.
 *
 * Plan files are YAML documents under `$DSH_HOME/digital-hands/plans/`, the
 * same directory the plan loader reads. The UI edits exactly what a hand
 * edit would, so both entry points stay interchangeable.
 */

import { readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parsePlan, plansRoot } from '../plan.ts'
import type { DhMcpStatus, DhPlanView, DhProbeResult, DhToolRow } from './types.ts'

/** The face the main component attaches after its apply resolves. */
export interface DigitalHandsCapabilities {
  /** Full catalog snapshot: natively mounted + managed tools. */
  snapshot(): { native: DhToolRow[]; managed: DhToolRow[] }
  /** Live managed-server states. */
  mcpStatus(): DhMcpStatus[]
  /** Tear down every managed registration and remount from the plan files. */
  reload(): Promise<void>
  /** Connect to a candidate server, list its tools, close. */
  probe(spec: unknown): Promise<DhProbeResult>
}

export class DigitalHandsService {
  private caps: DigitalHandsCapabilities | undefined
  /** Plan names mounted in this run (filled by the main component). */
  activePlans: string[] = []

  attach(caps: DigitalHandsCapabilities): void {
    this.caps = caps
  }

  private requireCaps(): DigitalHandsCapabilities {
    if (this.caps === undefined) {
      throw new Error('数字手组件尚未完成初始化。')
    }
    return this.caps
  }

  snapshot(): { native: DhToolRow[]; managed: DhToolRow[] } {
    return this.requireCaps().snapshot()
  }

  mcpStatus(): DhMcpStatus[] {
    return this.requireCaps().mcpStatus()
  }

  async reload(): Promise<void> {
    await this.requireCaps().reload()
  }

  async probe(spec: unknown): Promise<DhProbeResult> {
    return this.requireCaps().probe(spec)
  }

  // --- plan file CRUD ------------------------------------------------------

  /** List every plan file with its parsed summary. Unparsable files still
   *  show up (empty counts) so the UI can surface the broken document. */
  async listPlans(): Promise<DhPlanView[]> {
    const root = plansRoot()
    let files: string[] = []
    try {
      files = (await readdir(root)).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort()
    } catch {
      return []
    }
    const views: DhPlanView[] = []
    for (const file of files) {
      const name = file.replace(/\.ya?ml$/, '')
      const full = join(root, file)
      try {
        const yaml = await readFile(full, 'utf8')
        const plan = parsePlan(yaml, name)
        views.push({
          name,
          yaml,
          active: this.activePlans.includes(name),
          servers: plan.servers.length,
          scripts: plan.scripts.length,
        })
      } catch (error) {
        views.push({
          name,
          yaml: await readFile(full, 'utf8').catch(() => ''),
          active: false,
          servers: 0,
          scripts: 0,
          ...(error instanceof Error ? { yaml: `# 解析失败：${error.message}\n` } : {}),
        })
      }
    }
    return views
  }

  /** Write (or create) one plan file. The name becomes the file stem; it is
   *  sanitized so the write cannot escape the plans directory. */
  async savePlan(name: string, yaml: string): Promise<void> {
    const stem = sanitizeStem(name)
    if (stem === '') throw new Error('方案名只能包含字母、数字、连字符与下划线。')
    // Validate before writing: a broken plan must never land on disk.
    parsePlan(yaml, stem)
    const target = join(plansRoot(), `${stem}.yml`)
    const previous = join(plansRoot(), `${stem}.yaml`)
    await writeFile(target, yaml, 'utf8')
    // Normalize the extension: an old .yaml with the same stem is retired.
    if (previous !== target) {
      await rename(previous, target).catch(() => {})
    }
  }

  /** Remove one plan file. The implicit `default` may be deleted too; the
   *  component simply mounts without it on the next reload. */
  async deletePlan(name: string): Promise<void> {
    const stem = sanitizeStem(name)
    if (stem === '') throw new Error('方案名不合法。')
    await unlink(join(plansRoot(), `${stem}.yml`)).catch(async () => {
      await unlink(join(plansRoot(), `${stem}.yaml`)).catch(() => {})
    })
  }
}

/** Keep the file stem inside the plans directory: alphanumerics, - and _. */
function sanitizeStem(name: string): string {
  return name.trim().replace(/\.ya?ml$/i, '').replace(/[^a-zA-Z0-9_-]/g, '')
}
