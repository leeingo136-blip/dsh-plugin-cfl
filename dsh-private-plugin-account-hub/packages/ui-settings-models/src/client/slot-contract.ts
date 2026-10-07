/**
 * Models-page extension slots — the two seats through which a plugin
 * distributed outside this repository adds UI to the Models settings section
 * without editing it.
 *
 * `settings.models.provider-card` is keyed by the row's owning settings
 * namespace (`ProviderDirectoryEntry.settingsNs`): an adapter family's
 * companion plugin registers one entry under the family's namespace and
 * receives every card of that family — shipped, added, and hand-declared rows
 * alike — while the section never learns what the namespace means. Keying on
 * the namespace follows `settings.plugin.item`, and the key domain stays the
 * open string space because hand-declared route ids are user-chosen at
 * runtime.
 *
 * TYPE HOME RATIONALE: the Models section declares these slots at runtime,
 * and a plugin registering an extension already depends on this package for
 * the declaration. The types therefore live with their declarer.
 */

import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ProviderDirectoryEntry } from './store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One provider card's adapter extension area, dispatched with
     * `entryKey = settingsNs` inside an opened provider editor only — a saved
     * row's editor (opened via the edit control; the first-run setup posture
     * is an editor already open) and the add-provider draft card. A closed
     * row renders no extension area: the settings surface appears only when
     * the user asks to edit. The hand-declared draft card has no directory
     * row yet, so it dispatches nothing until saved. Without a registrant the
     * area renders nothing. Account plugins register one keyed entry per
     * opted-in account namespace (the hub adds and retires them as accounts
     * come and go).
     *
     * Inside an editor with a model catalog the seat dispatches twice per
     * open, once per `zone`: `editor` renders above the catalog's top rule
     * (prose and helpers), `catalog` renders inside the catalog block under
     * that rule (controls that belong with the list). Occurrences without a
     * zone (the first-run setup card, the add draft) are single legacy
     * dispatches; an occupant that ignores zones renders once there.
     */
    'settings.models.provider-card': { kind: 'keyed'; scope: 'root'; owner: ProviderCardExtrasOwnerProps }
    // The `settings.models.sign-in` slot is declared (runtime and types) by
    // the account settings section in the harness repository; it is not part
    // of this contract.
    /**
     * Ordered extension area after the provider rows and the add controls.
     * Without a registrant the area renders nothing.
     */
    'settings.models.footer': { kind: 'list'; scope: 'root'; owner: ModelsFooterOwnerProps }
  }
}

/** Draft access one opened editor exposes to its seat occupants: reads and
 *  writes the editor's pending draft (the user-section subtree at the route's
 *  settings path). Writes stay local until the editor's own save control
 *  commits them as path ops, so an occupant's edits ride the same save,
 *  cancel, and revision fence as every curated field. */
export interface ProviderCardEditorAccess {
  /** The drafted value at `path`, or undefined when absent. */
  getPath(path: readonly string[]): JsonValue | undefined
  /** Write `value` at `path` in the draft. */
  setPath(path: readonly string[], value: unknown): void
}

/** Owner share of one provider-card extension occurrence. */
export interface ProviderCardExtrasOwnerProps {
  /** The card's directory row (route id, display name, settings address, live state). */
  provider: ProviderDirectoryEntry
  /** Whether any layer configures this provider (its profile resolves); `false` while the add-provider draft edits a dormant row. */
  configured: boolean
  /** Whether the row's referenced api-key credential is confirmed configured (the page's credential join). */
  keyConfigured: boolean
  /** Present only when the seat is dispatched inside an opened provider
   *  editor: lets an occupant bind its controls to the editor's draft so the
   *  editor's own save and cancel own the commit. */
  editor?: ProviderCardEditorAccess
  /** Which area of the opened editor this occurrence occupies: `editor` sits
   *  above the model catalog's top rule, `catalog` inside the catalog block
   *  under that rule. Absent on the single legacy dispatches (first-run setup
   *  card, add draft) where one occurrence renders everything. */
  zone?: 'editor' | 'catalog'
}

/** Owner share of the footer area (the section supplies nothing). */
export interface ModelsFooterOwnerProps {
  /** Marker field: footer owner props are intentionally empty. */
  children?: never
}
