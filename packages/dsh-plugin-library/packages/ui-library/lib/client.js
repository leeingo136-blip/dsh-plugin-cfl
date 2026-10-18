window.__ModuleLoader__.load({
	id: "@dsh/ui-library",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locales.ts
		const zh = {
			navLibrary: "图书馆",
			loadFailed: "加载失败",
			empty: "暂无内容",
			reload: "刷新",
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
			delete: "删除",
			ragDeleteConfirm: "确定删除该知识库及其全部数据？",
			ragNeedsEmbedding: "需要先在账号列启用本地向量模型"
		};
		const en = {
			navLibrary: "Library",
			loadFailed: "Load failed",
			empty: "Nothing here yet",
			reload: "Reload",
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
			delete: "Delete",
			ragDeleteConfirm: "Delete this knowledge base and all its data?",
			ragNeedsEmbedding: "Enable the local embedding model first"
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
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "sm",
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
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
			dangerButton: { color: "var(--dsw-alias-state-error-primary, #c0392b)" },
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
		const NS = "settings.library";
		const inject = [
			"slots",
			"locale",
			"remote",
			"remote.library",
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
			}), "ui-library: copy dictionaries");
			const library = ctx.remote.library;
			const t = ctx.locale.bind(NS);
			const ragFace = {
				t,
				list: () => unwrap(library.ragList()),
				create: (name, description) => unwrap(library.ragCreate({
					name,
					description
				})),
				remove: async (id) => {
					await unwrap(library.ragDelete({ id }));
				},
				ingest: (id, texts) => unwrap(library.ragIngest({
					id,
					texts: [...texts]
				})),
				query: (id, text, k) => unwrap(library.ragQuery({
					id,
					text,
					k
				}))
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "library",
				order: 26,
				label: () => t("navLibrary"),
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