import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * 设置-知识库：本地 sqlite-vec 知识库的配置、入库、查询与删除。
 * 库卡片显示名称/描述/向量模型/维度/条目数；顶部新建表单；
 * 每张卡内嵌查询框与入库文本框。
 */
import { useEffect, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
export function KnowledgeSection(props) {
    const { face } = props;
    if (face === undefined)
        return null;
    return _jsx(RagLoaded, { face: face });
}
function RagLoaded({ face }) {
    const [databases, setDatabases] = useState([]);
    const [failed, setFailed] = useState(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const refresh = () => {
        void face.list().then(value => { setDatabases(value.databases); setFailed(null); }, (error) => setFailed(error instanceof Error ? error.message : String(error)));
    };
    useEffect(refresh, [face]);
    return (_jsxs("div", { children: [_jsxs("div", { style: styles.createRow, children: [_jsx("input", { style: { ...styles.input, flex: 1 }, placeholder: face.t('ragName'), value: name, onChange: event => { setName(event.target.value); } }), _jsx("input", { style: { ...styles.input, flex: 2 }, placeholder: face.t('ragDescription'), value: description, onChange: event => { setDescription(event.target.value); } }), _jsx(Button, { variant: 'primary', size: 'sm', disabled: name.trim() === '' || busy, onClick: () => {
                            setBusy(true);
                            void face.create(name.trim(), description.trim()).then(() => {
                                setName('');
                                setDescription('');
                                setBusy(false);
                                refresh();
                            }, (error) => {
                                setBusy(false);
                                setFailed(error instanceof Error ? error.message : String(error));
                            });
                        }, children: face.t('ragAdd') })] }), failed !== null && _jsxs("p", { style: styles.error, children: [face.t('loadFailed'), ' — ', failed] }), databases.length === 0
                ? _jsx("p", { children: face.t('empty') })
                : (_jsx("div", { style: styles.grid, children: databases.map(database => (_jsx(DatabaseCard, { face: face, database: database, onChange: refresh }, database.id))) }))] }));
}
function DatabaseCard(props) {
    const { face, database, onChange } = props;
    const [query, setQuery] = useState('');
    const [topK, setTopK] = useState(5);
    const [hits, setHits] = useState([]);
    const [ingestText, setIngestText] = useState('');
    const [notice, setNotice] = useState(null);
    const [error, setError] = useState(null);
    return (_jsxs("div", { style: styles.card, children: [_jsxs("div", { style: styles.cardHead, children: [_jsx("strong", { style: styles.cardName, children: database.name }), _jsx("span", { style: { flex: 1 } }), _jsxs("span", { style: styles.meta, children: [face.t('ragChunks'), " ", database.chunks, ' · ', face.t('ragDims'), " ", database.dimension, database.model !== '' && _jsxs(_Fragment, { children: [" \u00B7 ", face.t('ragModel'), " ", database.model] })] }), _jsx(Button, { variant: 'ghost', size: 'sm', style: styles.dangerButton, onClick: () => {
                            if (!window.confirm(face.t('ragDeleteConfirm')))
                                return;
                            void face.remove(database.id).then(onChange);
                        }, children: face.t('delete') })] }), database.description !== '' && _jsx("p", { style: styles.cardDescription, children: database.description }), _jsxs("div", { style: styles.row, children: [_jsx("input", { style: { ...styles.input, flex: 1 }, placeholder: face.t('ragQueryPlaceholder'), value: query, onChange: event => { setQuery(event.target.value); }, onKeyDown: event => {
                            if (event.key === 'Enter' && query.trim() !== '') {
                                void face.query(database.id, query.trim(), topK).then(value => { setHits(value.results); setError(null); }, (error) => setError(error instanceof Error ? error.message : String(error)));
                            }
                        } }), _jsxs("label", { style: styles.meta, children: [face.t('ragTopK'), ' ', _jsx("input", { type: 'number', min: 1, max: 50, value: topK, onChange: event => { setTopK(Number(event.target.value) || 5); }, style: { ...styles.input, width: 64 } })] }), _jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => {
                            void face.query(database.id, query.trim(), topK).then(value => { setHits(value.results); setError(null); }, (error) => setError(error instanceof Error ? error.message : String(error)));
                        }, children: face.t('ragRun') })] }), _jsx("textarea", { style: styles.textarea, rows: 3, placeholder: face.t('ragIngestPlaceholder'), value: ingestText, onChange: event => { setIngestText(event.target.value); } }), _jsxs("div", { style: styles.row, children: [_jsx(Button, { variant: 'ghost', size: 'sm', disabled: ingestText.trim() === '', onClick: () => {
                            const texts = ingestText.split('\n').map(one => one.trim()).filter(one => one !== '');
                            void face.ingest(database.id, texts).then(value => {
                                setIngestText('');
                                setNotice(`${face.t('ragIngest')}：${value.count}`);
                                onChange();
                            }, (error) => setError(error instanceof Error ? error.message : String(error)));
                        }, children: face.t('ragIngest') }), notice !== null && _jsx("span", { style: styles.notice, children: notice }), error !== null && _jsx("span", { style: styles.error, children: error })] }), hits.length > 0 && (_jsxs("div", { children: [_jsx("p", { style: styles.resultsTitle, children: face.t('ragResults') }), hits.map((hit, index) => (_jsxs("div", { style: styles.hit, children: [_jsx("span", { style: styles.hitDistance, children: hit.distance.toFixed(4) }), _jsx("span", { style: styles.hitContent, children: hit.content })] }, index)))] }))] }));
}
const styles = {
    createRow: { display: 'flex', gap: 8, marginBottom: 12 },
    input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)' },
    dangerButton: { color: 'var(--dsw-alias-state-error-primary, #c0392b)' },
    error: { color: '#c0392b', fontSize: 13 },
    notice: { color: '#2e7d32', fontSize: 13 },
    grid: { display: 'flex', flexDirection: 'column', gap: 8 },
    card: {
        border: '1px solid var(--dsh-border, #ddd)', borderRadius: 10,
        padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8,
    },
    cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
    cardName: { fontSize: 14 },
    cardDescription: { margin: 0, fontSize: 13, opacity: 0.8 },
    meta: { fontSize: 12, opacity: 0.65, whiteSpace: 'nowrap' },
    row: { display: 'flex', alignItems: 'center', gap: 8 },
    textarea: {
        width: '100%', boxSizing: 'border-box', fontSize: 13,
        borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)', padding: 8, resize: 'vertical',
    },
    resultsTitle: { margin: '4px 0', fontSize: 13, fontWeight: 600 },
    hit: { display: 'flex', gap: 10, padding: '6px 8px', borderRadius: 6, background: 'var(--dsh-surface, rgba(127,127,127,0.08))', marginBottom: 4 },
    hitDistance: { fontSize: 12, fontFamily: 'monospace', opacity: 0.7, minWidth: 56 },
    hitContent: { fontSize: 13, whiteSpace: 'pre-wrap' },
};
//# sourceMappingURL=KnowledgeSection.js.map