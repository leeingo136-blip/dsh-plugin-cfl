/** Shared contracts between dsh-account-hub and the account plugins it hosts. */
import type { JsonValue } from '@deepseek-ai/dsh-util-values';
/** One choice of a select field on the hub-rendered card. */
export interface AccountHubSelectOption {
    /** Stored value written into the settings namespace. */
    value: string;
    /** Visible label. */
    label: string;
}
/** One input inside a dialog field's modal. */
export interface AccountHubDialogInput {
    /** Value address: the input's key inside the submitted values. */
    key: string;
    kind: 'text' | 'password' | 'select';
    /** Visible label above the input. */
    label: string;
    /** Empty-state hint inside the input. */
    placeholder?: string;
    /** select only: fixed choices. An option carrying `when` renders only
     *  while the sibling input named by this input's `dependsOn` holds that
     *  value — the declarative cascade (region choices keyed by plan). */
    options?: readonly {
        /** Stored value written into the submitted values. */
        value: string;
        /** Visible label. */
        label: string;
        /** Show only while the `dependsOn` input holds this value. */
        when?: string;
    }[];
    /** select only: the sibling input key whose current value filters this
     *  select's `when`-tagged options. Omit for an unconditional select. */
    dependsOn?: string;
}
/**
 * The modal a dialog field opens. Submitting fires the field's action with
 * the entered values merged into the card's current values; the action's
 * result message renders inside the modal, and `close: true` dismisses it
 * after a short beat so the outcome stays readable.
 */
export interface AccountHubDialogDescriptor {
    /** Modal heading; defaults to the field's label. */
    title?: string;
    /** Inputs the modal renders, in order. */
    fields: readonly AccountHubDialogInput[];
    /** Submit button label; defaults to the field's label. */
    submitLabel?: string;
}
/** Which control a declarative card field renders as. */
export type AccountHubFieldKind = 'text' | 'password' | 'checkbox' | 'select' | 'button' | 'dialog' | 'note';
/** Which settings surface a declarative card field renders on. */
export type AccountHubSurface = 'account' | 'models';
/**
 * One declarative control on the card the hub renders for the plugin. The
 * plugin describes; the hub draws. Every non-button field's value lives at
 * its key in the account's settings namespace. A select without static
 * options loads them through invoke('options', { field }); a button fires
 * its plugin-private action through invoke and may return option updates.
 */
export interface AccountHubFieldDescriptor {
    /** Value address: the field's key in the account's settings namespace. */
    key: string;
    kind: AccountHubFieldKind;
    /** Visible label. */
    label: string;
    /** Where the field shows: the settings account column, the models-page
     *  provider card, or both. Omit for both. */
    surface?: AccountHubSurface;
    /** Restrict the field to one credential state: visible only while the
     *  account's state reports that signedIn value; omit for always. */
    when?: 'signed-in' | 'signed-out';
    /** models surface only: render this field inside the model catalog block
     *  (under its top rule, above the catalog heading) instead of the editor
     *  area above the rule — for controls that belong with the list, like a
     *  source selector feeding the fetch action. Absent keeps the field in the
     *  editor area. Ignored outside the models page. */
    placement?: 'catalog';
    /** Optional helper copy rendered under the control. */
    description?: string;
    /** text/password only: empty-state hint inside the input. */
    placeholder?: string;
    /** select only: fixed choices; omit to serve them via invoke('options'). */
    options?: readonly AccountHubSelectOption[];
    /** select only: render the choices as a filterable dropdown — the search
     *  input lives inside the opened panel, above the option list, narrowing
     *  choices by label/value (case-insensitive). The stored value stays
     *  selectable even when filtered out, so a saved choice never reads as
     *  "nothing chosen". */
    searchable?: boolean;
    /** select only: commit the picked value to the stored params immediately
     *  on selection, without the card's save control. Reopening the card then
     *  pre-fills the saved choice as the default. */
    autoSave?: boolean;
    /** select only: when the card renders inside an editor that exposes draft
     *  access, a bound select edits this config key (relative to the route
     *  root) in the editor's own draft; the editor's save control commits it.
     *  Unbound selects keep the stored-params flow. */
    bind?: string;
    /** button only: plugin-private invoke method fired on click. */
    action?: string;
    /** button only: visual weight; 'primary' renders the accent button. */
    tone?: 'default' | 'primary';
    /** button only: label shown while the action runs. */
    busyLabel?: string;
    /** dialog only: the modal the field opens (inputs + submit copy). */
    dialog?: AccountHubDialogDescriptor;
}
/**
 * Declarative settings card the hub renders on the plugin's behalf. Present
 * on a registration, the hub draws the account row entirely from this
 * description — the plugin ships no browser code; the descriptor, the
 * values in its settings namespace, and its invoke seam are the whole
 * surface.
 */
