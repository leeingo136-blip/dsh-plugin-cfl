import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Rendered seats of the settings account column: the section wrapper, its
 * loaded row list, and one account's models-page provider card. Split from the
 * client entry because the shared client preset resolves `src/client/index.ts`
 * as the bundle input, and a JSX-bearing entry leaves that path unresolvable
 * for tooling reading the preset (the third-party notices generator among it).
 */
import { useEffect, useState } from 'react';
import { HubAccountCard } from "./HubAccountCard.js";
/**
 * Render the settings account column: the registry read lives here, row
 * content is delegated per account to the `account.hub.row` slot.
 * @param props - slot-delivered injected dependencies.
 * @returns the section, or null while the shell has not injected yet.
 */
export function AccountHubSection(props) {
    const { face, renderSlot } = props;
    if (face === undefined || renderSlot === undefined)
        return null;
    return _jsx(Loaded, { face: face, renderSlot: renderSlot });
}
/** @param props - the resolved face and the row renderer. @returns the row list. */
function Loaded({ face, renderSlot }) {
    const [rows, setRows] = useState([]);
    const [failed, setFailed] = useState(null);
    useEffect(() => {
        let alive = true;
        const refresh = () => {
            void face.list().then((value) => {
                if (!alive)
                    return;
                setRows(value.map(row => ({ row })));
                setFailed(null);
                for (const row of value) {
                    if (row.modelsCard === true)
                        face.ensureModelsCard(row.settingsNs);
                }
            }, (error) => { if (alive)
                setFailed(error instanceof Error ? error.message : String(error)); });
        };
        refresh();
        const dispose = face.subscribe(refresh);
        return () => { alive = false; dispose(); };
    }, [face]);
    return (_jsx("div", { children: failed !== null ? _jsxs("p", { children: [face.t('loadFailed'), ' — ', failed] })
            : rows.length === 0 ? _jsx("p", { children: face.t('empty') })
                : rows.map(({ row }) => row.card !== undefined ? (_jsx(HubAccountCard, { t: face.t, row: row, invoke: (method, args) => face.invoke(row.id, method, args), readParams: () => face.readParams(row.id), commitParams: ops => face.commitParams(row.id, ops) }, row.id)) : renderSlot('account.hub.row', {
                    accountId: row.id, displayName: row.displayName, state: row.state,
                    invoke: (method, args) => face.invoke(row.id, method, args),
                }, { entryKey: row.id })) }));
}
/**
 * Draw one account's models-page provider card. The seat renders for every
 * directory row; only the account that opted in through `modelsCard` finds a
 * matching row, so every other provider renders nothing.
 * @param props - the row's owner facts and the hub face.
 * @returns the account's models-surface card, or nothing.
 */
export function ProviderModelsCard(props) {
    const { face } = props;
    const settingsNs = props.provider.settingsNs;
    const [row, setRow] = useState(null);
    const [settled, setSettled] = useState(false);
    useEffect(() => {
        let alive = true;
        const refresh = () => {
            void face.list().then((rows) => {
                if (!alive)
                    return;
                setRow(rows.find(candidate => candidate.settingsNs === settingsNs
                    && candidate.modelsCard === true
                    && (candidate.card?.fields.some(field => field.surface === 'models') === true)) ?? null);
                setSettled(true);
            }, () => { if (alive)
                setSettled(true); });
        };
        refresh();
        const dispose = face.subscribe(refresh);
        return () => { alive = false; dispose(); };
    }, [face, settingsNs]);
    if (!settled || row === null)
        return null;
    return (_jsx(HubAccountCard, { t: face.t, row: row, surface: "models", editor: props.editor, zone: props.zone, invoke: (method, args) => face.invoke(row.id, method, args), readParams: () => face.readParams(row.id), commitParams: ops => face.commitParams(row.id, ops) }));
}
//# sourceMappingURL=HubSection.js.map