window.__ModuleLoader__.load({
	id: "@dsh/ui-knowledge-book",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locales.ts
		const zh = {
			navSkills: "技能",
			navRag: "知识库",
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
			bodyPlaceholder: "技能正文（Markdown 指令）",
			pickSource: "选择来源",
			ragCreateTitle: "新建知识库",
			ragName: "名称",
			ragDescription: "描述",
			ragAdd: "添加",
			ragChunks: "条目",
			ragDims: "维度",
			ragModel: "向量模型",
			ragQuery: "查询",
			ragQueryPlaceholder: "输入查询文本…",
			ragTopK: "条数",
			ragIngest: "入库文本",
			ragIngestPlaceholder: "每行一条，粘贴要入库的文本…",
			ragRun: "查询",
			ragResults: "结果",
			ragDeleteConfirm: "确定删除该知识库及其全部数据？",
			ragNeedsEmbedding: "需要先在账号列启用本地向量模型"
		};
		const en = {
			navSkills: "Skills",
			navRag: "Knowledge",
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
			bodyPlaceholder: "Skill body (Markdown instructions)",
			pickSource: "Pick a source",
			ragCreateTitle: "New knowledge base",
			ragName: "Name",
			ragDescription: "Description",
			ragAdd: "Add",
			ragChunks: "chunks",
			ragDims: "dims",
			ragModel: "Model",
			ragQuery: "Query",
			ragQueryPlaceholder: "Query text…",
			ragTopK: "Top-K",
			ragIngest: "Ingest text",
			ragIngestPlaceholder: "One chunk per line…",
			ragRun: "Search",
			ragResults: "Results",
			ragDeleteConfirm: "Delete this knowledge base and all its data?",
			ragNeedsEmbedding: "Enable the local embedding model first"
		};
		//#endregion
		//#region src/client/SkillsSection.tsx
		/**
		* 设置-技能：全部技能一卡一条。可编辑来源的卡片行内编辑（名称/正文/来源下拉），
		* 插件与运行时技能只读；顶部搜索按名称/来源/正文过滤（三个勾选框可多选）；
		* 右上「新建」给出可编辑空卡，名称/正文/来源齐全才可保存，冲突由宿主按
		* kebab-case 后缀规则自动重命名。
		*/
		const FILTERS = [
			"name",
			"source",
			"body"
		];
		/** 卡片右侧的小字来源标签。 */
		function SourceTag({ label, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: styles$1.sourceTag,
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
				if (text === "") return skills;
				const active = [...filters];
				if (active.length === 0) return [];
				return skills.filter((skill) => active.some((filter) => {
					if (filter === "name") return skill.name.toLowerCase().includes(text);
					if (filter === "source") return skill.sourceLabel.toLowerCase().includes(text);
					const key = `${skill.sourceId}\u0000${skill.name}`;
					return (bodies.get(key) ?? skill.description).toLowerCase().includes(text);
				}));
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
					style: styles$1.toolbar,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							style: styles$1.search,
							placeholder: face.t("search"),
							value: query,
							onChange: (event) => {
								setQuery(event.target.value);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: styles$1.filters,
							children: FILTERS.map((filter) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: styles$1.filterLabel,
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
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							style: styles$1.primaryButton,
							onClick: () => {
								setNotice(null);
								setEditing({
									fromName: void 0,
									fromSourceId: void 0,
									name: "",
									body: "",
									sourceId: sources.find((one) => one.editable)?.id ?? ""
								});
							},
							children: face.t("create")
						})
					]
				}),
				notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: styles$1.notice,
					children: notice
				}),
				editing !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillEditor, {
					face,
					sources,
					state: editing,
					onClose: (message, renamed) => {
						setEditing(void 0);
						if (message !== void 0) setNotice(renamed === true ? face.t("savedRenamed") : message);
						refresh();
					}
				}),
				shown.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: face.t("noResults") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: styles$1.grid,
					children: shown.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillCardView, {
						face,
						skill,
						body: bodies.get(`${skill.sourceId}\u0000${skill.name}`) ?? skill.description,
						onEdit: () => {
							setNotice(null);
							face.readSkill(skill.name, skill.sourceId).then((value) => {
								setEditing({
									fromName: skill.name,
									fromSourceId: skill.sourceId,
									name: skill.name,
									body: value.body,
									sourceId: skill.sourceId
								});
							});
						},
						onDelete: () => {
							if (!window.confirm(face.t("confirmDelete"))) return;
							face.deleteSkill(skill.name, skill.sourceId).then(refresh);
						}
					}, `${skill.sourceId}\u0000${skill.name}`))
				})
			] });
		}
		function SkillCardView(props) {
			const { face, skill, body, onEdit, onDelete } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles$1.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles$1.cardHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
								style: styles$1.cardName,
								children: skill.name
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourceTag, {
								label: skill.sourceLabel,
								t: face.t
							}),
							skill.editable && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: styles$1.button,
								onClick: onEdit,
								children: face.t("edit")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: styles$1.dangerButton,
								onClick: onDelete,
								children: face.t("delete")
							})] })
						]
					}),
					skill.description !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles$1.cardDescription,
						children: skill.description
					}),
					body !== "" && body !== skill.description && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						style: styles$1.cardBody,
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
			const [body, setBody] = (0, react.useState)(state.body);
			const [sourceId, setSourceId] = (0, react.useState)(state.sourceId);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const complete = name.trim() !== "" && body.trim() !== "" && sourceId !== "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles$1.editor,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles$1.cardHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								style: {
									...styles$1.input,
									flex: 1
								},
								placeholder: face.t("namePlaceholder"),
								value: name,
								onChange: (event) => {
									setName(event.target.value);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								style: styles$1.input,
								value: sourceId,
								onChange: (event) => {
									setSourceId(event.target.value);
								},
								children: sources.filter((one) => one.editable).map((one) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: one.id,
									children: one.label
								}, one.id))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: {
									...styles$1.primaryButton,
									opacity: complete && !busy ? 1 : .5
								},
								disabled: !complete || busy,
								onClick: () => {
									setBusy(true);
									setError(null);
									face.saveSkill({
										fromName: state.fromName,
										fromSourceId: state.fromSourceId,
										targetSourceId: sourceId,
										name: name.trim(),
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: styles$1.button,
								onClick: () => {
									onClose(void 0);
								},
								children: face.t("cancel")
							})
						]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						style: styles$1.error,
						children: [
							face.t("saveFailed"),
							" — ",
							error
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						style: styles$1.textarea,
						placeholder: face.t("bodyPlaceholder"),
						value: body,
						onChange: (event) => {
							setBody(event.target.value);
						},
						rows: 12
					})
				]
			});
		}
		const styles$1 = {
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
			primaryButton: {
				padding: "6px 14px",
				borderRadius: 8,
				border: "none",
				cursor: "pointer",
				fontWeight: 600
			},
			button: {
				padding: "4px 12px",
				borderRadius: 8,
				cursor: "pointer"
			},
			dangerButton: {
				padding: "4px 12px",
				borderRadius: 8,
				cursor: "pointer",
				color: "#c0392b"
			},
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
		//#region src/client/KnowledgeSection.tsx
		/**
		* 设置-知识库：本地 sqlite-vec 知识库的配置、入库、查询与删除。
		* 库卡片显示名称/描述/向量模型/维度/条目数；顶部新建表单；
		* 每张卡内嵌查询框与入库文本框。
		*/
		function KnowledgeSection(props) {
			const { face } = props;
			if (face === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RagLoaded, { face });
		}
		function RagLoaded({ face }) {
			const [databases, setDatabases] = (0, react.useState)([]);
			const [failed, setFailed] = (0, react.useState)(null);
			const [name, setName] = (0, react.useState)("");
			const [description, setDescription] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const refresh = () => {
				face.list().then((value) => {
					setDatabases(value.databases);
					setFailed(null);
				}, (error) => setFailed(error instanceof Error ? error.message : String(error)));
			};
			(0, react.useEffect)(refresh, [face]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: styles.createRow,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							style: {
								...styles.input,
								flex: 1
							},
							placeholder: face.t("ragName"),
							value: name,
							onChange: (event) => {
								setName(event.target.value);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							style: {
								...styles.input,
								flex: 2
							},
							placeholder: face.t("ragDescription"),
							value: description,
							onChange: (event) => {
								setDescription(event.target.value);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							style: {
								...styles.primaryButton,
								opacity: name.trim() !== "" && !busy ? 1 : .5
							},
							disabled: name.trim() === "" || busy,
							onClick: () => {
								setBusy(true);
								face.create(name.trim(), description.trim()).then(() => {
									setName("");
									setDescription("");
									setBusy(false);
									refresh();
								}, (error) => {
									setBusy(false);
									setFailed(error instanceof Error ? error.message : String(error));
								});
							},
							children: face.t("ragAdd")
						})
					]
				}),
				failed !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					style: styles.error,
					children: [
						face.t("loadFailed"),
						" — ",
						failed
					]
				}),
				databases.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: face.t("empty") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: styles.grid,
					children: databases.map((database) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DatabaseCard, {
						face,
						database,
						onChange: refresh
					}, database.id))
				})
			] });
		}
		function DatabaseCard(props) {
			const { face, database, onChange } = props;
			const [query, setQuery] = (0, react.useState)("");
			const [topK, setTopK] = (0, react.useState)(5);
			const [hits, setHits] = (0, react.useState)([]);
			const [ingestText, setIngestText] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.cardHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
								style: styles.cardName,
								children: database.name
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: styles.meta,
								children: [
									face.t("ragChunks"),
									" ",
									database.chunks,
									" · ",
									face.t("ragDims"),
									" ",
									database.dimension,
									database.model !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
										" · ",
										face.t("ragModel"),
										" ",
										database.model
									] })
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: styles.dangerButton,
								onClick: () => {
									if (!window.confirm(face.t("ragDeleteConfirm"))) return;
									face.remove(database.id).then(onChange);
								},
								children: face.t("delete")
							})
						]
					}),
					database.description !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles.cardDescription,
						children: database.description
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.row,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								style: {
									...styles.input,
									flex: 1
								},
								placeholder: face.t("ragQueryPlaceholder"),
								value: query,
								onChange: (event) => {
									setQuery(event.target.value);
								},
								onKeyDown: (event) => {
									if (event.key === "Enter" && query.trim() !== "") face.query(database.id, query.trim(), topK).then((value) => {
										setHits(value.results);
										setError(null);
									}, (error) => setError(error instanceof Error ? error.message : String(error)));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: styles.meta,
								children: [
									face.t("ragTopK"),
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 1,
										max: 50,
										value: topK,
										onChange: (event) => {
											setTopK(Number(event.target.value) || 5);
										},
										style: {
											...styles.input,
											width: 64
										}
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: styles.button,
								onClick: () => {
									face.query(database.id, query.trim(), topK).then((value) => {
										setHits(value.results);
										setError(null);
									}, (error) => setError(error instanceof Error ? error.message : String(error)));
								},
								children: face.t("ragRun")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						style: styles.textarea,
						rows: 3,
						placeholder: face.t("ragIngestPlaceholder"),
						value: ingestText,
						onChange: (event) => {
							setIngestText(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.row,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: styles.button,
								disabled: ingestText.trim() === "",
								onClick: () => {
									const texts = ingestText.split("\n").map((one) => one.trim()).filter((one) => one !== "");
									face.ingest(database.id, texts).then((value) => {
										setIngestText("");
										setNotice(`${face.t("ragIngest")}：${value.count}`);
										onChange();
									}, (error) => setError(error instanceof Error ? error.message : String(error)));
								},
								children: face.t("ragIngest")
							}),
							notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.notice,
								children: notice
							}),
							error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.error,
								children: error
							})
						]
					}),
					hits.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles.resultsTitle,
						children: face.t("ragResults")
					}), hits.map((hit, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.hit,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.hitDistance,
							children: hit.distance.toFixed(4)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.hitContent,
							children: hit.content
						})]
					}, index))] })
				]
			});
		}
		const styles = {
			createRow: {
				display: "flex",
				gap: 8,
				marginBottom: 12
			},
			input: {
				padding: "6px 10px",
				borderRadius: 8,
				border: "1px solid var(--dsh-border, #ccc)"
			},
			primaryButton: {
				padding: "6px 14px",
				borderRadius: 8,
				border: "none",
				cursor: "pointer",
				fontWeight: 600
			},
			button: {
				padding: "4px 12px",
				borderRadius: 8,
				cursor: "pointer"
			},
			dangerButton: {
				padding: "4px 12px",
				borderRadius: 8,
				cursor: "pointer",
				color: "#c0392b"
			},
			error: {
				color: "#c0392b",
				fontSize: 13
			},
			notice: {
				color: "#2e7d32",
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
				padding: "10px 14px",
				display: "flex",
				flexDirection: "column",
				gap: 8
			},
			cardHead: {
				display: "flex",
				alignItems: "center",
				gap: 8
			},
			cardName: { fontSize: 14 },
			cardDescription: {
				margin: 0,
				fontSize: 13,
				opacity: .8
			},
			meta: {
				fontSize: 12,
				opacity: .65,
				whiteSpace: "nowrap"
			},
			row: {
				display: "flex",
				alignItems: "center",
				gap: 8
			},
			textarea: {
				width: "100%",
				boxSizing: "border-box",
				fontSize: 13,
				borderRadius: 8,
				border: "1px solid var(--dsh-border, #ccc)",
				padding: 8,
				resize: "vertical"
			},
			resultsTitle: {
				margin: "4px 0",
				fontSize: 13,
				fontWeight: 600
			},
			hit: {
				display: "flex",
				gap: 10,
				padding: "6px 8px",
				borderRadius: 6,
				background: "var(--dsh-surface, rgba(127,127,127,0.08))",
				marginBottom: 4
			},
			hitDistance: {
				fontSize: 12,
				fontFamily: "monospace",
				opacity: .7,
				minWidth: 56
			},
			hitContent: {
				fontSize: 13,
				whiteSpace: "pre-wrap"
			}
		};
		//#endregion
		//#region src/client/index.ts
		const NS = "settings.knowledge";
		const inject = [
			"slots",
			"locale",
			"remote",
			"remote.knowledge",
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
			}), "ui-knowledge-book: copy dictionaries");
			const knowledge = ctx.remote.knowledge;
			const t = ctx.locale.bind(NS);
			const skillsFace = {
				t,
				listSkills: () => unwrap(knowledge.skillList()),
				listSources: () => unwrap(knowledge.skillSources()),
				readSkill: (name, sourceId) => unwrap(knowledge.skillRead({
					name,
					sourceId
				})),
				saveSkill: (request) => unwrap(knowledge.skillSave(request)),
				deleteSkill: async (name, sourceId) => {
					await unwrap(knowledge.skillDelete({
						name,
						sourceId
					}));
				}
			};
			const ragFace = {
				t,
				list: () => unwrap(knowledge.ragList()),
				create: (name, description) => unwrap(knowledge.ragCreate({
					name,
					description
				})),
				remove: async (id) => {
					await unwrap(knowledge.ragDelete({ id }));
				},
				ingest: (id, texts) => unwrap(knowledge.ragIngest({
					id,
					texts: [...texts]
				})),
				query: (id, text, k) => unwrap(knowledge.ragQuery({
					id,
					text,
					k
				}))
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "knowledge-skills",
				order: 25,
				label: () => t("navSkills"),
				inject: () => ({ face: skillsFace })
			}, SkillsSection));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "knowledge-rag",
				order: 26,
				label: () => t("navRag"),
				inject: () => ({ face: ragFace })
			}, KnowledgeSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map