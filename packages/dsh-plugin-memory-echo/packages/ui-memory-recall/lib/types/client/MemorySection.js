import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * 设置-记忆回想：RAG 数据库连接卡片。
 * 每张卡片显示一个连接（名称/类型/地址/embedding 引擎）；新建与编辑共用
 * 一个编辑器——新建时渲染在列表顶部，编辑时原位替换该卡片。名称唯一，
 * 作为工具参数明确连接哪个数据库；删除在编辑器末行左侧，保存/取消居右。
 */
import { useEffect, useState } from 'react';
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './QueryModal.module.css';
const draftOf = (card) => ({
    plan: card?.plan ?? '',
    name: card?.name ?? '',
    persona: card?.persona ?? '',
    address: card?.address ?? '',
    embeddingModel: card?.embeddingModel ?? '',
});
const ATTITUDE_LABELS = {
    solidarity: '亲近',
    status: '地位',
    trust: '信任',
    commitment: '承诺',
};
const STATE_LABELS = {
    valence: '心情',
    arousal: '唤醒',
    dominance: '掌控',
    stamina: '体力',
    attachment: '依恋',
    trust: '信任',
    anger: '愤怒',
    fear: '恐惧',
    sadness: '难过',
};
export function MemorySection(props) {
    const probe = props.face;
    if (probe === undefined) {
        return _jsx("div", { style: { padding: 16 }, children: "\u5FC3\u7075\u56DE\u54CD\uFF1A\u8BBE\u7F6E\u7EC4\u4EF6\u5DF2\u52A0\u8F7D\uFF0C\u4F46\u672A\u6536\u5230 face \u6CE8\u5165\uFF08slot inject \u672A\u751F\u6548\uFF09\u3002" });
    }
    const { face } = props;
    if (face === undefined)
        return null;
    return _jsx(MemoryLoaded, { face: face });
}
function MemoryLoaded({ face }) {
    const [cards, setCards] = useState([]);
    const [failed, setFailed] = useState(null);
    /** Plugin-internal default directory for local database files (from connList). */
    const [localDir, setLocalDir] = useState(undefined);
    /** The card being edited (id), or 'new' for the creation editor, or undefined. */
    const [editing, setEditing] = useState(undefined);
    /** The card whose connect/search modal is open. */
    const [querying, setQuerying] = useState(undefined);
    const refresh = () => {
        void face.list().then(value => {
            setCards(value.connections);
            setLocalDir(value.defaults?.localDir);
            setFailed(null);
        }, (error) => setFailed(error instanceof Error ? error.message : String(error)));
    };
    useEffect(refresh, [face]);
    return (_jsxs("div", { children: [_jsxs("div", { style: styles.toolbar, children: [_jsx("strong", { style: { marginRight: 8 }, children: "\u5FC3\u7075\u56DE\u54CD \u00B7 \u89D2\u8272\u5361" }), _jsx(Button, { variant: 'primary', size: 'sm', disabled: editing === 'new', onClick: () => { setEditing('new'); }, children: face.t('createCard') }), failed !== null && _jsxs("span", { style: styles.error, children: [face.t('loadFailed'), ' — ', failed] })] }), cards.length === 0 && editing === undefined && (_jsxs("p", { children: [face.t('empty'), _jsxs("span", { style: styles.hint, children: [' — ', face.t('emptyHint')] })] })), _jsxs("div", { style: styles.grid, children: [editing === 'new' && (_jsx(CardEditor, { face: face, cards: cards, draft: draftOf(), localDir: localDir, onDone: () => { setEditing(undefined); refresh(); }, onCancel: () => { setEditing(undefined); } }, 'new')), cards.map(card => (editing === card.id
                        ? (_jsx(CardEditor, { face: face, cards: cards, draft: draftOf(card), localDir: localDir, cardId: card.id, onConnect: () => { setQuerying(card); }, onDone: () => { setEditing(undefined); refresh(); }, onCancel: () => { setEditing(undefined); }, onDelete: () => {
                                if (!window.confirm(face.t('deleteConfirm')))
                                    return;
                                void face.remove(card.id).then(() => { setEditing(undefined); refresh(); });
                            } }, card.id))
                        : (_jsx(CardView, { face: face, card: card, onEdit: () => { setEditing(card.id); }, onConnect: () => { setQuerying(card); } }, card.id))))] }), querying !== undefined && (_jsx(QueryModal, { face: face, card: querying, onClose: () => { setQuerying(undefined); } }))] }));
}
function CardView(props) {
    const { face, card, onEdit } = props;
    return (_jsxs("div", { style: styles.card, children: [_jsxs("div", { style: styles.cardHead, children: [_jsx("strong", { style: styles.cardName, children: card.plan }), _jsx("span", { style: { flex: 1 } }), _jsx(Button, { variant: 'outline', size: 'sm', onClick: onEdit, children: face.t('editCard') })] }), _jsxs("div", { style: styles.metaRows, children: [_jsxs("span", { style: styles.metaRow, children: [_jsx("span", { style: styles.metaLabel, children: face.t('fieldName') }), _jsx("span", { style: styles.metaValue, children: card.name })] }), _jsxs("span", { style: styles.metaRow, children: [_jsx("span", { style: styles.metaLabel, children: face.t('fieldAddress') }), _jsx("span", { style: styles.metaValue, children: card.address })] }), _jsxs("span", { style: styles.metaRow, children: [_jsx("span", { style: styles.metaLabel, children: face.t('fieldEmbedding') }), _jsx("span", { style: styles.metaValue, children: card.embeddingModel })] })] })] }));
}
function CardEditor(props) {
    const { face, cards, cardId, localDir, onDone, onCancel, onDelete, onConnect } = props;
    const [draft, setDraft] = useState(props.draft);
    const [presets, setPresets] = useState([]);
    const [basePreset, setBasePreset] = useState('');
    const [panel, setPanel] = useState(undefined);
    const [dbPicker, setDbPicker] = useState(undefined);
    const [selfOpen, setSelfOpen] = useState(false);
    const [cardState, setCardState] = useState({ sleep: [], selfTags: [], personTags: [], selfState: [], persons: [], objects: [] });
    useEffect(() => {
        if (cardId === undefined)
            return;
        void face.cardState({ id: cardId }).then(setCardState, () => { });
    }, [face, cardId]);
    useEffect(() => {
        void face.presetOptions().then(value => {
            setPresets(value.presets);
            setBasePreset(current => current === '' ? (value.presets[0]?.id ?? '') : current);
        }, () => { });
    }, [face]);
    /**
     * While untouched, the local address keeps deriving itself from the
     * plugin-internal directory and the card name; the first manual edit
     * hands control to the user for good.
     */
    const [addressTouched, setAddressTouched] = useState(props.draft.address !== '');
    const [models, setModels] = useState([]);
    const [embeddingAvailable, setEmbeddingAvailable] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        void face.embeddingModels().then(value => {
            setModels(value.models);
            setEmbeddingAvailable(value.available);
        }, () => { setEmbeddingAvailable(false); });
    }, [face]);
    useEffect(() => {
        if (addressTouched || localDir === undefined || draft.plan.trim() === '')
            return;
        const want = `${localDir.replace(/\/+$/, '')}/${draft.plan.trim().toLowerCase()}.sqlite`;
        if (draft.address !== want)
            setDraft(current => ({ ...current, address: want }));
    }, [addressTouched, localDir, draft.plan, draft.address]);
    const nameTaken = cards.some(one => one.name === draft.name.trim() && one.id !== cardId);
    const complete = draft.plan.trim() !== '' && draft.name.trim() !== '' && draft.embeddingModel !== '';
    const submit = () => {
        if (nameTaken) {
            setError(face.t('nameDuplicate'));
            return;
        }
        setBusy(true);
        const body = {
            plan: draft.plan.trim().toLowerCase(),
            name: draft.name.trim(),
            persona: draft.persona,
            address: draft.address.trim(),
            embeddingModel: draft.embeddingModel,
            basePreset,
            injectGroups: draft.injectGroups,
        };
        const call = cardId === undefined ? face.create(body) : face.update({ id: cardId, ...body });
        void call.then(() => {
            setBusy(false);
            onDone();
        }, (cause) => {
            setBusy(false);
            const message = cause instanceof Error ? cause.message : String(cause);
            setError(message.includes('name-duplicate') ? face.t('nameDuplicate')
                : message.includes('invalid-input') ? face.t('invalidInput')
                    : message.includes('not-found') ? face.t('notFound')
                        : message);
        });
    };
    return (_jsxs("div", { style: { ...styles.card, ...styles.editor }, children: [_jsxs("div", { style: styles.fieldRow, children: [_jsxs("div", { style: styles.field, children: [_jsx("span", { style: styles.fieldHead, children: _jsx("span", { style: styles.fieldLabel, children: face.t('fieldPlan') }) }), _jsx("input", { style: styles.input, value: draft.plan, placeholder: 'work-assistant', onChange: event => { setDraft({ ...draft, plan: event.target.value }); } })] }), _jsxs("div", { style: styles.field, children: [_jsxs("span", { style: styles.fieldHead, children: [_jsx("span", { style: styles.fieldLabel, children: face.t('fieldAddress') }), _jsx("span", { style: { flex: 1 } }), _jsx(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: submit, children: "\u4FDD\u5B58" }), _jsx(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => {
                                            void face.databaseFiles().then(value => setDbPicker(value.files), (error) => window.alert(error instanceof Error ? error.message : String(error)));
                                        }, children: "\u8F7D\u5165" })] }), _jsx("input", { style: styles.input, value: draft.address, placeholder: '\u4FDD\u5B58\u65F6\u81EA\u52A8\u521B\u5EFA', onChange: event => { setAddressTouched(true); setDraft({ ...draft, address: event.target.value }); } })] }), dbPicker !== undefined && (_jsxs("div", { style: styles.field, children: [_jsx("span", { style: styles.fieldLabel, children: "\u9009\u62E9\u8981\u8F7D\u5165\u7684\u6570\u636E\u5E93" }), _jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 8 }, children: [dbPicker.map(file => (_jsx(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => {
                                            void face.loadDatabase({ address: file.address }).then(value => {
                                                const body = {
                                                    plan: file.plan,
                                                    name: value.name,
                                                    persona: value.persona,
                                                    address: file.address,
                                                    embeddingModel: draft.embeddingModel,
                                                    basePreset,
                                                    injectGroups: draft.injectGroups,
                                                };
                                                setDbPicker(undefined);
                                                setBusy(true);
                                                const call = cardId === undefined ? face.create(body) : face.update({ id: cardId, ...body });
                                                void call.then(() => { setBusy(false); onDone(); }, (error) => { setBusy(false); setError(error instanceof Error ? error.message : String(error)); });
                                            }, (error) => window.alert(error instanceof Error ? error.message : String(error)));
                                        }, children: file.title !== '' ? `${file.title}（${file.plan}）` : file.plan }, file.address))), dbPicker.length === 0 && _jsx("span", { style: styles.hint, children: "databases \u76EE\u5F55\u4E0B\u6CA1\u6709 .sqlite \u6587\u4EF6" }), _jsx(Button, { variant: 'outline', size: 'sm', onClick: () => setDbPicker(undefined), children: "\u53D6\u6D88" })] })] }))] }), _jsxs("div", { style: styles.fieldRow, children: [_jsxs("div", { style: styles.field, children: [_jsx("span", { style: styles.fieldLabel, children: face.t('fieldName') }), _jsx("input", { style: styles.input, value: draft.name, placeholder: face.t('fieldNameHint'), onChange: event => { setDraft({ ...draft, name: event.target.value }); } }), nameTaken && _jsx("span", { style: styles.error, children: face.t('nameDuplicate') })] }), _jsxs("div", { style: styles.field, children: [_jsx("span", { style: styles.fieldLabel, children: face.t('fieldEmbedding') }), _jsxs("select", { style: styles.input, value: draft.embeddingModel, onChange: event => { setDraft({ ...draft, embeddingModel: event.target.value }); }, children: [_jsx("option", { value: '', children: face.t('embeddingPick') }), models.map(model => (_jsx("option", { value: model.id, children: model.id }, model.id)))] }), !embeddingAvailable && _jsx("span", { style: styles.hint, children: face.t('embeddingUnavailable') })] })] }), _jsxs("div", { style: styles.field, children: [_jsx("span", { style: styles.fieldLabel, children: face.t('fieldPersona') }), _jsx("textarea", { style: { ...styles.input, minHeight: 80 }, value: draft.persona, onChange: event => { setDraft({ ...draft, persona: event.target.value }); } })] }), _jsx("div", { style: styles.field, children: _jsx(Button, { variant: 'outline', size: 'sm', onClick: () => { setSelfOpen(true); }, children: "\u5DF1 \u00B7 \u72B6\u6001" }) }), _jsxs("div", { style: { display: 'flex', gap: 8, marginTop: 4 }, children: [_jsx(Button, { variant: 'outline', size: 'sm', onClick: () => { setPanel('person'); }, children: "\u4EBA \u5173\u7CFB" }), _jsx(Button, { variant: 'outline', size: 'sm', onClick: () => { setPanel('object'); }, children: "\u7269 \u5173\u7CFB" }), _jsx(Button, { variant: 'outline', size: 'sm', onClick: () => { setPanel('memory'); }, children: "\u8BB0\u5FC6\u8BB0\u5F55" }), _jsx(Button, { variant: 'outline', size: 'sm', onClick: () => { setPanel('dream'); }, children: "\u68A6\u5883\u8BB0\u5F55" })] }), selfOpen && cardId !== undefined && (_jsx(SelfModal, { face: face, cardId: cardId, state: cardState, onClose: () => { setSelfOpen(false); } })), panel !== undefined && cardId !== undefined && (_jsx(RelationsModal, { face: face, cardId: cardId, mode: panel, onClose: () => { setPanel(undefined); } })), error !== null && _jsx("span", { style: styles.error, children: error }), _jsxs("div", { style: styles.field, children: [_jsxs("span", { style: styles.fieldHead, children: [_jsx("span", { style: styles.fieldLabel, children: "\u57FA\u7840\u9884\u8BBE" }), _jsx("span", { style: { flex: 1 } }), _jsx(Button, { variant: 'outline', size: 'sm', onClick: () => {
                                    void face.presetOptions().then(value => setPresets(value.presets), (error) => window.alert(error instanceof Error ? error.message : String(error)));
                                }, children: "\u5237\u65B0" })] }), _jsxs("select", { style: styles.input, value: basePreset, onChange: event => setBasePreset(event.target.value), children: [_jsx("option", { value: '', children: "\u8BF7\u9009\u62E9\u57FA\u7840\u9884\u8BBE" }), presets.map(one => _jsx("option", { value: one.id, children: one.name }, one.id))] }), _jsx("span", { style: styles.hint, children: "\u5217\u8868\u6765\u81EA\u5F53\u524D Harness \u5B9E\u9645\u6CE8\u518C\u7684\u9884\u8BBE\uFF1B\u65B0\u9884\u8BBE\u9700\u8981\u9009\u4E00\u4E2A\u53EF\u7528\u7684\u57FA\u7840\u9884\u8BBE\u3002" })] }), _jsxs("div", { style: styles.editorFooter, children: [onDelete !== undefined && (_jsx(Button, { variant: 'outline', size: 'sm', style: styles.dangerButton, disabled: busy, onClick: onDelete, children: face.t('delete') })), _jsx("span", { style: { flex: 1 } }), _jsx(Button, { variant: 'outline', size: 'sm', disabled: !complete || busy, disabled: !complete || basePreset === '' || busy, onClick: () => {
                            setBusy(true);
                            // 先保存当前卡片，再用它创建「预设 + 会话」。
                            const body = {
                                plan: draft.plan.trim().toLowerCase(),
                                name: draft.name.trim(),
                                persona: draft.persona,
                                address: draft.address.trim(),
                                embeddingModel: draft.embeddingModel,
                                basePreset,
                                injectGroups: draft.injectGroups,
                            };
                            const save = cardId === undefined ? face.create(body) : face.update({ id: cardId, ...body });
                            void save.then(() => face.createCharacterPreset({
                                plan: draft.plan.trim().toLowerCase(),
                                basePresetId: basePreset,
                            })).then(result => {
                                setBusy(false);
                                window.alert(`已创建预设：${result.plan}\n新建会话选择该预设即可，"前世"会自动注入。`);
                            }, (cause) => {
                                setBusy(false);
                                setError(cause instanceof Error ? cause.message : String(cause));
                            });
                        }, children: "\u521B\u5EFA\u9884\u8BBE" }), _jsx(Button, { variant: 'primary', size: 'sm', disabled: !complete || busy, onClick: submit, children: face.t('save') }), _jsx(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: onCancel, children: face.t('cancel') })] })] }));
}
/**
 * Connect-and-search modal: type a query, KNN against the card's database
 * with its bound embedding engine. Enter searches; results list under the
 * input with distances.
 */
