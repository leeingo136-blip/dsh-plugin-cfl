import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The hub-rendered account card: a declarative form drawn entirely from the
 * plugin's card descriptor. The plugin ships no browser code — its descriptor,
 * the values stored under its settings namespace (read back redacted), and its
 * invoke seam are the whole surface. Field kinds: text, password, checkbox,
 * select (static or plugin-served options), and buttons whose actions run
 * plugin-side (e.g. scanning the account's available models) and may push
 * fresh select options back.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, IconRightUpOutlineRegular, IconUserOutlineMedium, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './HubAccountCard.module.css';
/** Narrow an unknown value to a JSON object record; anything else is empty. */
function asRecord(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
}
function asString(value) {
    return typeof value === 'string' ? value : '';
}
function asBoolean(value) {
    return value === true;
}
/** Parse a plugin-served option payload; malformed entries are dropped. */
function parseOptions(value) {
    const rows = Array.isArray(value) ? value : asRecord(value).options;
    if (!Array.isArray(rows))
        return [];
    return rows
        .map(row => ({ value: asString(asRecord(row).value), label: asString(asRecord(row).label) }))
        .filter(row => row.value !== '');
}
function sameValue(before, after) {
    return JSON.stringify(before ?? null) === JSON.stringify(after ?? null);
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Render one account's declarative card.
 * @param props - the row (with its card descriptor) and the hub seams.
 * @returns the card, redrawn from the descriptor alone.
 */
export function HubAccountCard(props) {
    const { t, row, surface = 'account', invoke, readParams, commitParams, editor, zone } = props;
    const status = asRecord(row.state);
    const visibleFields = useMemo(() => (row.card?.fields ?? []).filter((field) => {
        if (field.surface !== undefined && field.surface !== surface)
            return false;
        if (field.when === 'signed-in' && status.signedIn !== true)
            return false;
        if (field.when === 'signed-out' && status.signedIn === true)
            return false;
        // Two-zone models dispatch: a field declared for the catalog renders
        // only in the catalog occurrence and vice versa; the legacy single
        // dispatch (no zone) renders every surface field.
        if (surface === 'models' && zone !== undefined
            && (field.placement === 'catalog') !== (zone === 'catalog'))
            return false;
        return true;
    }), [row.card, surface, status, zone]);
    const [initial, setInitial] = useState({});
    const [values, setValues] = useState({});
    const [options, setOptions] = useState({});
    const [notice, setNotice] = useState(null);
    const [busy, setBusy] = useState(null);
    // The open dialog field, its live input values, and its own notice line.
    const [dialogField, setDialogField] = useState(null);
    const [dialogValues, setDialogValues] = useState({});
    const [dialogNotice, setDialogNotice] = useState(null);
    const [dialogBusy, setDialogBusy] = useState(false);
    const alive = useRef(true);
    useEffect(() => () => { alive.current = false; }, []);
    // Load the stored (redacted) parameter values once per row.
    useEffect(() => {
        alive.current = true;
        void (async () => {
            try {
                const stored = asRecord(await readParams());
                if (!alive.current)
                    return;
                setInitial(stored);
                setValues(stored);
                setNotice(null);
            }
            catch (error) {
                if (alive.current)
                    setNotice({ tone: 'error', text: messageOf(error) });
            }
        })();
        return () => { alive.current = false; };
    }, [readParams, row.id]);
    // Selects without static choices load them through the plugin's invoke seam.
    const dynamicKeys = visibleFields
        .filter(field => field.kind === 'select' && field.options === undefined)
        .map(field => field.key);
    const dynamicKey = dynamicKeys.join('\u0000');
    useEffect(() => {
        if (dynamicKey === '')
            return;
        void (async () => {
            for (const key of dynamicKey.split('\u0000')) {
                try {
                    const raw = await invoke('options', { field: key });
                    if (!alive.current)
                        return;
                    setOptions(previous => ({ ...previous, [key]: parseOptions(raw) }));
                }
                catch (error) {
                    if (!alive.current)
                        return;
                    const field = visibleFields.find(candidate => candidate.key === key);
                    setNotice({ tone: 'error', text: `${t('optionsFailed')} — ${field?.label ?? key}: ${messageOf(error)}` });
                }
            }
        })();
    }, [dynamicKey, invoke, visibleFields, t]);
    const statusText = asString(status.text);
    const statusLevel = status.level === 'ok' || status.level === 'warn' || status.level === 'error'
        ? status.level
        : null;
    const brand = asRecord(status.brand);
    const brandLogo = asString(brand.logoUrl);
    const brandName = asString(brand.name);
    if (visibleFields.length === 0)
        return null;
    // Value fields participate in dirty tracking and the save commit; note and
    // dialog fields are pure presentation/actions and never persist anything.
    // A select bound to an opened editor's draft (`bind` + draft access) edits
    // that draft instead, so the editor's own save control owns the commit.
    const isDraftBound = (field) => field.kind === 'select' && field.bind !== undefined && editor !== undefined;
    const isValueField = (field) => field.kind !== 'button' && field.kind !== 'dialog' && field.kind !== 'note';
    const dirty = visibleFields.some(field => isValueField(field) && !isDraftBound(field)
        && !sameValue(initial[field.key], values[field.key]));
    const setValue = (key, value) => {
        setValues(previous => ({ ...previous, [key]: value }));
    };
    const save = () => {
        void (async () => {
            const ops = [];
            for (const field of visibleFields) {
                if (!isValueField(field) || isDraftBound(field))
                    continue;
                const before = initial[field.key];
                const after = values[field.key];
                if (sameValue(before, after))
                    continue;
                if (after === undefined || after === '')
                    ops.push({ op: 'unset', path: [field.key] });
                else
                    ops.push({ op: 'set', path: [field.key], value: after });
            }
            if (ops.length === 0)
                return;
            setBusy('save');
            try {
                await commitParams(ops);
                if (!alive.current)
                    return;
                setInitial({ ...values });
                setNotice({ tone: 'info', text: t('saved') });
            }
            catch (error) {
                if (alive.current)
                    setNotice({ tone: 'error', text: `${t('saveFailed')}: ${messageOf(error)}` });
            }
            finally {
                if (alive.current)
                    setBusy(null);
            }
        })();
    };
    const runAction = (field) => {
        const action = field.action;
        if (action === undefined)
            return;
        void (async () => {
            setBusy(field.key);
            setNotice(null);
            try {
                const raw = asRecord(await invoke(action, { values }));
                if (!alive.current)
                    return;
                const updates = Array.isArray(raw.options) ? raw.options : [];
                if (updates.length > 0) {
                    setOptions((previous) => {
                        const next = { ...previous };
                        for (const update of updates) {
                            const record = asRecord(update);
                            const key = asString(record.field);
                            if (key !== '')
                                next[key] = parseOptions(record.choices);
                        }
                        return next;
                    });
                }
                const message = asString(raw.message);
                if (message !== '')
                    setNotice({ tone: 'info', text: message });
            }
            catch (error) {
                if (alive.current)
                    setNotice({ tone: 'error', text: `${t('actionFailed')}: ${messageOf(error)}` });
            }
            finally {
                if (alive.current)
                    setBusy(null);
            }
        })();
    };
    /** Close the open dialog, discarding its draft values and notice. */
    const closeDialog = () => {
        if (dialogBusy)
            return;
        setDialogField(null);
        setDialogValues({});
        setDialogNotice(null);
    };
    /** Run one dialog field's action with the entered values merged in; the
      * result's message shows inside the modal and `close: true` dismisses it
      * after a beat so the outcome stays readable. */
    const runDialogSubmit = () => {
        const field = dialogField;
        if (field === null)
            return;
        const action = field.action;
        if (action === undefined)
            return;
        void (async () => {
            setDialogBusy(true);
            setDialogNotice(null);
            try {
                const raw = asRecord(await invoke(action, { values: { ...values, ...dialogValues } }));
                if (!alive.current)
                    return;
                const message = asString(raw.message);
                if (message !== '')
                    setDialogNotice({ tone: raw.error === true ? 'error' : 'info', text: message });
                if (raw.close === true) {
                    window.setTimeout(() => {
                        if (!alive.current)
                            return;
                        setDialogField(null);
                        setDialogValues({});
                        setDialogNotice(null);
                    }, 1_000);
                }
            }
            catch (error) {
                if (alive.current)
                    setDialogNotice({ tone: 'error', text: messageOf(error) });
            }
            finally {
                if (alive.current)
                    setDialogBusy(false);
            }
        })();
    };
    const openDialog = (field) => {
        setDialogField(field);
        setDialogValues({});
        setDialogNotice(null);
    };
    const renderButtonControl = (field) => (_jsx(Button, { variant: field.tone === 'primary' ? 'primary' : 'outline', size: "sm", disabled: busy !== null, onClick: () => {
            if (field.kind === 'dialog')
                openDialog(field);
            else
                runAction(field);
        }, children: busy === field.key ? (field.busyLabel ?? t('busy')) : field.label }, field.key));
    const renderField = (field) => {
        // A note is bare helper copy: no value, no field wrapper.
        if (field.kind === 'note') {
            return _jsx("p", { className: css.hint, children: field.label }, field.key);
        }
        // Buttons and dialog triggers render bare (no label/field wrapper): they
        // are actions, and the rich and brand layouts place them themselves.
        if (field.kind === 'button' || field.kind === 'dialog')
            return renderButtonControl(field);
        const domId = `account-hub-${row.id}-${field.key}`;
        const control = () => {
            switch (field.kind) {
                case 'text':
                    return (_jsx(Input, { id: domId, type: "text", value: asString(values[field.key]), placeholder: field.placeholder, onChange: (event) => { setValue(field.key, event.target.value); } }));
                case 'password':
                    return (_jsx(Input, { id: domId, type: "password", value: asString(values[field.key]), placeholder: field.placeholder, autoComplete: "off", onChange: (event) => { setValue(field.key, event.target.value); } }));
                case 'checkbox':
                    return (_jsx(Checkbox, { checked: asBoolean(values[field.key]), label: field.label, onChange: (next) => { setValue(field.key, next); } }));
                case 'select': {
                    const choices = [...(field.options ?? []), ...(options[field.key] ?? [])];
                    const bound = field.bind !== undefined && editor !== undefined
                        ? { path: field.bind, access: editor }
                        : undefined;
                    const current = bound !== undefined
                        ? asString(bound.access.getPath([bound.path]))
                        : asString(values[field.key]);
                    return (_jsxs("select", { id: domId, className: css.select, value: current, onChange: (event) => {
                            if (bound !== undefined)
                                bound.access.setPath([bound.path], event.target.value);
                            else
                                setValue(field.key, event.target.value);
                        }, children: [current === '' && _jsx("option", { value: "", children: t('selectPlaceholder') }), choices.map(choice => (_jsx("option", { value: choice.value, children: choice.label }, choice.value)))] }));
                }
                case 'button':
                    return renderButtonControl(field);
            }
        };
        return (_jsxs("div", { className: css.field, children: [field.kind !== 'checkbox' && (_jsx("label", { className: css.label, htmlFor: domId, children: field.label })), control(), field.description !== undefined && _jsx("p", { className: css.hint, children: field.description })] }, field.key));
    };
    // The sign-in modal hoisted above the layout returns: every branch (rich
    // signed-in card, signed-out brand row, plain descriptor card) can carry a
    // dialog trigger, so all three render the same modal.
    const dialogModal = dialogField?.dialog === undefined ? null : (_jsxs(Modal, { open: true, onClose: closeDialog, title: dialogField.dialog.title ?? dialogField.label, closeLabel: t('cancel'), footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", size: "sm", disabled: dialogBusy, onClick: closeDialog, children: t('cancel') }), _jsx(Button, { variant: "primary", size: "sm", disabled: dialogBusy, onClick: runDialogSubmit, children: dialogBusy
                        ? (dialogField.busyLabel ?? t('busy'))
                        : (dialogField.dialog.submitLabel ?? dialogField.label) })] })), children: [dialogField.dialog.fields.map((input, index) => (_jsxs("div", { className: css.field, children: [_jsx("label", { className: css.label, htmlFor: `account-hub-dialog-${row.id}-${input.key}`, children: input.label }), _jsx(Input, { id: `account-hub-dialog-${row.id}-${input.key}`, type: input.kind, value: asString(dialogValues[input.key]), placeholder: input.placeholder, autoComplete: "off", "data-modal-autofocus": index === 0 ? '' : undefined, onChange: (event) => { setDialogValues(previous => ({ ...previous, [input.key]: event.target.value })); } })] }, input.key))), dialogNotice !== null && (_jsx("p", { className: dialogNotice.tone === 'error' ? css.error : css.notice, children: dialogNotice.text }))] }));
    // The signed-in account column draws the built-in account layout: an
    // identity card (avatar, name, contact, platform link) and a balance card,
    // both fed by the plugin's state. The plain descriptor form remains the
    // signed-out and models-page rendering.
    const identity = asRecord(status.identity);
    const balance = asRecord(status.balance);
    const showRich = surface !== 'models' && status.signedIn === true
        && (asString(identity.name) !== '' || asString(identity.contact) !== ''
            || asString(identity.avatarUrl) !== '' || asString(identity.infoUrl) !== '');
    if (showRich) {
        const balanceRows = Array.isArray(balance.rows) ? balance.rows : [];
        const moreRows = Array.isArray(balance.more) ? balance.more : [];
        const buttons = visibleFields.filter(field => field.kind === 'button' || field.kind === 'dialog');
        const rowLink = (raw) => {
            const link = asRecord(raw);
            const href = asString(link.href);
            const label = asString(link.label);
            if (href === '' || label === '')
                return _jsx("span", { className: css.unavailable, children: label });
            return _jsx("a", { className: `${css.unavailable} ${css.unavailableLink}`, href: href, target: "_blank", rel: "noreferrer", children: label });
        };
        return (_jsxs("div", { className: css.rich, children: [_jsxs("div", { className: css.officialCard, children: [_jsxs("div", { className: css.identityRow, children: [_jsxs("div", { className: css.identity, children: [_jsx("span", { className: css.avatar, children: brandLogo !== ''
                                                ? _jsx("img", { className: css.avatarBrand, src: brandLogo, alt: "" })
                                                : asString(identity.avatarUrl) !== ''
                                                    ? _jsx("img", { className: css.avatarImage, src: asString(identity.avatarUrl), alt: "", referrerPolicy: "no-referrer" })
                                                    : _jsx(IconUserOutlineMedium, { size: 16 }) }), _jsxs("div", { className: css.identityCopy, children: [_jsx("span", { className: css.nameLine, children: asString(identity.name) !== '' ? asString(identity.name) : t('signedIn') }), _jsx("span", { className: css.statusLine, role: "status", children: asString(identity.contact) })] })] }), _jsxs("div", { className: css.rowEnd, children: [buttons.map(renderButtonControl), asString(identity.infoUrl) !== '' && (_jsxs("a", { className: css.accountInfo, href: asString(identity.infoUrl), target: "_blank", rel: "noopener noreferrer", children: [asString(identity.infoLabel) !== '' ? asString(identity.infoLabel) : t('accountInfo'), _jsx(IconRightUpOutlineRegular, { size: 12 })] }))] })] }), (balanceRows.length > 0 || moreRows.length > 0) && _jsx("div", { className: css.divider }), balanceRows.map((raw, index) => {
                            const r = asRecord(raw);
                            return (_jsxs(Fragment, { children: [index > 0 && _jsx("div", { className: css.divider }), _jsxs("div", { className: css.bRow, children: [_jsx("span", { children: asString(r.label) }), asString(r.value) !== ''
                                                ? _jsx("span", { className: css.amount, children: asString(r.value) })
                                                : r.loading === true
                                                    ? _jsx("span", { className: css.unavailable, children: t('loading') })
                                                    : rowLink(r.unavailable ?? null)] })] }, `balance-${index}`));
                        }), moreRows.map((raw, index) => {
                            const m = asRecord(raw);
                            const links = Array.isArray(m.links) ? m.links : [];
                            if (links.length === 0)
                                return null;
                            return (_jsxs(Fragment, { children: [_jsx("div", { className: css.divider }), _jsxs("div", { className: css.bRow, children: [_jsx("span", { className: css.secondary, children: asString(m.label) }), _jsx("div", { className: css.links, children: links.map((rawLink, linkIndex) => {
                                                    const link = asRecord(rawLink);
                                                    const href = asString(link.href);
                                                    const action = asString(link.action);
                                                    const label = asString(link.label);
                                                    // An action entry is a plugin operation (fired through
                                                    // invoke; the state push refreshes the card), not a
                                                    // navigation — rendered as a plain link-styled button.
                                                    if (action !== '') {
                                                        return (_jsx("button", { className: link.primary === true ? `${css.linkButton} ${css.primaryLink}` : css.linkButton, onClick: () => {
                                                                void (async () => {
                                                                    setNotice(null);
                                                                    try {
                                                                        await invoke(action, {});
                                                                    }
                                                                    catch (error) {
                                                                        setNotice({ tone: 'error', text: `${t('actionFailed')}: ${messageOf(error)}` });
                                                                    }
                                                                })();
                                                            }, children: label }, linkIndex));
                                                    }
                                                    if (href === '')
                                                        return null;
                                                    return (_jsx("a", { className: link.primary === true ? `${css.linkButton} ${css.primaryLink}` : css.linkButton, href: href, target: "_blank", rel: "noreferrer", children: label }, linkIndex));
                                                }) })] })] }, `more-${index}`));
                        })] }), notice !== null && (_jsx("p", { className: notice.tone === 'error' ? css.error : css.notice, children: notice.text })), dialogModal] }));
    }
    // The brand row: the plugin's bundled logo and label on the left, its
    // actions (sign-in) on the right — shown while signed out, when the card
    // carries brand facts and nothing but action fields. While a sign-in
    // attempt is in flight the affordance hides and the progress copy shows;
    // a failure reverts here too, with the error copy and the button back.
    // Account-column identity only: the models page renders inside the
    // provider editor, which carries its own title — a brand row there would
    // be a stray second heading, so that surface falls through to the plain
    // field card (and to null when a zone leaves it no fields).
    if (surface !== 'models' && brandLogo !== '' && brandName !== '' && !visibleFields.some(field => isValueField(field))) {
        const signingIn = status.signingIn === true;
        const actionFields = signingIn ? [] : visibleFields.filter(field => field.kind === 'button' || field.kind === 'dialog');
        return (_jsxs("div", { className: css.brandCard, children: [_jsx("img", { className: css.brandMark, src: brandLogo, alt: "" }), _jsx("span", { className: css.brandName, children: brandName }), statusText !== '' && (_jsx("span", { className: [css.brandStatus, statusLevel === 'error' ? css.brandStatusError : undefined].join(' '), role: "status", children: statusText })), actionFields.length > 0 && (_jsx("div", { className: css.brandActions, children: actionFields.map(renderButtonControl) })), notice !== null && (_jsx("p", { className: notice.tone === 'error' ? css.error : css.notice, children: notice.text })), dialogModal] }));
    }
    // The catalog-zone occurrence renders its fields bare: the catalog block
    // already provides frame, heading, and actions, and the editor's save owns
    // draft-bound controls — no notice, no dialog, no save bar here.
    if (surface === 'models' && zone === 'catalog') {
        if (visibleFields.length === 0)
            return null;
        return _jsx(_Fragment, { children: visibleFields.map(renderField) });
    }
    return (_jsxs("div", { className: surface === 'models' ? css.plain : css.card, children: [surface !== 'models' && (_jsxs("div", { className: css.head, children: [_jsx("span", { className: css.name, children: row.displayName }), statusText !== '' && (_jsx("span", { className: [css.status, statusLevel === null ? undefined : css[statusLevel]].join(' '), children: statusText }))] })), visibleFields.map(renderField), notice !== null && (_jsx("p", { className: notice.tone === 'error' ? css.error : css.notice, children: notice.text })), visibleFields.some(field => isValueField(field) && !isDraftBound(field)) && (_jsx("div", { className: css.actions, children: _jsx(Button, { variant: "primary", size: "sm", disabled: !dirty || busy !== null, onClick: () => { save(); }, children: busy === 'save' ? t('saving') : t('save') }) })), dialogModal] }));
}
//# sourceMappingURL=HubAccountCard.js.map