export interface AccountHubCardDescriptor {
    /** Controls in render order. */
    fields: readonly AccountHubFieldDescriptor[];
}
/**
 * How an account plugin's provider reaches its LLM. Declaring it keeps the
 * inference topology explicit and auditable:
 *
 * - `credential-inject`: the plugin stays on the harness's shared inference
 *   path. Its adapter resolves the request onto an existing harness adapter
 *   family (e.g. the official DeepSeek adapter) and only supplies the
 *   necessary parameters — credentials, tokens, endpoint facts. Harness
 *   connects, streams, and meters exactly as it does for a native provider.
 * - `direct`: the plugin's adapter itself talks to its API (or fabricates a
 *   reply) and hands the LLM response back to harness as a `StreamChunk`
 *   stream. Harness still owns the agent loop, persistence, and rendering;
 *   the plugin owns the wire.
 */
export type AccountHubWorkMode = 'credential-inject' | 'direct';
/**
 * Which capability family the account serves. The hub uses it to place the
 * account's row into the matching section of the settings column, so a
 * non-chat account (an embedding provider, a TTS or ASR engine) never reads
 * as a conversation model. Registrations may omit it; the hub resolves the
 * omission to `'chat'`, which keeps every earlier account plugin in the
 * conversation section unchanged.
 */
export type AccountHubType = 'chat' | 'embedding' | 'tts' | 'asr';
/** Every type value the hub accepts; anything else fails registration. */
export declare const ACCOUNT_HUB_TYPES: readonly AccountHubType[];
/**
 * One account plugin's registration with the hub. The plugin provides a
 * stable id (also the slot key and the invoke target), a display name for
 * the account column, the settings namespace its provider parameters land
 * in, and an invoke seam the hub forwards browser requests through. The
 * plugin keeps its own credentials and sign-in machinery; the hub never
 * sees secrets.
 */
export interface AccountHubRegistration {
    /** Stable account identity: slot key, invoke target, and settings pairing. */
    id: string;
    /** Display name shown as the row heading in the settings account column. */
    displayName: string;
    /** Settings namespace the hub writes this account's provider params into. */
    settingsNs: string;
    /** The model-page provider id this account backs (e.g. 'deepseek-account');
     *  set it so the hub can serve the models-page provider card too. */
    provider?: string;
    /** How this account's provider reaches its LLM; every account plugin must
     *  declare it at registration. */
    workMode: AccountHubWorkMode;
    /** Capability family this account serves (`'chat'` when omitted); the hub
     *  groups the settings column by it. */
    type?: AccountHubType;
    /** Serve the models-page provider card (the card's 'models'-surface fields)
     *  under this account's provider row. Off by default, so account plugins
     *  whose models page is drawn by another editor stay untouched. */
    modelsCard?: boolean;
    /**
     * Declarative settings card for the hub to render. Omit it only when the
     * plugin contributes its own row through the `account.hub.row` slot.
     */
    card?: AccountHubCardDescriptor;
    /**
     * Forward one browser-initiated account operation (sign-in, sign-out,
     * balance refresh, option load, card button, …) to the plugin. Method
     * names are plugin-private; the hub only transports them.
     */
    invoke(method: string, args: JsonValue): Promise<JsonValue>;
    /**
     * Latest published state for the account column row. Called on every
     * listing and after the plugin emits the hub's changed event; return a
     * JSON-safe value opaque to the hub.
     */
    getState?(): JsonValue;
}
/** One hosted account's browser-facing view. */
export interface AccountHubAccountView {
    id: string;
    displayName: string;
    settingsNs: string;
    /** How the account's provider reaches its LLM, as declared at registration. */
    workMode: AccountHubWorkMode;
    /** Resolved capability family (an omitted registration type reads as
     *  `'chat'`); the section groups rows by it. */
    type: AccountHubType;
    /** Declarative card the hub renders when present. */
    card?: AccountHubCardDescriptor;
    /** Whether the hub also serves this account's models-page provider card. */
    modelsCard?: boolean;
    /** Latest state the plugin published, opaque to the hub. */
    state?: JsonValue;
}
/** One account state change pushed through the watch stream. */
export interface AccountHubChange {
    id: string;
    state?: JsonValue;
}
/** One balance-card row: a labelled amount, a loading placeholder, or a
 *  fallback link when the read failed (the user inspects it on Platform). */