function QueryModal(props) {
    const { face, card, onClose } = props;
    const [text, setText] = useState('');
    const [results, setResults] = useState(undefined);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const search = () => {
        const query = text.trim();
        if (query === '' || busy)
            return;
        setBusy(true);
        setError(null);
        void face.query({ id: card.id, query }).then(value => {
            setBusy(false);
            setResults(value.results);
        }, (cause) => {
            setBusy(false);
            setError(cause instanceof Error ? cause.message : String(cause));
        });
    };
    return (_jsx(Modal, { open: true, onClose: onClose, title: `${face.t('connectDb')} — ${card.name}`, closeLabel: face.t('cancel'), className: css.wide, contentClassName: css.body, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: 'primary', size: 'sm', disabled: text.trim() === '' || busy, onClick: search, children: face.t('search') }), _jsx(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: onClose, children: face.t('cancel') })] }), children: _jsxs("div", { style: styles.modalBody, children: [_jsx("div", { style: { fontSize: 12, opacity: 0.7, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left' }, title: card.address, children: card.address }), _jsx(Input, { "data-modal-autofocus": true, style: styles.modalInput, value: text, placeholder: face.t('queryPlaceholder'), disabled: busy, onChange: event => { setText(event.target.value); }, onKeyDown: event => { if (event.key === 'Enter')
                        search(); } }), busy && _jsx("span", { style: styles.hint, children: face.t('searching') }), error !== null && _jsx("span", { style: styles.error, children: error }), results !== undefined && !busy && error === null && results.length === 0 && (_jsx("span", { style: styles.hint, children: face.t('noResults') })), results !== undefined && results.length > 0 && (_jsx("div", { style: styles.resultList, children: results.map((hit, index) => (_jsxs("div", { style: styles.resultItem, children: [_jsx("span", { style: styles.resultDistance, children: hit.distance.toFixed(4) }), _jsx("span", { style: styles.resultContent, children: hit.content })] }, index))) }))] }) }));
}
function SelfModal(props) {
    const [values, setValues] = useState(props.state.selfState);
    return (_jsx(Modal, { open: true, onClose: props.onClose, title: '\u5DF1 \u00B7 \u72B6\u6001', closeLabel: '\u5173\u95ED', className: css.wide, contentClassName: css.body, children: _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }, children: [_jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }, children: [values.map(one => (_jsxs("label", { style: { display: 'flex', flexDirection: 'column', gap: 3 }, children: [_jsx("span", { style: styles.fieldLabel, children: STATE_LABELS[one.key] ?? one.key }), _jsx("input", { type: 'number', min: one.key === 'valence' ? -1 : 0, max: 1, step: 0.01, style: { ...styles.input, fontSize: 12, textAlign: 'center' }, value: one.value, onChange: event => {
                                        const value = Number(event.target.value);
                                        setValues(current => current.map(item => item.key === one.key ? { ...item, value } : item));
                                    }, onBlur: () => {
                                        void props.face.setSelfState({ id: props.cardId, key: one.key, value: one.value }).catch(() => { });
                                    } })] }, one.key))), values.length === 0 && _jsx("span", { style: styles.hint, children: "\uFF08\u6682\u65E0\u72B6\u6001\u6570\u636E\uFF09" })] }), props.state.selfTags.length > 0 && (_jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: props.state.selfTags.map(tag => _jsx("span", { style: styles.badge, children: tag }, tag)) })), props.state.sleep.length > 0 && (_jsx("span", { style: styles.hint, children: props.state.sleep.map(one => `睡眠中（至 ${one.wakeAt === null ? '未知' : one.wakeAt.slice(0, 16).replace('T', ' ')}）`).join('；') }))] }) }));
}
function RelationsModal(props) {
    const { face, cardId, mode, onClose } = props;
    const [query, setQuery] = useState('');
    const [rows, setRows] = useState([]);
    const [name, setName] = useState('');
    const [extra, setExtra] = useState('');
    const [alias, setAlias] = useState('');
    const [content, setContent] = useState('');
    const [role, setRole] = useState('user');
    const [salience, setSalience] = useState(0.5);
    const [busy, setBusy] = useState(false);
    const load = () => {
        if (mode === 'dream') {
            void face.dreamList({ id: cardId }).then(value => setRows(value.dreams), () => { });
            return;
        }
        if (mode === 'memory') {
            void face.listMemories({ id: cardId, query }).then(value => setRows(value.rows), () => { });
        }
        else {
            void face.listEntities({ id: cardId, kind: mode, query }).then(value => setRows(value.rows), () => { });
        }
    };
    useEffect(load, [cardId, mode]);
    const add = () => {
        setBusy(true);
        if (mode === 'memory') {
            void face.addMemory({ id: cardId, kind: role, content, salience }).then(() => { setContent(''); setBusy(false); load(); }, () => setBusy(false));
        }
        else {
            void face.saveEntity({ id: cardId, kind: mode, entity: { name, description: extra, ...(mode === 'person' ? { aliases: alias } : { category: alias }) } }).then(() => { setName(''); setExtra(''); setBusy(false); load(); }, () => setBusy(false));
        }
    };
    const remove = (entityId) => {
        if (mode === 'memory')
            void face.deleteMemory({ id: cardId, memoryId: entityId }).then(load, () => { });
        else
            void face.deleteEntity({ id: cardId, kind: mode, entityId }).then(load, () => { });
    };
    const attitudeKeys = [...new Set(rows.flatMap(row => (row.attitudes ?? []).map(a => a.key)))];
    const title = mode === 'person' ? '人 关系' : mode === 'object' ? '物 关系' : mode === 'dream' ? '梦境记录' : '记忆记录';
    return (_jsx(Modal, { open: true, onClose: onClose, title: title, closeLabel: '\u5173\u95ED', className: css.xwide, contentClassName: css.body, children: _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }, children: [_jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx(Input, { style: { flex: 1 }, value: query, placeholder: '\u6309\u540D\u79F0/\u5185\u5BB9\u641C\u7D22', onChange: event => setQuery(event.target.value) }), _jsx(Button, { variant: 'outline', size: 'sm', onClick: load, children: "\u641C\u7D22" })] }), (mode === 'person' || mode === 'object') ? (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: [rows.length === 0 && _jsx("span", { style: styles.hint, children: "\uFF08\u6682\u65E0\u8BB0\u5F55\uFF09" }), rows.map(row => {
                            const saveRow = () => {
                                void face.saveEntity({ id: cardId, kind: mode, entity: { id: row.id, name: row.name, description: row.description, aliases: row.aliases, category: row.category } }).then(load, () => { });
                            };
                            return (_jsxs("div", { style: styles.entityRow, children: [_jsxs("label", { style: { ...styles.entityCell, flex: '1 1 120px' }, children: [_jsx("span", { style: styles.fieldLabel, children: "\u540D\u79F0" }), _jsx("input", { style: { ...styles.input, fontSize: 12 }, value: String(row.name ?? ''), onChange: event => { const value = event.target.value; setRows(current => current.map(item => item.id === row.id ? { ...item, name: value } : item)); }, onBlur: saveRow })] }), _jsxs("label", { style: { ...styles.entityCell, flex: '1 1 100px' }, children: [_jsx("span", { style: styles.fieldLabel, children: mode === 'person' ? '别名' : '类别' }), _jsx("input", { style: { ...styles.input, fontSize: 12 }, value: String(mode === 'person' ? (row.aliases ?? '') : (row.category ?? '')), onChange: event => {
                                                    const value = event.target.value;
                                                    setRows(current => current.map(item => item.id === row.id ? { ...item, ...(mode === 'person' ? { aliases: value } : { category: value }) } : item));
                                                }, onBlur: saveRow })] }), _jsxs("label", { style: { ...styles.entityCell, flex: '2 1 200px' }, children: [_jsx("span", { style: styles.fieldLabel, children: "\u63CF\u8FF0" }), _jsx("input", { style: { ...styles.input, fontSize: 12 }, value: String(row.description ?? ''), onChange: event => { const value = event.target.value; setRows(current => current.map(item => item.id === row.id ? { ...item, description: value } : item)); }, onBlur: saveRow })] }), attitudeKeys.map(key => {
                                        const found = (row.attitudes ?? []).find(a => a.key === key);
                                        return (_jsxs("label", { style: { ...styles.entityCell, flex: '0 0 64px' }, children: [_jsx("span", { style: styles.fieldLabel, children: ATTITUDE_LABELS[key] ?? key }), _jsx("input", { type: 'number', min: 0, max: 1, step: 0.01, style: { ...styles.input, fontSize: 12, textAlign: 'center' }, value: found?.value ?? 0.5, onChange: event => {
                                                        const value = Number(event.target.value);
                                                        setRows(current => current.map(item => item.id === row.id
                                                            ? { ...item, attitudes: [...(item.attitudes ?? []).filter(a => a.key !== key), { key, value }] }
                                                            : item));
                                                    }, onBlur: () => { void face.setEntityState({ id: cardId, entityId: String(row.id), key, value: found?.value ?? 0.5 }).catch(() => { }); } })] }, key));
                                    }), _jsx("div", { style: { ...styles.entityCell, flex: '0 0 auto', justifyContent: 'flex-end' }, children: _jsx(Button, { variant: 'outline', size: 'sm', onClick: () => remove(String(row.id)), children: "\u5220\u9664" }) })] }, String(row.id)));
                        })] })) : (_jsxs("table", { style: styles.table, children: [_jsx("thead", { children: mode === 'dream'
                                ? _jsxs("tr", { children: [_jsx("th", { style: styles.th, children: "\u65F6\u95F4" }), _jsx("th", { style: styles.th, children: "\u68A6\u5883" })] })
                                : _jsxs("tr", { children: [_jsx("th", { style: styles.th, children: "\u65F6\u95F4" }), _jsx("th", { style: styles.th, children: "\u89D2\u8272" }), _jsx("th", { style: styles.th, children: "\u5185\u5BB9" }), _jsx("th", { style: styles.th, children: "\u9707\u64BC\u503C" }), _jsx("th", { style: styles.th, children: "\u64CD\u4F5C" })] }) }), _jsxs("tbody", { children: [rows.map(row => (_jsxs("tr", { children: [mode === 'dream' ? (_jsxs(_Fragment, { children: [_jsx("td", { style: { ...styles.td, whiteSpace: 'nowrap', maxWidth: 'none' }, children: String(row.addedAt ?? '').slice(0, 16).replace('T', ' ') }), _jsx("td", { style: styles.td, children: String(row.content ?? '') })] })) : (_jsxs(_Fragment, { children: [_jsx("td", { style: { ...styles.td, whiteSpace: 'nowrap', maxWidth: 'none' }, children: String(row.created_at ?? '').slice(0, 16) }), _jsx("td", { style: styles.td, children: String(row.kind ?? '') }), _jsx("td", { style: styles.td, children: String(row.content ?? '') }), _jsx("td", { style: { ...styles.td, whiteSpace: 'nowrap', maxWidth: 'none' }, children: Number(row.salience ?? 0).toFixed(2) })] })), mode !== 'dream' && _jsx("td", { style: styles.td, children: _jsx(Button, { variant: 'outline', size: 'sm', onClick: () => remove(String(row.id)), children: "\u5220\u9664" }) })] }, String(row.id)))), rows.length === 0 && _jsx("tr", { children: _jsx("td", { style: styles.td, colSpan: mode === 'dream' ? 2 : 5, children: "\uFF08\u6682\u65E0\u8BB0\u5F55\uFF09" }) })] })] })), mode !== 'dream' && _jsx("div", { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }, children: mode === 'memory' ? (_jsxs(_Fragment, { children: [_jsxs("select", { style: styles.input, value: role, onChange: event => setRole(event.target.value), children: [_jsx("option", { value: 'user', children: "\u7528\u6237" }), _jsx("option", { value: 'assistant', children: "\u52A9\u624B" })] }), _jsx(Input, { style: { flex: 1, minWidth: 200 }, value: content, placeholder: '\u8BB0\u5FC6\u5185\u5BB9', onChange: event => setContent(event.target.value) }), _jsx(Input, { style: { width: 90 }, value: String(salience), placeholder: '\u9707\u64BC\u503C', onChange: event => setSalience(Number(event.target.value) || 0) }), _jsx(Button, { variant: 'primary', size: 'sm', disabled: busy || content.trim() === '' || salience < 0 || salience > 1, onClick: add, children: "\u6DFB\u52A0" })] })) : (_jsxs(_Fragment, { children: [_jsx(Input, { style: { flex: 1, minWidth: 140 }, value: name, placeholder: mode === 'person' ? '姓名' : '名称', onChange: event => setName(event.target.value) }), _jsx(Input, { style: { flex: 1, minWidth: 120 }, value: alias, placeholder: mode === 'person' ? '别名' : '类别', onChange: event => setAlias(event.target.value) }), _jsx(Input, { style: { flex: 2, minWidth: 200 }, value: extra, placeholder: '\u63CF\u8FF0', onChange: event => setExtra(event.target.value) }), _jsx(Button, { variant: 'primary', size: 'sm', disabled: busy || name.trim() === '' || extra.trim() === '', onClick: add, children: "\u6DFB\u52A0" })] })) })] }) }));
}
const styles = {
    toolbar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
    error: { color: '#c0392b', fontSize: 13 },
    hint: { opacity: 0.65, fontSize: 13 },
    grid: { display: 'flex', flexDirection: 'column', gap: 8 },
    card: {
        border: '1px solid var(--dsh-border, #ddd)', borderRadius: 10,
        padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8,
    },
    editor: { gap: 12 },
    cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
    cardName: { fontSize: 14 },
    cardDescription: { margin: 0, fontSize: 13, opacity: 0.8 },
    badge: {
        fontSize: 11, padding: '2px 8px', borderRadius: 999,
        background: 'var(--dsh-surface, rgba(127,127,127,0.12))', opacity: 0.85,
    },
    metaRows: { display: 'flex', flexDirection: 'column', gap: 4 },
    metaRow: { display: 'flex', gap: 8, fontSize: 12 },
    metaLabel: { opacity: 0.6, minWidth: 96 },
    metaValue: { fontFamily: 'monospace', wordBreak: 'break-all' },
    fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
    field: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
    fieldLabel: { fontSize: 13, opacity: 0.75 },
    fieldHead: { display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    entityRow: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', padding: '8px 10px', border: '1px solid var(--dsh-border, #ddd)', borderRadius: 10 },
    entityCell: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
    th: { textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--dsh-border, #ccc)', opacity: 0.7 },
    td: { padding: '4px 8px', borderBottom: '1px solid var(--dsh-border, rgba(127,127,127,0.2))', whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: 360 },
    input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)' },
    dangerButton: { color: 'var(--dsw-alias-state-error-primary, #c0392b)' },
    editorFooter: { display: 'flex', alignItems: 'center', gap: 8 },
    modalBody: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 420 },
    modalInput: { width: '100%' },
    resultList: {
        display: 'flex', flexDirection: 'column', gap: 6,
        maxHeight: 320, overflowY: 'auto',
    },
    resultItem: {
        display: 'flex', gap: 10, alignItems: 'baseline',
        padding: '8px 10px', borderRadius: 8,
        background: 'var(--dsh-surface, rgba(127,127,127,0.08))',
    },
    resultDistance: { fontFamily: 'monospace', fontSize: 12, opacity: 0.65, flexShrink: 0 },
    resultContent: { fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
};
//# sourceMappingURL=MemorySection.js.map