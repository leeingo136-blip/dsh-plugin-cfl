window.__ModuleLoader__.load({
	id: "@dsh/ui-rag-knowledge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locales.ts
		const zh = {
			navMemoryRecall: "RAG 知识库",
			loadFailed: "加载失败",
			empty: "还没有知识库卡片",
			emptyHint: "新建一张卡片，连接一个 RAG 知识库。",
			createCard: "新建卡片",
			editCard: "编辑卡片",
			newCardTitle: "新建卡片",
			fieldName: "名称",
			fieldNameHint: "唯一标识，作为工具参数使用",
			fieldDescription: "描述",
			fieldKind: "数据库类型",
			kindLocal: "本地文件",
			kindService: "网络服务",
			fieldAddress: "数据库地址",
			addressPlaceholderLocal: "/path/to/database.sqlite",
			addressPlaceholderService: "https://example.com/rag",
			addressHintLocal: "留空时默认保存在插件数据目录内，随名称自动生成",
			fieldEmbedding: "Embedding 引擎",
			embeddingPick: "请选择…",
			embeddingUnavailable: "暂无可用模型：请先在账号列启用本地向量模型",
			connectDb: "连接数据库",
			queryPlaceholder: "输入关键字过滤（留空不显示）…",
			filterHint: "输入关键字后按回车过滤；留空不展示任何数据，避免一次列出整库。",
			search: "搜索",
			searching: "检索中…",
			noResults: "没有命中结果",
			save: "保存",
			cancel: "取消",
			delete: "删除",
			deleteConfirm: "确定删除该知识库卡片？",
			invalidInput: "输入不完整或有误",
			nameDuplicate: "名称已存在",
			notFound: "卡片不存在"
		};
		const en = {
			navMemoryRecall: "RAG Knowledge Base",
			loadFailed: "Load failed",
			empty: "No knowledge cards yet",
			emptyHint: "Create a card to connect a RAG database.",
			createCard: "New card",
			editCard: "Edit card",
			newCardTitle: "New card",
			fieldName: "Name",
			fieldNameHint: "Unique handle, passed to tools as a parameter",
			fieldDescription: "Description",
			fieldKind: "Database kind",
			kindLocal: "Local file",
			kindService: "Network service",
			fieldAddress: "Address",
			addressPlaceholderLocal: "/path/to/database.sqlite",
			addressPlaceholderService: "https://example.com/rag",
			addressHintLocal: "Defaults to a file inside the plugin data directory, derived from the name",
			fieldEmbedding: "Embedding engine",
			embeddingPick: "Choose…",
			embeddingUnavailable: "No models available: enable the local embedding model first",
			connectDb: "Connect database",
			queryPlaceholder: "Type what to search for…",
			search: "Search",
			searching: "Searching…",
			noResults: "No matches",
			save: "Save",
			cancel: "Cancel",
			delete: "Delete",
			deleteConfirm: "Delete this card?",
			invalidInput: "Input is incomplete or invalid",
			nameDuplicate: "Name already exists",
			notFound: "Card not found"
		};
		//#endregion
		//#region \0dsh-css:/Users/infinite/Projects/DeepSeekHarnessPrivatePlugin/deep-seek-harness-plugin/packages/dsh-plugin-rag-knowledge/packages/ui-memory-recall/src/client/QueryModal.module.css.mjs
		const css = ".JGkSmW_wide{width:min(720px,100%);max-height:min(80vh,100%)}.JGkSmW_body{min-height:200px;overflow-y:auto}";
		const tagId = "@dsh/ui-rag-knowledge/QueryModal.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh/ui-rag-knowledge";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var QueryModal_module_css_default = {
			"body": "JGkSmW_body",
			"wide": "JGkSmW_wide"
		};
		//#endregion
		//#region src/client/MemorySection.tsx
		/**
		* 设置-记忆回想：RAG 数据库连接卡片。
		* 每张卡片显示一个连接（名称/类型/地址/embedding 引擎）；新建与编辑共用
		* 一个编辑器——新建时渲染在列表顶部，编辑时原位替换该卡片。名称唯一，
		* 作为工具参数明确连接哪个数据库；删除在编辑器末行左侧，保存/取消居右。
		*/
		const draftOf = (card) => ({
			name: card?.name ?? "",
			description: card?.description ?? "",
			kind: card?.kind ?? "local",
			address: card?.address ?? "",
			embeddingModel: card?.embeddingModel ?? ""
		});
		function MemorySection(props) {
			const { face } = props;
			if (face === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemoryLoaded, { face });
		}
		function MemoryLoaded({ face }) {
			const [cards, setCards] = (0, react.useState)([]);
			const [failed, setFailed] = (0, react.useState)(null);
			/** Plugin-internal default directory for local database files (from connList). */
			const [localDir, setLocalDir] = (0, react.useState)(void 0);
			/** The card being edited (id), or 'new' for the creation editor, or undefined. */
			const [editing, setEditing] = (0, react.useState)(void 0);
			/** The card whose connect/search modal is open. */
			const [querying, setQuerying] = (0, react.useState)(void 0);
			const refresh = () => {
				face.list().then((value) => {
					setCards(value.connections);
					setLocalDir(value.defaults?.localDir);
					setFailed(null);
				}, (error) => setFailed(error instanceof Error ? error.message : String(error)));
			};
			(0, react.useEffect)(refresh, [face]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: styles.toolbar,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "primary",
						size: "sm",
						disabled: editing === "new",
						onClick: () => {
							setEditing("new");
						},
						children: face.t("createCard")
					}), failed !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: styles.error,
						children: [
							face.t("loadFailed"),
							" — ",
							failed
						]
					})]
				}),
				cards.length === 0 && editing === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [face.t("empty"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					style: styles.hint,
					children: [" — ", face.t("emptyHint")]
				})] }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: styles.grid,
					children: [editing === "new" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardEditor, {
						face,
						cards,
						draft: draftOf(),
						localDir,
						onDone: () => {
							setEditing(void 0);
							refresh();
						},
						onCancel: () => {
							setEditing(void 0);
						}
					}, "new"), cards.map((card) => editing === card.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardEditor, {
						face,
						cards,
						draft: draftOf(card),
						localDir,
						cardId: card.id,
						onDone: () => {
							setEditing(void 0);
							refresh();
						},
						onCancel: () => {
							setEditing(void 0);
						},
						onDelete: () => {
							if (!window.confirm(face.t("deleteConfirm"))) return;
							face.remove(card.id).then(() => {
								setEditing(void 0);
								refresh();
							});
						}
					}, card.id) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardView, {
						face,
						card,
						onEdit: () => {
							setEditing(card.id);
						},
						onConnect: () => {
							setQuerying(card);
						}
					}, card.id))]
				}),
				querying !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QueryModal, {
					face,
					card: querying,
					onClose: () => {
						setQuerying(void 0);
					}
				})
			] });
		}
		function CardView(props) {
			const { face, card, onEdit, onConnect } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.cardHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
								style: styles.cardName,
								children: card.name
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.badge,
								children: card.kind === "local" ? face.t("kindLocal") : face.t("kindService")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: onConnect,
								children: face.t("connectDb")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: onEdit,
								children: face.t("editCard")
							})
						]
					}),
					card.description !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: styles.cardDescription,
						children: card.description
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.metaRows,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: styles.metaRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.metaLabel,
								children: face.t("fieldAddress")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.metaValue,
								children: card.address
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: styles.metaRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.metaLabel,
								children: face.t("fieldEmbedding")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.metaValue,
								children: card.embeddingModel
							})]
						})]
					})
				]
			});
		}
		function CardEditor(props) {
			const { face, cards, cardId, localDir, onDone, onCancel, onDelete } = props;
			const [draft, setDraft] = (0, react.useState)(props.draft);
			/**
			* While untouched, the local address keeps deriving itself from the
			* plugin-internal directory and the card name; the first manual edit
			* hands control to the user for good.
			*/
			const [addressTouched, setAddressTouched] = (0, react.useState)(props.draft.address !== "");
			const [models, setModels] = (0, react.useState)([]);
			const [embeddingAvailable, setEmbeddingAvailable] = (0, react.useState)(true);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				face.embeddingModels().then((value) => {
					setModels(value.models);
					setEmbeddingAvailable(value.available);
				}, () => {
					setEmbeddingAvailable(false);
				});
			}, [face]);
			(0, react.useEffect)(() => {
				if (addressTouched || localDir === void 0) return;
				if (draft.kind === "local") {
					const base = draft.name.trim() === "" ? "database" : draft.name.trim();
					const want = `${localDir.replace(/\/+$/, "")}/${base}.sqlite`;
					if (draft.address !== want) setDraft((current) => ({
						...current,
						address: want
					}));
				} else if (draft.address !== "") setDraft((current) => ({
					...current,
					address: ""
				}));
			}, [
				addressTouched,
				localDir,
				draft.kind,
				draft.name,
				draft.address
			]);
			const nameTaken = cards.some((one) => one.name === draft.name.trim() && one.id !== cardId);
			const complete = draft.name.trim() !== "" && draft.address.trim() !== "" && draft.embeddingModel !== "";
			const submit = () => {
				if (nameTaken) {
					setError(face.t("nameDuplicate"));
					return;
				}
				setBusy(true);
				const body = {
					name: draft.name.trim(),
					description: draft.description.trim(),
					kind: draft.kind,
					address: draft.address.trim(),
					embeddingModel: draft.embeddingModel
				};
				(cardId === void 0 ? face.create(body) : face.update({
					id: cardId,
					...body
				})).then(() => {
					setBusy(false);
					onDone();
				}, (cause) => {
					setBusy(false);
					const message = cause instanceof Error ? cause.message : String(cause);
					setError(message.includes("name-duplicate") ? face.t("nameDuplicate") : message.includes("invalid-input") ? face.t("invalidInput") : message.includes("not-found") ? face.t("notFound") : message);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					...styles.card,
					...styles.editor
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						style: styles.cardName,
						children: cardId === void 0 ? face.t("newCardTitle") : face.t("editCard")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: styles.field,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.fieldLabel,
								children: face.t("fieldName")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								style: styles.input,
								value: draft.name,
								placeholder: face.t("fieldNameHint"),
								onChange: (event) => {
									setDraft({
										...draft,
										name: event.target.value
									});
								}
							}),
							nameTaken && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.error,
								children: face.t("nameDuplicate")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: styles.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.fieldLabel,
							children: face.t("fieldDescription")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							style: styles.input,
							value: draft.description,
							onChange: (event) => {
								setDraft({
									...draft,
									description: event.target.value
								});
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: styles.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.fieldLabel,
							children: face.t("fieldKind")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							style: styles.input,
							value: draft.kind,
							onChange: (event) => {
								setDraft({
									...draft,
									kind: event.target.value
								});
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "local",
								children: face.t("kindLocal")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "service",
								children: face.t("kindService")
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: styles.field,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.fieldLabel,
								children: face.t("fieldAddress")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								style: styles.input,
								value: draft.address,
								placeholder: draft.kind === "local" ? face.t("addressPlaceholderLocal") : face.t("addressPlaceholderService"),
								onChange: (event) => {
									setAddressTouched(true);
									setDraft({
										...draft,
										address: event.target.value
									});
								}
							}),
							draft.kind === "local" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.hint,
								children: face.t("addressHintLocal")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: styles.field,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.fieldLabel,
								children: face.t("fieldEmbedding")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								style: styles.input,
								value: draft.embeddingModel,
								onChange: (event) => {
									setDraft({
										...draft,
										embeddingModel: event.target.value
									});
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: face.t("embeddingPick")
								}), models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: model.id,
									children: model.id
								}, model.id))]
							}),
							!embeddingAvailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.hint,
								children: face.t("embeddingUnavailable")
							})
						]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: styles.error,
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.editorFooter,
						children: [
							onDelete !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								style: styles.dangerButton,
								disabled: busy,
								onClick: onDelete,
								children: face.t("delete")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								size: "sm",
								disabled: !complete || busy,
								onClick: submit,
								children: face.t("save")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								disabled: busy,
								onClick: onCancel,
								children: face.t("cancel")
							})
						]
					})
				]
			});
		}
		/**
		* Browse modal: filter the card's documents by keyword (title or body). An
		* empty input shows nothing on purpose — the point is to inspect a few rows,
		* not to dump the whole database into the DOM.
		*/
		function QueryModal(props) {
			const { face, card, onClose } = props;
			const [text, setText] = (0, react.useState)("");
			const [documents, setDocuments] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const search = () => {
				const query = text.trim();
				if (query === "") {
					setDocuments(void 0);
					setError(null);
					return;
				}
				setBusy(true);
				setError(null);
				face.docs({
					id: card.id,
					query
				}).then((value) => {
					setBusy(false);
					setDocuments(value.documents);
				}, (cause) => {
					setBusy(false);
					setError(cause instanceof Error ? cause.message : String(cause));
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				className: QueryModal_module_css_default.wide,
				contentClassName: QueryModal_module_css_default.body,
				title: `${face.t("connectDb")} — ${card.name}`,
				closeLabel: face.t("cancel"),
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					size: "sm",
					disabled: text.trim() === "" || busy,
					onClick: search,
					children: face.t("search")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					size: "sm",
					disabled: busy,
					onClick: onClose,
					children: face.t("cancel")
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: styles.modalBody,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: styles.addressLine,
							title: card.address,
							children: card.address
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							"data-modal-autofocus": true,
							style: styles.modalInput,
							value: text,
							placeholder: face.t("queryPlaceholder"),
							disabled: busy,
							onChange: (event) => {
								const value = event.target.value;
								setText(value);
								if (value.trim() === "") {
									setDocuments(void 0);
									setError(null);
								}
							},
							onKeyDown: (event) => {
								if (event.key === "Enter") search();
							}
						}),
						busy && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.hint,
							children: face.t("searching")
						}),
						error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.error,
							children: error
						}),
						text.trim() === "" && !busy && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.hint,
							children: face.t("filterHint")
						}),
						documents !== void 0 && !busy && error === null && documents.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.hint,
							children: face.t("noResults")
						}),
						documents !== void 0 && documents.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: styles.resultList,
							children: documents.map((hit) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles.resultItem,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: styles.resultDistance,
									children: hit.updatedAt.slice(0, 10)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: styles.resultContent,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: hit.title }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: { opacity: .75 },
											children: hit.snippet
										})
									]
								})]
							}, hit.id))
						})
					]
				})
			});
		}
		const styles = {
			addressLine: {
				fontSize: 12,
				opacity: .7,
				maxWidth: "100%",
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				direction: "rtl",
				textAlign: "left"
			},
			toolbar: {
				display: "flex",
				alignItems: "center",
				gap: 12,
				marginBottom: 12
			},
			error: {
				color: "#c0392b",
				fontSize: 13
			},
			hint: {
				opacity: .65,
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
			editor: { gap: 12 },
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
			badge: {
				fontSize: 11,
				padding: "2px 8px",
				borderRadius: 999,
				background: "var(--dsh-surface, rgba(127,127,127,0.12))",
				opacity: .85
			},
			metaRows: {
				display: "flex",
				flexDirection: "column",
				gap: 4
			},
			metaRow: {
				display: "flex",
				gap: 8,
				fontSize: 12
			},
			metaLabel: {
				opacity: .6,
				minWidth: 96
			},
			metaValue: {
				fontFamily: "monospace",
				wordBreak: "break-all"
			},
			field: {
				display: "flex",
				flexDirection: "column",
				gap: 4
			},
			fieldLabel: {
				fontSize: 13,
				opacity: .75
			},
			input: {
				padding: "6px 10px",
				borderRadius: 8,
				border: "1px solid var(--dsh-border, #ccc)"
			},
			dangerButton: { color: "var(--dsw-alias-state-error-primary, #c0392b)" },
			editorFooter: {
				display: "flex",
				alignItems: "center",
				gap: 8
			},
			modalBody: {
				display: "flex",
				flexDirection: "column",
				gap: 10,
				minWidth: 420,
				maxWidth: "100%",
				overflowX: "hidden"
			},
			modalInput: { width: "100%" },
			resultList: {
				display: "flex",
				flexDirection: "column",
				gap: 6,
				maxHeight: 320,
				overflowY: "auto"
			},
			resultItem: {
				display: "flex",
				gap: 10,
				alignItems: "baseline",
				padding: "8px 10px",
				borderRadius: 8,
				background: "var(--dsh-surface, rgba(127,127,127,0.08))"
			},
			resultDistance: {
				fontFamily: "monospace",
				fontSize: 12,
				opacity: .65,
				flexShrink: 0
			},
			resultContent: {
				fontSize: 13,
				whiteSpace: "pre-wrap",
				wordBreak: "break-word"
			}
		};
		//#endregion
		//#region src/client/index.ts
		const NS = "settings.rag-knowledge";
		const inject = [
			"slots",
			"locale",
			"remote",
			"remote.rag-knowledge",
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
			}), "ui-rag-knowledge: copy dictionaries");
			const memory = ctx.remote["rag-knowledge"];
			const t = ctx.locale.bind(NS);
			const face = {
				t,
				list: () => unwrap(memory.connList()),
				create: (input) => unwrap(memory.connCreate(input)),
				update: (input) => unwrap(memory.connUpdate(input)),
				remove: async (id) => {
					await unwrap(memory.connDelete({ id }));
				},
				embeddingModels: () => unwrap(memory.embeddingModels()),
				docs: (input) => unwrap(memory.connDocs(input)),
				query: (input) => unwrap(memory.connQuery(input))
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "rag-knowledge",
				order: 26,
				label: () => t("navMemoryRecall"),
				inject: () => ({ face })
			}, MemorySection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map