export interface AccountHubBalanceRow {
    /** Row label, e.g. the localized 'Balance'. */
    label: string;
    /** Pre-formatted amount string (e.g. '¥12.34'); absent while loading. */
    value?: string;
    /** True while the wallet read is in flight; the hub renders its loading copy. */
    loading?: boolean;
    /** Rendered instead of an amount when the read failed. */
    unavailable?: {
        label: string;
        href: string;
    };
}
/** One 'more' row: a label plus outward platform links and plugin actions. */
export interface AccountHubMoreRow {
    label: string;
    links: readonly {
        label: string;
        /** Outward navigation target; omit when the entry is a plugin action. */
        href?: string;
        primary?: boolean;
        /** Plugin-private invoke method fired on click instead of navigating;
         *  the state push after the invoke refreshes the card. */
        action?: string;
    }[];
}
/** One read-only detail row: a labelled fact rendered as plain key-value
 *  text — both sides in the row's base font (unlike balance rows, whose
 *  amount side renders large). For configuration facts like the effective
 *  endpoint that are set elsewhere, not wallet state. */
export interface AccountHubDetailRow {
    /** Row label, e.g. the localized 'Endpoint preset'. */
    label: string;
    /** The fact's display value. */
    value: string;
}
/**
 * The state shape the hub's generic card understands beyond the plain status
 * line. getState() may return this (all fields optional; unknown keys are
 * ignored) and the account column draws the signed-in layout with it: an
 * identity card (avatar, name, contact, platform link) and a balance card.
 */
export interface AccountHubCardState {
    /** Status-line copy (the hub's fallback identity text). */
    text?: string;
    level?: 'ok' | 'warn' | 'error';
    /** True once the account holds a stored credential. */
    signedIn?: boolean;
    /** True while a browser sign-in attempt is in flight: the hub hides the
      * sign-in affordance and shows the progress copy instead. */
    signingIn?: boolean;
    /** Brand facts the hub draws as the card's fixed identity: the plugin's
      * bundled logo (data URI) and label — shown signed-out and signed-in. */
    brand?: {
        logoUrl?: string | undefined;
        name: string;
    };
    /** Signed-in identity card facts; the layout renders only when present. */
    identity?: {
        name?: string | undefined;
        contact?: string | undefined;
        avatarUrl?: string | undefined;
        infoLabel?: string | undefined;
        infoUrl?: string | undefined;
    };
    /** Signed-in balance card rows. */
    balance?: {
        rows?: readonly AccountHubBalanceRow[];
        more?: readonly AccountHubMoreRow[];
    };
    /** Signed-in read-only fact rows, drawn between the balance rows and the
     *  more rows; both sides in the base font. Absent draws nothing. */
    details?: {
        rows?: readonly AccountHubDetailRow[];
    };
}
/** Browser-safe failure vocabulary of the hub's remote face. */
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface RemoteErrorDetailsMap {
        /** No account plugin is registered under the requested id. */
        'account-hub/unknown-account': {
            readonly id: string;
        };
        /** The hub registry service is not mounted. */
        'account-hub/unavailable': {};
        /** The target plugin's operation rejected; the message is plugin-owned. */
        'account-hub/invoke-failed': {
            readonly accountId: string;
            readonly method: string;
        };
        /** The settings service is not mounted, so parameters cannot be written. */
        'account-hub/settings-unavailable': {
            readonly accountId: string;
        };
        /** The settings write for the plugin's namespace failed. */
        'account-hub/commit-failed': {
            readonly accountId: string;
        };
    }
}
//# sourceMappingURL=types.d.ts.map