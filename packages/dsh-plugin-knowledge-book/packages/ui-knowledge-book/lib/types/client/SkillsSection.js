import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * 设置-技能：全部技能一卡一条。可编辑来源的卡片行内编辑（名称/正文/来源下拉），
 * 插件与会话技能只读；顶部搜索按名称/来源/正文过滤（三个勾选框可多选）；
 * 右上「新建」给出可编辑空卡，名称/正文/来源齐全才可保存，冲突由宿主按
 * kebab-case 后缀规则自动重命名。
 */
import { useEffect, useMemo, useState } from 'react';
const FILTERS = ['name', 'source', 'body'];
/** 卡片右侧的小字来源标签。 */
function SourceTag({ label, t }) {
    return _jsx("span", { style: styles.sourceTag, children: label });
}
export function SkillsSection(props) {
    const { face } = props;
    if (face === undefined)
        return null;
    return _jsx(SkillsLoaded, { face: face });
}
function SkillsLoaded({ face }) {
    const [skills, setSkills] = useState([]);
    const [sources, setSources] = useState([]);
    const [failed, setFailed] = useState(null);
    const [query, setQuery] = useState('');
    const [filters, setFilters] = useState(() => new Set(['name']));
    const [editing, setEditing] = useState(undefined);
    const [notice, setNotice] = useState(null);
    const [bodies, setBodies] = useState(() => new Map());
    const refresh = () => {
        void face.listSkills().then(value => { setSkills(value.skills); setFailed(null); }, (error) => setFailed(error instanceof Error ? error.message : String(error)));
        void face.listSources().then(value => setSources(value.sources));
    };
    useEffect(refresh, [face]);
    // 正文搜索需要正文：勾选「正文」后批量拉取并缓存（本地文件，量小）。
    useEffect(() => {
        if (!filters.has('body'))
            return;
        for (const skill of skills) {
            const key = `${skill.sourceId}\u0000${skill.name}`;
            if (bodies.has(key) || !skill.editable && skill.form === 'runtime')
                continue;
            void face.readSkill(skill.name, skill.sourceId).then(value => setBodies(previous => new Map(previous).set(key, value.body)), () => undefined);
        }
    }, [filters, skills, face]); // eslint-disable-line react-hooks/exhaustive-deps
    const shown = useMemo(() => {
        const text = query.trim().toLowerCase();
        if (text === '')
            return skills;
        const active = [...filters];
        if (active.length === 0)
            return [];
        return skills.filter(skill => active.some(filter => {
            if (filter === 'name')
                return skill.name.toLowerCase().includes(text);
            if (filter === 'source')
                return skill.sourceLabel.toLowerCase().includes(text);
            const key = `${skill.sourceId}\u0000${skill.name}`;
            const body = bodies.get(key) ?? skill.description;
            return body.toLowerCase().includes(text);
        }));
    }, [skills, query, filters, bodies]);
    if (failed !== null) {
        return _jsx("div", { children: _jsxs("p", { children: [face.t('loadFailed'), ' — ', failed] }) });
    }
    return (_jsxs("div", { children: [_jsxs("div", { style: styles.toolbar, children: [_jsx("input", { style: styles.search, placeholder: face.t('search'), value: query, onChange: event => { setQuery(event.target.value); } }), _jsx("div", { style: styles.filters, children: FILTERS.map(filter => (_jsxs("label", { style: styles.filterLabel, children: [_jsx("input", { type: 'checkbox', checked: filters.has(filter), onChange: () => {
                                        setFilters(previous => {
                                            const next = new Set(previous);
                                            if (next.has(filter)) {
                                                // 至少保留一个维度，避免空集等于全隐藏。
                                                if (next.size > 1)
                                                    next.delete(filter);
                                            }
                                            else {
                                                next.add(filter);
                                            }
                                            return next;
                                        });
                                    } }), ' ', face.t(filter === 'name' ? 'byName' : filter === 'source' ? 'bySource' : 'byBody')] }, filter))) }), _jsx("div", { style: { flex: 1 } }), _jsx("button", { style: styles.primaryButton, onClick: () => {
                            setNotice(null);
                            setEditing({
                                fromName: undefined, fromSourceId: undefined,
                                name: '', body: '', sourceId: sources.find(one => one.editable)?.id ?? '',
                            });
                        }, children: face.t('create') })] }), notice !== null && _jsx("p", { style: styles.notice, children: notice }), editing !== undefined && (_jsx(SkillEditor, { face: face, sources: sources, state: editing, onClose: (message, renamed) => {
                    setEditing(undefined);
                    if (message !== undefined)
                        setNotice(renamed === true ? face.t('savedRenamed') : message);
                    refresh();
                } })), shown.length === 0
                ? _jsx("p", { children: face.t('noResults') })
                : (_jsx("div", { style: styles.grid, children: shown.map(skill => (_jsx(SkillCardView, { face: face, skill: skill, body: bodies.get(`${skill.sourceId}\u0000${skill.name}`) ?? skill.description, onEdit: () => {
                            setNotice(null);
                            void face.readSkill(skill.name, skill.sourceId).then(value => {
                                setEditing({
                                    fromName: skill.name, fromSourceId: skill.sourceId,
                                    name: skill.name, body: value.body, sourceId: skill.sourceId,
                                });
                            });
                        }, onDelete: () => {
                            if (!window.confirm(face.t('confirmDelete')))
                                return;
                            void face.deleteSkill(skill.name, skill.sourceId).then(refresh);
                        } }, `${skill.sourceId}\u0000${skill.name}`))) }))] }));
}
function SkillCardView(props) {
    const { face, skill, body, onEdit, onDelete } = props;
    return (_jsxs("div", { style: styles.card, children: [_jsxs("div", { style: styles.cardHead, children: [_jsx("strong", { style: styles.cardName, children: skill.name }), _jsx("span", { style: { flex: 1 } }), _jsx(SourceTag, { label: skill.sourceLabel, t: face.t }), skill.editable && (_jsxs(_Fragment, { children: [_jsx("button", { style: styles.button, onClick: onEdit, children: face.t('edit') }), _jsx("button", { style: styles.dangerButton, onClick: onDelete, children: face.t('delete') })] }))] }), skill.description !== '' && _jsx("p", { style: styles.cardDescription, children: skill.description }), body !== '' && body !== skill.description && _jsx("pre", { style: styles.cardBody, children: clip(body, 8) })] }));
}
function clip(text, maxLines) {
    const lines = text.split('\n');
    return lines.length <= maxLines ? text : `${lines.slice(0, maxLines).join('\n')}\n…`;
}
function SkillEditor(props) {
    const { face, sources, state, onClose } = props;
    const [name, setName] = useState(state.fromName ?? '');
    const [body, setBody] = useState(state.body);
    const [sourceId, setSourceId] = useState(state.sourceId);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const complete = name.trim() !== '' && body.trim() !== '' && sourceId !== '';
    return (_jsxs("div", { style: styles.editor, children: [_jsxs("div", { style: styles.cardHead, children: [_jsx("input", { style: { ...styles.input, flex: 1 }, placeholder: face.t('namePlaceholder'), value: name, onChange: event => { setName(event.target.value); } }), _jsx("select", { style: styles.input, value: sourceId, onChange: event => { setSourceId(event.target.value); }, children: sources.filter(one => one.editable).map(one => (_jsx("option", { value: one.id, children: one.label }, one.id))) }), _jsx("button", { style: { ...styles.primaryButton, opacity: complete && !busy ? 1 : 0.5 }, disabled: !complete || busy, onClick: () => {
                            setBusy(true);
                            setError(null);
                            void face.saveSkill({
                                fromName: state.fromName,
                                fromSourceId: state.fromSourceId,
                                targetSourceId: sourceId,
                                name: name.trim(),
                                body,
                            }).then(result => {
                                setBusy(false);
                                onClose(result.renamed ? face.t('savedRenamed') : face.t('saved'), result.renamed);
                            }, (saveError) => {
                                setBusy(false);
                                setError(saveError instanceof Error ? saveError.message : String(saveError));
                            });
                        }, children: face.t('save') }), _jsx("button", { style: styles.button, onClick: () => { onClose(undefined); }, children: face.t('cancel') })] }), error !== null && _jsxs("p", { style: styles.error, children: [face.t('saveFailed'), ' — ', error] }), _jsx("textarea", { style: styles.textarea, placeholder: face.t('bodyPlaceholder'), value: body, onChange: event => { setBody(event.target.value); }, rows: 12 })] }));
}
const styles = {
    toolbar: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
    search: { flex: 1, maxWidth: 320, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)' },
    filters: { display: 'flex', gap: 12, marginLeft: 8 },
    filterLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, whiteSpace: 'nowrap' },
    primaryButton: { padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600 },
    button: { padding: '4px 12px', borderRadius: 8, cursor: 'pointer' },
    dangerButton: { padding: '4px 12px', borderRadius: 8, cursor: 'pointer', color: '#c0392b' },
    notice: { color: '#2e7d32', fontSize: 13 },
    error: { color: '#c0392b', fontSize: 13 },
    grid: { display: 'flex', flexDirection: 'column', gap: 8 },
    card: { border: '1px solid var(--dsh-border, #ddd)', borderRadius: 10, padding: '10px 14px' },
    cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
    cardName: { fontSize: 14 },
    sourceTag: { fontSize: 12, opacity: 0.65, whiteSpace: 'nowrap' },
    cardDescription: { margin: '6px 0 0', fontSize: 13, opacity: 0.8 },
    cardBody: {
        margin: '6px 0 0', fontSize: 12, whiteSpace: 'pre-wrap',
        background: 'var(--dsh-surface, rgba(127,127,127,0.08))', padding: 8, borderRadius: 6,
    },
    editor: {
        border: '1px solid var(--dsh-border, #ccc)', borderRadius: 10,
        padding: '10px 14px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8,
    },
    input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)' },
    textarea: {
        width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13,
        borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)', padding: 8, resize: 'vertical',
    },
};
//# sourceMappingURL=SkillsSection.js.map