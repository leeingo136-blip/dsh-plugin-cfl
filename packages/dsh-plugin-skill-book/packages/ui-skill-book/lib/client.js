window.__ModuleLoader__.load({
	id: "@dsh/ui-skill-book",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locales.ts
		const zh = {
			navSkills: "技能",
			loadFailed: "加载失败",
			empty: "暂无内容",
			reload: "刷新",
			search: "搜索",
			byName: "名称",
			bySource: "来源",
			byBody: "正文",
			create: "新建",
			edit: "编辑",
			save: "保存",
			cancel: "取消",
			delete: "删除",
			confirmDelete: "确定删除该技能？",
			name: "名称",
			source: "来源",
			body: "正文",
			bodyPreview: "正文预览",
			saveFailed: "保存失败",
			savedRenamed: "已保存（名称冲突，已自动重命名）",
			saved: "已保存",
			noResults: "没有匹配的技能",
			namePlaceholder: "技能名称（kebab-case）",
			descPlaceholder: "简介（可选，留空取正文首行）",
			bodyPlaceholder: "技能正文（Markdown 指令）",
			pickSource: "选择来源"
		};
		const en = {
			navSkills: "Skills",
			loadFailed: "Load failed",
			empty: "Nothing here yet",
			reload: "Reload",
			search: "Search",
			byName: "Name",
			bySource: "Source",
			byBody: "Body",
			create: "New",
			edit: "Edit",
			save: "Save",
			cancel: "Cancel",
			delete: "Delete",
			confirmDelete: "Delete this skill?",
			name: "Name",
			source: "Source",
			body: "Body",
			bodyPreview: "Preview",
			saveFailed: "Save failed",
			savedRenamed: "Saved (name conflict auto-renamed)",
			saved: "Saved",
			noResults: "No matching skills",
			namePlaceholder: "Skill name (kebab-case)",
			descPlaceholder: "Description (optional; falls back to first body line)",
			bodyPlaceholder: "Skill body (Markdown instructions)",
			pickSource: "Pick a source"
		};
		//#endregion
		//#region src/client/SkillsSection.tsx
		/**
		* 设置-技能：全部技能一卡一条。可编辑来源的卡片点「编辑」后原位变为编辑态
		* （名称/来源下拉/简介/正文），操作行在编辑态末行：删除靠左，保存/取消靠右，
		* 新建态无删除；插件与会话技能只读；顶部搜索按名称/来源/正文过滤
		* （三个勾选框可多选）；右上「新建」在顶部给出可编辑空卡，名称/正文/来源齐全
		* 才可保存，冲突由宿主按 kebab-case 后缀规则自动重命名。正文维度搜索同时
		* 匹配简介与正文；正文预览仅在正文维度命中搜索词的卡片上展开。
		*/
		const FILTERS = [
			"name",
			"source",
			"body"
		];
		const EMPTY_STRINGS = /* @__PURE__ */ new Set();
		/** 卡片右侧的小字来源标签。 */
		function SourceTag({ label, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: styles.sourceTag,
				children: label
			});
		}
		function SkillsSection(props) {
			const { face } = props;
			if (face === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillsLoaded, { face });
		}
		function SkillsLoaded({ face }) {
			const [skills, setSkills] = (0, react.useState)([]);
			const [sources, setSources] = (0, react.useState)([]);
			const [failed, setFailed] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const [filters, setFilters] = (0, react.useState)(() => /* @__PURE__ */ new Set(["name"]));
			const [editing, setEditing] = (0, react.useState)(void 0);
			const [notice, setNotice] = (0, react.useState)(null);
			const [bodies, setBodies] = (0, react.useState)(() => /* @__PURE__ */ new Map());
			const refresh = () => {
				face.listSkills().then((value) => {
					setSkills(value.skills);
					setFailed(null);
				}, (error) => setFailed(error instanceof Error ? error.message : String(error)));
				face.listSources().then((value) => setSources(value.sources));
			};
			(0, react.useEffect)(refresh, [face]);
			const closeEditor = (message, renamed) => {
				setEditing(void 0);
				if (message !== void 0) setNotice(renamed === true ? face.t("savedRenamed") : message);
				refresh();
			};
			(0, react.useEffect)(() => {
				if (!filters.has("body")) return;
				for (const skill of skills) {
					const key = `${skill.sourceId}\u0000${skill.name}`;
					if (bodies.has(key) || !skill.editable && skill.form === "runtime") continue;
					face.readSkill(skill.name, skill.sourceId).then((value) => setBodies((previous) => new Map(previous).set(key, value.body)), () => void 0);
				}
			}, [
				filters,
				skills,
				face
			]);
			const shown = (0, react.useMemo)(() => {
				const text = query.trim().toLowerCase();
				if (text === "") return {
					list: skills,
					bodyHits: EMPTY_STRINGS
				};
				const active = [...filters];
				if (active.length === 0) return {
					list: [],
					bodyHits: EMPTY_STRINGS
				};
				const bodyHits = /* @__PURE__ */ new Set();
				return {
					list: skills.filter((skill) => {
						const key = `${skill.sourceId}\u0000${skill.name}`;
						return active.some((filter) => {
							if (filter === "name") return skill.name.toLowerCase().includes(text);
							if (filter === "source") return skill.sourceLabel.toLowerCase().includes(text);
							const body = bodies.get(key);
							const hitDescription = skill.description.toLowerCase().includes(text);
							const hitBody = body !== void 0 && body.toLowerCase().includes(text);
							if (hitBody) bodyHits.add(key);
							return hitDescription || hitBody;
						});
					}),
					bodyHits
				};
			}, [
				skills,
				query,
				filters,
				bodies
			]);
			if (failed !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
				face.t("loadFailed"),
				" — ",
				failed
			] }) });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: styles.toolbar,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							style: styles.search,
							placeholder: face.t("search"),
							value: query,
							onChange: (event) => {
								setQuery(event.target.value);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: styles.filters,
							children: FILTERS.map((filter) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: styles.filterLabel,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: filters.has(filter),
										onChange: () => {
											setFilters((previous) => {
												const next = new Set(previous);
												if (next.has(filter)) {
													if (next.size > 1) next.delete(filter);
												} else next.add(filter);
												return next;
											});
										}
									}),
									" ",
									face.t(filter === "name" ? "byName" : filter === "source" ? "bySource" : "byBody")
								]
							}, filter))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: { flex: 1 } }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "sm",
							onClick: () => {
								setNotice(null);
								setEditing({
									fromName: void 0,
									fromSourceId: void 0,
									name: "",
									description: "",
									body: "",
									sourceId: sources.find((one) => one.editable)?.id ?? ""
								});
							},
							children: face.t("create")
						})
					]
				}),
				notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: styles.notice,
					children: notice
				}),
				editing !== void 0 && editing.fromName === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillEditor, {
					face,
					sources,
					state: editing,
					onClose: closeEditor
				}),
				shown.list.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: face.t("noResults") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: styles.grid,
					children: shown.list.map((skill) => {
						const editKey = `${skill.sourceId}\u0000${skill.name}`;
						if (editing !== void 0 && editing.fromName === skill.name && editing.fromSourceId === skill.sourceId) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillEditor, {
							face,
							sources,
							state: editing,
							onClose: closeEditor
						}, editKey);
						const preview = shown.bodyHits.has(editKey) && query.trim() !== "" ? bodies.get(editKey) : void 0;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillCardView, {
							face,
							skill,
							body: preview,
							onEdit: () => {
								setNotice(null);
								face.readSkill(skill.name, skill.sourceId).then((value) => {
									setEditing({
										fromName: skill.name,
										fromSourceId: skill.sourceId,
										name: skill.name,
										description: skill.description,
										body: value.body,
										sourceId: skill.sourceId
									});
								});
							}
						}, editKey);
					})
				})
			] });
		}
		function SkillCardView(props) {
			const { face, skill, body, onEdit } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.cardHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
								style: styles.cardName,
								children: skill.name
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourceTag, {
								label: skill.sourceLabel,
								t: face.t
							}),
							skill.editable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: onEdit,
								children: face.t("edit")
							})
						]
					}),
					skill.description !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles.cardDescription,
						children: skill.description
					}),
					body !== void 0 && body !== "" && body !== skill.description && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						style: styles.cardBody,
						children: clip(body, 8)
					})
				]
			});
		}
		function clip(text, maxLines) {
			const lines = text.split("\n");
			return lines.length <= maxLines ? text : `${lines.slice(0, maxLines).join("\n")}\n…`;
		}
		function SkillEditor(props) {
			const { face, sources, state, onClose } = props;
			const [name, setName] = (0, react.useState)(state.fromName ?? "");
			const [description, setDescription] = (0, react.useState)(state.description);
			const [body, setBody] = (0, react.useState)(state.body);
			const [sourceId, setSourceId] = (0, react.useState)(state.sourceId);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const complete = name.trim() !== "" && body.trim() !== "" && sourceId !== "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles.editor,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.cardHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							style: {
								...styles.input,
								flex: 1
							},
							placeholder: face.t("namePlaceholder"),
							value: name,
							onChange: (event) => {
								setName(event.target.value);
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							style: styles.input,
							value: sourceId,
							onChange: (event) => {
								setSourceId(event.target.value);
							},
							children: sources.filter((one) => one.editable).map((one) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: one.id,
								children: one.label
							}, one.id))
						})]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						style: styles.error,
						children: [
							face.t("saveFailed"),
							" — ",
							error
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						style: styles.input,
						placeholder: face.t("descPlaceholder"),
						value: description,
						onChange: (event) => {
							setDescription(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						style: styles.textarea,
						placeholder: face.t("bodyPlaceholder"),
						value: body,
						onChange: (event) => {
							setBody(event.target.value);
						},
						rows: 12
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.editorFooter,
						children: [
							state.fromName !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								style: styles.dangerButton,
								disabled: busy,
								onClick: () => {
									if (!window.confirm(face.t("confirmDelete"))) return;
									setBusy(true);
									face.deleteSkill(state.fromName, state.fromSourceId).then(() => {
										onClose(void 0);
									}, (deleteError) => {
										setBusy(false);
										setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
									});
								},
								children: face.t("delete")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								size: "sm",
								disabled: !complete || busy,
								onClick: () => {
									setBusy(true);
									setError(null);
									face.saveSkill({
										fromName: state.fromName,
										fromSourceId: state.fromSourceId,
										targetSourceId: sourceId,
										name: name.trim(),
										description: description.trim(),
										body
									}).then((result) => {
										setBusy(false);
										onClose(result.renamed ? face.t("savedRenamed") : face.t("saved"), result.renamed);
									}, (saveError) => {
										setBusy(false);
										setError(saveError instanceof Error ? saveError.message : String(saveError));
									});
								},
								children: face.t("save")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: () => {
									onClose(void 0);
								},
								children: face.t("cancel")
							})
						]
					})
				]
			});
		}
		const styles = {
			toolbar: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				marginBottom: 12
			},
			search: {
				flex: 1,
				maxWidth: 320,
				padding: "6px 10px",
				borderRadius: 8,
				border: "1px solid var(--dsh-border, #ccc)"
			},
			filters: {
				display: "flex",
				gap: 12,
				marginLeft: 8
			},
			filterLabel: {
				display: "flex",
				alignItems: "center",
				gap: 4,
				fontSize: 13,
				whiteSpace: "nowrap"
			},
			dangerButton: { color: "var(--dsw-alias-state-error-primary, #c0392b)" },
			notice: {
				color: "#2e7d32",
				fontSize: 13
			},
			error: {
				color: "#c0392b",
				fontSize: 13
			},
			grid: {
				display: "flex",
				flexDirection: "column",
				gap: 8
			},
			card: {
				border: "1px solid var(--dsh-border, #ddd)",
				borderRadius: 10,
				padding: "10px 14px"
			},
			cardHead: {
				display: "flex",
				alignItems: "center",
				gap: 8
			},
			cardName: { fontSize: 14 },
			sourceTag: {
				fontSize: 12,
				opacity: .65,
				whiteSpace: "nowrap"
			},
			cardDescription: {
				margin: "6px 0 0",
				fontSize: 13,
				opacity: .8
			},
			cardBody: {
				margin: "6px 0 0",
				fontSize: 12,
				whiteSpace: "pre-wrap",
				background: "var(--dsh-surface, rgba(127,127,127,0.08))",
				padding: 8,
				borderRadius: 6
			},
			editor: {
				border: "1px solid var(--dsh-border, #ccc)",
				borderRadius: 10,
				padding: "10px 14px",
				marginBottom: 12,
				display: "flex",
				flexDirection: "column",
				gap: 8
			},
			editorFooter: {
				display: "flex",
				alignItems: "center",
				gap: 8
			},
			input: {
				padding: "6px 10px",
				borderRadius: 8,
				border: "1px solid var(--dsh-border, #ccc)"
			},
			textarea: {
				width: "100%",
				boxSizing: "border-box",
				fontFamily: "monospace",
				fontSize: 13,
				borderRadius: 8,
				border: "1px solid var(--dsh-border, #ccc)",
				padding: 8,
				resize: "vertical"
			}
		};
		//#endregion
		//#region src/client/index.ts
		const NS = "settings.skill-book";
		const inject = [
			"slots",
			"locale",
			"remote",
			"remote.skill-book",
			"theme"
		];
		/** Unwrap the remote envelope; failures surface as rejections with the message. */
		async function unwrap(promise) {
			const result = await promise;
			if (result.ok) return result.value;
			throw new Error(result.error.message);
		}
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-skill-book: copy dictionaries");
			const skillBook = ctx.remote["skill-book"];
			const t = ctx.locale.bind(NS);
			const skillsFace = {
				t,
				listSkills: () => unwrap(skillBook.skillList()),
				listSources: () => unwrap(skillBook.skillSources()),
				readSkill: (name, sourceId) => unwrap(skillBook.skillRead({
					name,
					sourceId
				})),
				saveSkill: (request) => unwrap(skillBook.skillSave(request)),
				deleteSkill: async (name, sourceId) => {
					await unwrap(skillBook.skillDelete({
						name,
						sourceId
					}));
				}
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "skill-book",
				order: 25,
				label: () => t("navSkills"),
				inject: () => ({ face: skillsFace })
			}, SkillsSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map