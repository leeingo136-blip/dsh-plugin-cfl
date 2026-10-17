/**
 * The browser-facing seam of Digital Hands: one typert remote namespace
 * (`digitalHands`) the settings UI calls through. Follows the SRC-mode
 * dispatch pattern of account-desktop-shim — the gateway derives wire
 * parameter names from the implementation's parameter names, so no generated
 * artifacts exist on either side.
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { DigitalHandsService } from './service.ts'
import type { DhMcpStatus, DhPlanView, DhProbeResult, DhStatus, DhToolRow } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    digitalHandsService: DigitalHandsService
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The provided settings service is not mounted. */
    'digital-hands/unavailable': {}
    /** The plan file was saved but the remount failed. */
    'digital-hands/reload-failed': { readonly name: string }
  }
}

export class DigitalHandsController extends TypertRemoteService {
  constructor(ctx: Context) {
    // Distinct service key from the provided `digitalHandsService`; the wire
    // namespace stays `digitalHands`.
    super(ctx, 'digitalHandsController', { namespace: 'digitalHands' })
  }

  private svc(): DigitalHandsService {
    const service: DigitalHandsService | undefined = this.ctx.get('digitalHandsService')
    if (service === undefined) {
      throw new RemoteError('digital-hands/unavailable', '数字手服务未挂载。', {})
    }
    return service
  }

  /** The full tool catalog: natively mounted + managed. */
  @Remote
  async listTools(): Promise<{ native: DhToolRow[]; managed: DhToolRow[] }> {
    return this.svc().snapshot()
  }

  /** Every plan file with content and mounted flags. */
  @Remote
  async listPlans(): Promise<DhPlanView[]> {
    return this.svc().listPlans()
  }

  /** Create or overwrite one plan file, then hot-reload the mounted set. */
  @Remote
  async savePlan(name: string, yaml: string): Promise<{ reloaded: boolean }> {
    await this.svc().savePlan(name, yaml)
    let reloaded = true
    try {
      await this.svc().reload()
    } catch (error) {
      // The file is saved; a failed remount is reported but not fatal — the
      // previous mount was torn down though, so surface the error loudly.
      reloaded = false
      throw new RemoteError(
        'digital-hands/reload-failed',
        `方案已保存，但重新挂载失败：${error instanceof Error ? error.message : String(error)}`,
        { name },
      )
    }
    return { reloaded }
  }

  /** Delete one plan file, then hot-reload the mounted set. */
  @Remote
  async deletePlan(name: string): Promise<{ reloaded: boolean }> {
    await this.svc().deletePlan(name)
    await this.svc().reload()
    return { reloaded: true }
  }

  /** Live managed-server states + summary counts. */
  @Remote
  async status(): Promise<DhStatus> {
    const service = this.svc()
    const mcp: DhMcpStatus[] = service.mcpStatus()
    const { managed } = service.snapshot()
    return {
      mcp,
      activePlans: [...service.activePlans],
      managedTools: managed.length,
    }
  }

  /** Connect to a candidate server spec (not yet saved), list tool names, close. */
  @Remote
  async testMcp(spec: unknown): Promise<DhProbeResult> {
    return this.svc().probe(spec)
  }
}
