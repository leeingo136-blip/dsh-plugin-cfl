import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 设置-记忆回想：RAG 数据库连接卡片。
 * 每张卡片显示一个连接（名称/类型/地址/embedding 引擎）；新建与编辑共用
 * 一个编辑器——新建时渲染在列表顶部，编辑时原位替换该卡片。名称唯一，
 * 作为工具参数明确连接哪个数据库；删除在编辑器末行左侧，保存/取消居右。
 */
import { useEffect, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
const draftOf = (card) => ({
    name: card?.name ?? '',
    description: card?.description ?? '',
    kind: card?.kind ?? 'local',
    address: card?.address ?? '',
    embeddingModel: card?.embeddingModel ?? '',
});
export function MemorySection(props) {
    const { face } = props;
    if (face === undefined)
        return null;
    return _jsx(MemoryLoaded, { face: face });
}
function MemoryLoaded({ face }) {
    const [cards, setCards] = useState([]);
    const [failed, setFailed] = useState(null);
    /** The card being edited (id), or 'new' for the creation editor, or undefined. */
    const [editing, setEditing] = useState(undefined);
    const refresh = () => {
        void face.list().then(value => { setCards(value.connections); setFailed(null); }, (error) => setFailed(error instanceof Error ? error.message : String(error)));
    };
    useEffect(refresh, [face]);
    return (_jsxs("div", { children: [_jsxs("div", { style: styles.toolbar, children: [_jsx(Button, { variant: 'primary', size: 'sm', disabled: editing === 'new', onClick: () => { setEditing('new'); }, children: face.t('createCard') }), failed !== null && _jsxs("span", { style: styles.error, children: [face.t('loadFailed'), ' — ', failed] })] }), cards.length === 0 && editing === undefined && (_jsxs("p", { children: [face.t('empty'), _jsxs("span", { style: styles.hint, children: [' — ', face.t('emptyHint')] })] })), _jsxs("div", { style: styles.grid, children: [editing === 'new' && (_jsx(CardEditor, { face: face, cards: cards, draft: draftOf(), onDone: () => { setEditing(undefined); refresh(); }, onCancel: () => { setEditing(undefined); } }, 'new')), cards.map(card => (editing === card.id
                        ? (_jsx(CardEditor, { face: face, cards: cards, draft: draftOf(card), cardId: card.id, onDone: () => { setEditing(undefined); refresh(); }, onCancel: () => { setEditing(undefined); }, onDelete: () => {
                                if (!window.confirm(face.t('deleteConfirm')))
                                    return;
                                void face.remove(card.id).then(() => { setEditing(undefined); refresh(); });
                            } }, card.id))
                        : _jsx(CardView, { face: face, card: card, onEdit: () => { setEditing(card.id); } }, card.id)))] })] }));
}
function CardView(props) {
    const { face, card, onEdit } = props;
    return (_jsxs("div", { style: styles.card, children: [_jsxs("div", { style: styles.cardHead, children: [_jsx("strong", { style: styles.cardName, children: card.name }), _jsx("span", { style: styles.badge, children: card.kind === 'local' ? face.t('kindLocal') : face.t('kindService') }), _jsx("span", { style: { flex: 1 } }), _jsx(Button, { variant: 'outline', size: 'sm', onClick: onEdit, children: face.t('editCard') })] }), card.description !== '' && _jsx("p", { style: styles.cardDescription, children: card.description }), _jsxs("div", { style: styles.metaRows, children: [_jsxs("span", { style: styles.metaRow, children: [_jsx("span", { style: styles.metaLabel, children: face.t('fieldAddress') }), _jsx("span", { style: styles.metaValue, children: card.address })] }), _jsxs("span", { style: styles.metaRow, children: [_jsx("span", { style: styles.metaLabel, children: face.t('fieldEmbedding') }), _jsx("span", { style: styles.metaValue, children: card.embeddingModel })] })] })] }));
}
function CardEditor(props) {
    const { face, cards, cardId, onDone, onCancel, onDelete } = props;
    const [draft, setDraft] = useState(props.draft);
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
    const nameTaken = cards.some(one => one.name === draft.name.trim() && one.id !== cardId);
    const complete = draft.name.trim() !== '' && draft.address.trim() !== '' && draft.embeddingModel !== '';
    const submit = () => {
        if (nameTaken) {
            setError(face.t('nameDuplicate'));
            return;
        }
        setBusy(true);
        const body = {
            name: draft.name.trim(),
            description: draft.description.trim(),
            kind: draft.kind,
            address: draft.address.trim(),
            embeddingModel: draft.embeddingModel,
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
    return (_jsxs("div", { style: { ...styles.card, ...styles.editor }, children: [_jsx("strong", { style: styles.cardName, children: cardId === undefined ? face.t('newCardTitle') : face.t('editCard') }), _jsxs("label", { style: styles.field, children: [_jsx("span", { style: styles.fieldLabel, children: face.t('fieldName') }), _jsx("input", { style: styles.input, value: draft.name, placeholder: face.t('fieldNameHint'), onChange: event => { setDraft({ ...draft, name: event.target.value }); } }), nameTaken && _jsx("span", { style: styles.error, children: face.t('nameDuplicate') })] }), _jsxs("label", { style: styles.field, children: [_jsx("span", { style: styles.fieldLabel, children: face.t('fieldDescription') }), _jsx("input", { style: styles.input, value: draft.description, onChange: event => { setDraft({ ...draft, description: event.target.value }); } })] }), _jsxs("label", { style: styles.field, children: [_jsx("span", { style: styles.fieldLabel, children: face.t('fieldKind') }), _jsxs("select", { style: styles.input, value: draft.kind, onChange: event => { setDraft({ ...draft, kind: event.target.value }); }, children: [_jsx("option", { value: 'local', children: face.t('kindLocal') }), _jsx("option", { value: 'service', children: face.t('kindService') })] })] }), _jsxs("label", { style: styles.field, children: [_jsx("span", { style: styles.fieldLabel, children: face.t('fieldAddress') }), _jsx("input", { style: styles.input, value: draft.address, placeholder: draft.kind === 'local' ? face.t('addressPlaceholderLocal') : face.t('addressPlaceholderService'), onChange: event => { setDraft({ ...draft, address: event.target.value }); } })] }), _jsxs("label", { style: styles.field, children: [_jsx("span", { style: styles.fieldLabel, children: face.t('fieldEmbedding') }), _jsxs("select", { style: styles.input, value: draft.embeddingModel, onChange: event => { setDraft({ ...draft, embeddingModel: event.target.value }); }, children: [_jsx("option", { value: '', children: face.t('embeddingPick') }), models.map(model => (_jsx("option", { value: model.id, children: model.id }, model.id)))] }), !embeddingAvailable && _jsx("span", { style: styles.hint, children: face.t('embeddingUnavailable') })] }), error !== null && _jsx("span", { style: styles.error, children: error }), _jsxs("div", { style: styles.editorFooter, children: [onDelete !== undefined && (_jsx(Button, { variant: 'outline', size: 'sm', style: styles.dangerButton, disabled: busy, onClick: onDelete, children: face.t('delete') })), _jsx("span", { style: { flex: 1 } }), _jsx(Button, { variant: 'primary', size: 'sm', disabled: !complete || busy, onClick: submit, children: face.t('save') }), _jsx(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: onCancel, children: face.t('cancel') })] })] }));
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
    field: { display: 'flex', flexDirection: 'column', gap: 4 },
    fieldLabel: { fontSize: 13, opacity: 0.75 },
    input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)' },
    dangerButton: { color: 'var(--dsw-alias-state-error-primary, #c0392b)' },
    editorFooter: { display: 'flex', alignItems: 'center', gap: 8 },
};
//# sourceMappingURL=MemorySection.js.map