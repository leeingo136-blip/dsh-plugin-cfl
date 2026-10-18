import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 设置-技能：全部技能一卡一条。可编辑来源的卡片点「编辑」后原位变为编辑态
 * （名称/来源下拉/简介/正文），操作行在编辑态末行：删除靠左，保存/取消靠右，
 * 新建态无删除；插件与会话技能只读；顶部搜索按名称/来源/正文过滤
 * （三个勾选框可多选）；右上「新建」在顶部给出可编辑空卡，名称/正文/来源齐全
 * 才可保存，冲突由宿主按 kebab-case 后缀规则自动重命名。正文维度搜索同时
 * 匹配简介与正文；正文预览仅在正文维度命中搜索词的卡片上展开。
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
const FILTERS = ['name', 'source', 'body'];
const EMPTY_STRINGS = new Set();
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
    const closeEditor = (message, renamed) => {
        setEditing(undefined);
        if (message !== undefined)
            setNotice(renamed === true ? face.t('savedRenamed') : message);
        refresh();
    };
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
    // 过滤结果 + 正文命中集合：正文预览只在「正文维度命中搜索词」时展示。
    // 正文维度同时匹配简介与正文；无搜索词时全部展示且不显示预览。
    const shown = useMemo(() => {
        const text = query.trim().toLowerCase();
        if (text === '')
            return { list: skills, bodyHits: EMPTY_STRINGS };
        const active = [...filters];
        if (active.length === 0)
            return { list: [], bodyHits: EMPTY_STRINGS };
        const bodyHits = new Set();
        const list = skills.filter(skill => {
            const key = `${skill.sourceId}\u0000${skill.name}`;
            return active.some(filter => {
                if (filter === 'name')
                    return skill.name.toLowerCase().includes(text);
                if (filter === 'source')
                    return skill.sourceLabel.toLowerCase().includes(text);
                const body = bodies.get(key);
                const hitDescription = skill.description.toLowerCase().includes(text);
                const hitBody = body !== undefined && body.toLowerCase().includes(text);
                if (hitBody)
                    bodyHits.add(key);
                return hitDescription || hitBody;
            });
        });
        return { list, bodyHits };
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
                                    } }), ' ', face.t(filter === 'name' ? 'byName' : filter === 'source' ? 'bySource' : 'byBody')] }, filter))) }), _jsx("div", { style: { flex: 1 } }), _jsx(Button, { variant: 'primary', size: 'sm', onClick: () => {
                            setNotice(null);
                            setEditing({
                                fromName: undefined, fromSourceId: undefined,
                                name: '', description: '', body: '',
                                sourceId: sources.find(one => one.editable)?.id ?? '',
                            });
                        }, children: face.t('create') })] }), notice !== null && _jsx("p", { style: styles.notice, children: notice }), editing !== undefined && editing.fromName === undefined && (_jsx(SkillEditor, { face: face, sources: sources, state: editing, onClose: closeEditor })), shown.list.length === 0
                ? _jsx("p", { children: face.t('noResults') })
                : (_jsx("div", { style: styles.grid, children: shown.list.map(skill => {
                        const editKey = `${skill.sourceId}\u0000${skill.name}`;
                        const editingThis = editing !== undefined &&
                            editing.fromName === skill.name &&
                            editing.fromSourceId === skill.sourceId;
                        if (editingThis) {
                            return (_jsx(SkillEditor, { face: face, sources: sources, state: editing, onClose: closeEditor }, editKey));
                        }
                        // 正文预览：仅当正文维度命中当前搜索词时才展开。
                        const preview = shown.bodyHits.has(editKey) && query.trim() !== ''
                            ? bodies.get(editKey)
                            : undefined;
                        return (_jsx(SkillCardView, { face: face, skill: skill, body: preview, onEdit: () => {
                                setNotice(null);
                                void face.readSkill(skill.name, skill.sourceId).then(value => {
                                    setEditing({
                                        fromName: skill.name, fromSourceId: skill.sourceId,
                                        name: skill.name, description: skill.description,
                                        body: value.body, sourceId: skill.sourceId,
                                    });
                                });
                            } }, editKey));
                    }) }))] }));
}
function SkillCardView(props) {
    const { face, skill, body, onEdit } = props;
    return (_jsxs("div", { style: styles.card, children: [_jsxs("div", { style: styles.cardHead, children: [_jsx("strong", { style: styles.cardName, children: skill.name }), _jsx("span", { style: { flex: 1 } }), _jsx(SourceTag, { label: skill.sourceLabel, t: face.t }), skill.editable && (_jsx(Button, { variant: 'outline', size: 'sm', onClick: onEdit, children: face.t('edit') }))] }), skill.description !== '' && _jsx("p", { style: styles.cardDescription, children: skill.description }), body !== undefined && body !== '' && body !== skill.description &&
                _jsx("pre", { style: styles.cardBody, children: clip(body, 8) })] }));
}
function clip(text, maxLines) {
    const lines = text.split('\n');
    return lines.length <= maxLines ? text : `${lines.slice(0, maxLines).join('\n')}\n…`;
}
function SkillEditor(props) {
    const { face, sources, state, onClose } = props;
    const [name, setName] = useState(state.fromName ?? '');
    const [description, setDescription] = useState(state.description);
    const [body, setBody] = useState(state.body);
    const [sourceId, setSourceId] = useState(state.sourceId);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const complete = name.trim() !== '' && body.trim() !== '' && sourceId !== '';
    return (_jsxs("div", { style: styles.editor, children: [_jsxs("div", { style: styles.cardHead, children: [_jsx("input", { style: { ...styles.input, flex: 1 }, placeholder: face.t('namePlaceholder'), value: name, onChange: event => { setName(event.target.value); } }), _jsx("select", { style: styles.input, value: sourceId, onChange: event => { setSourceId(event.target.value); }, children: sources.filter(one => one.editable).map(one => (_jsx("option", { value: one.id, children: one.label }, one.id))) })] }), error !== null && _jsxs("p", { style: styles.error, children: [face.t('saveFailed'), ' — ', error] }), _jsx("input", { style: styles.input, placeholder: face.t('descPlaceholder'), value: description, onChange: event => { setDescription(event.target.value); } }), _jsx("textarea", { style: styles.textarea, placeholder: face.t('bodyPlaceholder'), value: body, onChange: event => { setBody(event.target.value); }, rows: 12 }), _jsxs("div", { style: styles.editorFooter, children: [state.fromName !== undefined && (_jsx(Button, { variant: 'outline', size: 'sm', style: styles.dangerButton, disabled: busy, onClick: () => {
                            if (!window.confirm(face.t('confirmDelete')))
                                return;
                            setBusy(true);
                            void face.deleteSkill(state.fromName, state.fromSourceId).then(() => { onClose(undefined); }, (deleteError) => {
                                setBusy(false);
                                setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
                            });
                        }, children: face.t('delete') })), _jsx("span", { style: { flex: 1 } }), _jsx(Button, { variant: 'primary', size: 'sm', disabled: !complete || busy, onClick: () => {
                            setBusy(true);
                            setError(null);
                            void face.saveSkill({
                                fromName: state.fromName,
                                fromSourceId: state.fromSourceId,
                                targetSourceId: sourceId,
                                name: name.trim(),
                                description: description.trim(),
                                body,
                            }).then(result => {
                                setBusy(false);
                                onClose(result.renamed ? face.t('savedRenamed') : face.t('saved'), result.renamed);
                            }, (saveError) => {
                                setBusy(false);
                                setError(saveError instanceof Error ? saveError.message : String(saveError));
                            });
                        }, children: face.t('save') }), _jsx(Button, { variant: 'outline', size: 'sm', onClick: () => { onClose(undefined); }, children: face.t('cancel') })] })] }));
}
const styles = {
    toolbar: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
    search: { flex: 1, maxWidth: 320, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)' },
    filters: { display: 'flex', gap: 12, marginLeft: 8 },
    filterLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, whiteSpace: 'nowrap' },
    dangerButton: { color: 'var(--dsw-alias-state-error-primary, #c0392b)' },
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
    editorFooter: { display: 'flex', alignItems: 'center', gap: 8 },
    input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)' },
    textarea: {
        width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13,
        borderRadius: 8, border: '1px solid var(--dsh-border, #ccc)', padding: 8, resize: 'vertical',
    },
};
//# sourceMappingURL=SkillsSection.js.map