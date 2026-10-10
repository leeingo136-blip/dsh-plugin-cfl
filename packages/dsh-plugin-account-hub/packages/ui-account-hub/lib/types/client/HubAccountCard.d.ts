import type { ReactNode } from 'react';
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client';
import type { ProviderCardEditorAccess } from '@dsh/ui-settings-models/client';
import type { AccountHubKey } from './locales.ts';
import type { AccountRow } from './index.ts';
/** Copy keys the generic card reads from the section dictionary. */
export type HubAccountCardCopy = 'save' | 'saving' | 'saved' | 'saveFailed' | 'actionFailed' | 'optionsFailed' | 'busy' | 'selectPlaceholder';
/** Props the section hands one declarative account card. */
export interface HubAccountCardProps {
    t: (key: AccountHubKey) => string;
    row: AccountRow;
    /** Which surface renders this card: the account column (default) or the
     *  models-page provider card; fields tagged with the other surface hide. */
    surface?: 'account' | 'models';
    /** Forward one plugin-private operation through the hub. */
    invoke: (method: string, args: unknown) => Promise<unknown>;
    /** Read the account's stored (redacted) parameters from its namespace. */
    readParams: () => Promise<unknown>;
    /** Commit edited parameters into the account's settings namespace. */
    commitParams: (ops: SettingsPathOpView[]) => Promise<void>;
    /** Draft access when dispatched inside an opened provider editor: a bound
     *  select edits the editor's pending draft instead of the stored params,
     *  and the editor's own save control commits it. Absent elsewhere. */
    editor?: ProviderCardEditorAccess | undefined;
    /** Which editor area this occurrence occupies on the models surface (the
     *  editor dispatches the seat once per zone): fields declared for the
     *  catalog render only in the `catalog` occurrence, the rest only in the
     *  `editor` one. Absent on the legacy single dispatches, which render
     *  every surface field. */
    zone?: 'editor' | 'catalog' | undefined;
}
/**
 * Render one account's declarative card.
 * @param props - the row (with its card descriptor) and the hub seams.
 * @returns the card, redrawn from the descriptor alone.
 */
export declare function HubAccountCard(props: HubAccountCardProps): ReactNode;
//# sourceMappingURL=HubAccountCard.d.ts.map