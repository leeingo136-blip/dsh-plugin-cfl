import type { ReactNode } from 'react';
import type { ProviderCardExtrasOwnerProps } from '@dsh/ui-settings-models/client';
import type { AccountHubSectionFace } from './index.ts';
/**
 * Render the settings account column: the registry read lives here, row
 * content is delegated per account to the `account.hub.row` slot.
 * @param props - slot-delivered injected dependencies.
 * @returns the section, or null while the shell has not injected yet.
 */
export declare function AccountHubSection(props: {
    face?: AccountHubSectionFace;
    renderSlot?: unknown;
}): ReactNode;
/** Props of the models-page provider-card seat: the row's owner facts plus the hub face. */
type ProviderModelsCardProps = ProviderCardExtrasOwnerProps & {
    face: AccountHubSectionFace;
};
/**
 * Draw one account's models-page provider card. The seat renders for every
 * directory row; only the account that opted in through `modelsCard` finds a
 * matching row, so every other provider renders nothing.
 * @param props - the row's owner facts and the hub face.
 * @returns the account's models-surface card, or nothing.
 */
export declare function ProviderModelsCard(props: ProviderModelsCardProps): ReactNode;
export {};
//# sourceMappingURL=HubSection.d.ts.map