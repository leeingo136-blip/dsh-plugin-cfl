window.__ModuleLoader__.load({
	id: "@dsh/ui-memory-echo",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locales.ts
		const zh = {
			navMemoryRecall: "心灵回响",
			loadFailed: "加载失败",
			empty: "还没有记忆库卡片",
			emptyHint: "新建一张卡片，连接一个 RAG 数据库。",
			createCard: "新增卡片",
			editCard: "编辑卡片",
			newCardTitle: "新增卡片",
			fieldPlan: "方案名称",
			planHint: "小写字母、数字与连字符，预设用它引用这个角色",
			fieldPersona: "角色介绍（系统提示词）",
			fieldSeed: "前置会话（JSONL）",
			seedHint: "每行一个 {\"role\":\"user|assistant\",\"text\":\"…\"}；保存后按行解析",
			fieldName: "姓名",
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
			queryPlaceholder: "输入要检索的内容…",
			search: "搜索",
			searching: "检索中…",
			noResults: "没有命中结果",
			generatePreset: "生成预设",
			save: "保存",
			cancel: "取消",
			delete: "删除",
			deleteConfirm: "确定删除该卡片？",
			invalidInput: "输入不完整或有误",
			nameDuplicate: "名称已存在",
			notFound: "卡片不存在"
		};
		const en = {
			navMemoryRecall: "Mind Echo",
			loadFailed: "Load failed",
			empty: "No memory cards yet",
			emptyHint: "Create a card to connect a RAG database.",
			createCard: "New card",
			editCard: "Edit card",
			newCardTitle: "New card",
			fieldPlan: "Plan",
			planHint: "Lowercase letters, digits and hyphens; presets reference this character by it",
			fieldPersona: "Persona (system prompt)",
			fieldSeed: "Seed conversation (JSONL)",
			seedHint: "One {\"role\":\"user|assistant\",\"text\":\"…\"} per line",
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
			generatePreset: "Generate preset",
			save: "Save",
			cancel: "Cancel",
			delete: "Delete",
			deleteConfirm: "Delete this card?",
			invalidInput: "Input is incomplete or invalid",
			nameDuplicate: "Name already exists",
			notFound: "Card not found"
		};
		//#endregion
		//#region \0dsh-css:/Users/infinite/Projects/DeepSeekHarnessPrivatePlugin/deep-seek-harness-plugin/packages/dsh-plugin-memory-echo/packages/ui-memory-recall/src/client/QueryModal.module.css.mjs
		const css = ".Io2RtW_wide{width:min(720px,100%);max-height:min(80vh,100%)}.Io2RtW_body{min-height:160px;overflow-y:auto}.Io2RtW_xwide{width:max-content;min-width:min(720px,100%);max-width:96vw;max-height:min(88vh,100%)}.Io2RtW_body{overflow:auto}";
		const tagId = "@dsh/ui-memory-echo/QueryModal.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh/ui-memory-echo";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var QueryModal_module_css_default = {
			"body": "Io2RtW_body",
			"wide": "Io2RtW_wide",
			"xwide": "Io2RtW_xwide"
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
			plan: card?.plan ?? "",
			name: card?.name ?? "",
			persona: card?.persona ?? "",
			address: card?.address ?? "",
			embeddingModel: card?.embeddingModel ?? ""
		});
		const ATTITUDE_LABELS = {
			attachment: "依恋",
			solidarity: "亲近",
			status: "地位",
			trust: "信任",
			commitment: "承诺"
		};
		const TRAIT_LABELS = {
			timidity: "胆怯",
			irritability: "易怒",
			confidence: "自信",
			sensitivity: "敏感"
		};
		const KIND_LABELS = {
			user: "用户",
			assistant: "助手",
			system: "系统",
			dream: "梦境"
		};
		const STATE_HINTS = {
			valence: "愉悦度：-1 很不愉快，0 中性，1 很愉快",
			arousal: "激活度：-1 极度松弛/倦怠，0 平静，1 高度激动/紧绷",
			dominance: "掌控感：-1 完全被支配，0 平衡，1 完全掌控",
			stamina: "体力：0 耗尽，1 充沛",
			trust: "信任：-1 完全不信任，0 中立，1 完全信任"
		};
		const STATE_LABELS = {
			valence: "愉悦度",
			arousal: "激活度",
			dominance: "掌控感",
			stamina: "体力",
			trust: "信任"
		};
		function MemorySection(props) {
			if (props.face === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: { padding: 16 },
				children: "心灵回响：设置组件已加载，但未收到 face 注入（slot inject 未生效）。"
			});
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
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							style: { marginRight: 8 },
							children: "心灵回响 · 角色卡"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "sm",
							disabled: editing === "new",
							onClick: () => {
								setEditing("new");
							},
							children: face.t("createCard")
						}),
						failed !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: styles.error,
							children: [
								face.t("loadFailed"),
								" — ",
								failed
							]
						})
					]
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
						onConnect: () => {
							setQuerying(card);
						},
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
			const { face, card, onEdit } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: styles.card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: styles.cardHead,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							style: styles.cardName,
							children: card.plan
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							onClick: onEdit,
							children: face.t("editCard")
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: styles.metaRows,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: styles.metaRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.metaLabel,
								children: face.t("fieldName")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.metaValue,
								children: card.name
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: styles.metaRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.metaLabel,
								children: face.t("fieldAddress")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.metaValue,
								children: card.address
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: styles.metaRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.metaLabel,
								children: face.t("fieldEmbedding")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.metaValue,
								children: card.embeddingModel
							})]
						})
					]
				})]
			});
		}
		function CardEditor(props) {
			const { face, cards, cardId, localDir, onDone, onCancel, onDelete, onConnect } = props;
			const [draft, setDraft] = (0, react.useState)(props.draft);
			const [presets, setPresets] = (0, react.useState)([]);
			const [basePreset, setBasePreset] = (0, react.useState)("");
			const [panel, setPanel] = (0, react.useState)(void 0);
			const [dbPicker, setDbPicker] = (0, react.useState)(void 0);
			const [selfOpen, setSelfOpen] = (0, react.useState)(false);
			const [coefficientOpen, setCoefficientOpen] = (0, react.useState)(false);
			const [logOpen, setLogOpen] = (0, react.useState)(false);
			const [cardState, setCardState] = (0, react.useState)({
				sleep: [],
				selfTags: [],
				personTags: [],
				selfState: [],
				parameters: [],
				traits: [],
				lingering: [],
				persons: [],
				objects: []
			});
			(0, react.useEffect)(() => {
				if (cardId === void 0) return;
				face.cardState({ id: cardId }).then((value) => {
					setCardState({
						...value,
						parameters: value.parameters ?? [],
						traits: value.traits ?? [],
						lingering: value.lingering ?? []
					});
				}, () => {});
			}, [face, cardId]);
			(0, react.useEffect)(() => {
				face.presetOptions().then((value) => {
					setPresets(value.presets);
					setBasePreset((current) => current === "" ? value.presets[0]?.id ?? "" : current);
				}, () => {});
			}, [face]);
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
				if (addressTouched || localDir === void 0 || draft.plan.trim() === "") return;
				const want = `${localDir.replace(/\/+$/, "")}/${draft.plan.trim().toLowerCase()}.sqlite`;
				if (draft.address !== want) setDraft((current) => ({
					...current,
					address: want
				}));
			}, [
				addressTouched,
				localDir,
				draft.plan,
				draft.address
			]);
			const nameTaken = cards.some((one) => one.name === draft.name.trim() && one.id !== cardId);
			const complete = draft.plan.trim() !== "" && draft.name.trim() !== "" && draft.embeddingModel !== "";
			const submit = () => {
				if (nameTaken) {
					setError(face.t("nameDuplicate"));
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
					injectGroups: draft.injectGroups
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.fieldRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: styles.fieldHead,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: styles.fieldLabel,
										children: face.t("fieldPlan")
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									style: styles.input,
									value: draft.plan,
									placeholder: "work-assistant",
									onChange: (event) => {
										setDraft({
											...draft,
											plan: event.target.value
										});
									}
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: styles.fieldHead,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: styles.fieldLabel,
											children: face.t("fieldAddress")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "outline",
											size: "sm",
											disabled: busy,
											onClick: submit,
											children: "保存"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "outline",
											size: "sm",
											disabled: busy,
											onClick: () => {
												face.databaseFiles().then((value) => setDbPicker(value.files), (error) => window.alert(error instanceof Error ? error.message : String(error)));
											},
											children: "载入"
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									style: styles.input,
									value: draft.address,
									placeholder: "保存时自动创建",
									onChange: (event) => {
										setAddressTouched(true);
										setDraft({
											...draft,
											address: event.target.value
										});
									}
								})]
							}),
							dbPicker !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: styles.fieldLabel,
									children: "选择要载入的数据库"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										flexWrap: "wrap",
										gap: 8
									},
									children: [
										dbPicker.map((file) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "outline",
											size: "sm",
											disabled: busy,
											onClick: () => {
												face.loadDatabase({ address: file.address }).then((value) => {
													const body = {
														plan: file.plan,
														name: value.name,
														persona: value.persona,
														address: file.address,
														embeddingModel: draft.embeddingModel,
														basePreset,
														injectGroups: draft.injectGroups
													};
													setDbPicker(void 0);
													setBusy(true);
													(cardId === void 0 ? face.create(body) : face.update({
														id: cardId,
														...body
													})).then(() => {
														setBusy(false);
														onDone();
													}, (error) => {
														setBusy(false);
														setError(error instanceof Error ? error.message : String(error));
													});
												}, (error) => window.alert(error instanceof Error ? error.message : String(error)));
											},
											children: file.title !== "" ? `${file.title}（${file.plan}）` : file.plan
										}, file.address)),
										dbPicker.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: styles.hint,
											children: "databases 目录下没有 .sqlite 文件"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "outline",
											size: "sm",
											onClick: () => setDbPicker(void 0),
											children: "取消"
										})
									]
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.fieldRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.fieldLabel,
							children: face.t("fieldPersona")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							style: {
								...styles.input,
								minHeight: 80
							},
							value: draft.persona,
							onChange: (event) => {
								setDraft({
									...draft,
									persona: event.target.value
								});
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 8,
							marginTop: 4,
							flexWrap: "wrap"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: () => {
									setCoefficientOpen(true);
								},
								children: "情绪系数"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: () => {
									setSelfOpen(true);
								},
								children: "己 情绪"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: () => {
									setPanel("entity");
								},
								children: "关系"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: () => {
									setPanel("memory");
								},
								children: "记忆记录"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: () => {
									setPanel("dream");
								},
								children: "梦境记录"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: () => {
									setLogOpen(true);
								},
								children: "变动记录"
							})
						]
					}),
					selfOpen && cardId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelfModal, {
						face,
						cardId,
						state: cardState,
						onClose: () => {
							setSelfOpen(false);
						}
					}),
					coefficientOpen && cardId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CoefficientModal, {
						face,
						cardId,
						onClose: () => {
							setCoefficientOpen(false);
						}
					}),
					logOpen && cardId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChangeLogModal, {
						face,
						cardId,
						onClose: () => {
							setLogOpen(false);
						}
					}),
					panel !== void 0 && cardId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RelationsModal, {
						face,
						cardId,
						mode: panel,
						onClose: () => {
							setPanel(void 0);
						}
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: styles.error,
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: styles.field,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: styles.fieldHead,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: styles.fieldLabel,
										children: "基础预设"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "outline",
										size: "sm",
										onClick: () => {
											face.presetOptions().then((value) => setPresets(value.presets), (error) => window.alert(error instanceof Error ? error.message : String(error)));
										},
										children: "刷新"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								style: styles.input,
								value: basePreset,
								onChange: (event) => setBasePreset(event.target.value),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: "请选择基础预设"
								}), presets.map((one) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: one.id,
									children: one.name
								}, one.id))]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.hint,
								children: "列表来自当前 Harness 实际注册的预设；新预设需要选一个可用的基础预设。"
							})
						]
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
								variant: "outline",
								size: "sm",
								disabled: !complete || busy,
								disabled: !complete || basePreset === "" || busy,
								onClick: () => {
									setBusy(true);
									const body = {
										plan: draft.plan.trim().toLowerCase(),
										name: draft.name.trim(),
										persona: draft.persona,
										address: draft.address.trim(),
										embeddingModel: draft.embeddingModel,
										basePreset,
										injectGroups: draft.injectGroups
									};
									(cardId === void 0 ? face.create(body) : face.update({
										id: cardId,
										...body
									})).then(() => face.createCharacterPreset({
										plan: draft.plan.trim().toLowerCase(),
										basePresetId: basePreset
									})).then((result) => {
										setBusy(false);
										window.alert(`已创建预设：${result.plan}\n新建会话选择该预设即可，"前世"会自动注入。`);
									}, (cause) => {
										setBusy(false);
										setError(cause instanceof Error ? cause.message : String(cause));
									});
								},
								children: "创建预设"
							}),
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
		* Connect-and-search modal: type a query, KNN against the card's database
		* with its bound embedding engine. Enter searches; results list under the
		* input with distances.
		*/
		function QueryModal(props) {
			const { face, card, onClose } = props;
			const [text, setText] = (0, react.useState)("");
			const [results, setResults] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const search = () => {
				const query = text.trim();
				if (query === "" || busy) return;
				setBusy(true);
				setError(null);
				face.query({
					id: card.id,
					query
				}).then((value) => {
					setBusy(false);
					setResults(value.results);
				}, (cause) => {
					setBusy(false);
					setError(cause instanceof Error ? cause.message : String(cause));
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: `${face.t("connectDb")} — ${card.name}`,
				closeLabel: face.t("cancel"),
				className: QueryModal_module_css_default.wide,
				contentClassName: QueryModal_module_css_default.body,
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
							style: {
								fontSize: 12,
								opacity: .7,
								maxWidth: "100%",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								direction: "rtl",
								textAlign: "left"
							},
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
								setText(event.target.value);
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
						results !== void 0 && !busy && error === null && results.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.hint,
							children: face.t("noResults")
						}),
						results !== void 0 && results.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: styles.resultList,
							children: results.map((hit, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: styles.resultItem,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: styles.resultDistance,
									children: hit.distance.toFixed(4)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: styles.resultContent,
									children: hit.content
								})]
							}, index))
						})
					]
				})
			});
		}
		const SELF_COEFFICIENTS = [
			{
				key: "valence",
				label: "愉悦度"
			},
			{
				key: "arousal",
				label: "激活度"
			},
			{
				key: "dominance",
				label: "掌控感"
			},
			{
				key: "trust",
				label: "信任"
			}
		];
		const RELATION_COEFFICIENTS = [
			{
				key: "attachment",
				label: "依恋"
			},
			{
				key: "solidarity",
				label: "亲近"
			},
			{
				key: "status",
				label: "地位"
			},
			{
				key: "relation.trust",
				label: "信任"
			},
			{
				key: "commitment",
				label: "承诺"
			}
		];
		function CoefficientModal(props) {
			const [data, setData] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				if (typeof props.face.cardDisposition !== "function") {
					setFailure("当前宿主未提供情绪系数接口，请重启应用后再试。");
					return;
				}
				try {
					props.face.cardDisposition({ id: props.cardId }).then((value) => {
						setData({
							relevance: Number(value?.relevance ?? .5),
							gains: value?.gains ?? {},
							losses: value?.losses ?? {}
						});
					}, (error) => {
						setFailure(error instanceof Error ? error.message : String(error));
					});
				} catch (error) {
					setFailure(`读取情绪系数失败：${error instanceof Error ? error.message : String(error)}`);
				}
			}, [props.cardId, props.face]);
			const number = (key, kind) => data?.[kind]?.[key] ?? 1;
			const setNumber = (key, kind, value) => {
				setData((current) => current === null ? current : {
					...current,
					[kind]: {
						...current[kind] ?? {},
						[key]: value
					}
				});
			};
			const save = () => {
				if (data === null) return;
				if (typeof props.face.setCardDisposition !== "function") {
					setFailure("当前宿主未提供保存接口，请重启应用后再试。");
					return;
				}
				setBusy(true);
				setFailure("");
				try {
					props.face.setCardDisposition({
						id: props.cardId,
						patch: data
					}).then(() => {
						setBusy(false);
						props.onClose();
					}, (error) => {
						setBusy(false);
						setFailure(error instanceof Error ? error.message : String(error));
					});
				} catch (error) {
					setBusy(false);
					setFailure(`保存失败：${error instanceof Error ? error.message : String(error)}`);
				}
			};
			const renderRow = (key, label) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							flex: "1 1 auto",
							fontSize: 13
						},
						children: label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 4,
							fontSize: 12
						},
						children: ["增加", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "number",
							min: .2,
							max: 2,
							step: .05,
							style: {
								...styles.input,
								width: 64,
								textAlign: "center"
							},
							value: number(key, "gains"),
							onChange: (event) => {
								setNumber(key, "gains", Number(event.target.value));
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 4,
							fontSize: 12
						},
						children: ["减少", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "number",
							min: .2,
							max: 2,
							step: .05,
							style: {
								...styles.input,
								width: 64,
								textAlign: "center"
							},
							value: number(key, "losses"),
							onChange: (event) => {
								setNumber(key, "losses", Number(event.target.value));
							}
						})]
					})
				]
			}, key);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: props.onClose,
				title: "情绪系数",
				closeLabel: "关闭",
				className: QueryModal_module_css_default.wide,
				contentClassName: QueryModal_module_css_default.body,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 12,
						padding: 16
					},
					children: data === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: styles.hint,
						children: failure === "" ? "加载中…" : failure
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									flex: "1 1 auto",
									fontSize: 13
								},
								children: "默认相关性"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "number",
								min: 0,
								max: 1,
								step: .05,
								style: {
									...styles.input,
									width: 80,
									textAlign: "center"
								},
								value: data.relevance,
								onChange: (event) => {
									setData({
										...data,
										relevance: Number(event.target.value)
									});
								}
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.hint,
							children: "系数只放大幅度：1 为正常，>1 更敏感，<1 更迟钝；范围 0.2 ~ 2.0，不设硬上限。"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.fieldLabel,
							children: "己"
						}),
						SELF_COEFFICIENTS.map((one) => renderRow(one.key, one.label)),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.fieldLabel,
							children: "关系"
						}),
						RELATION_COEFFICIENTS.map((one) => renderRow(one.key, one.label)),
						failure !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.hint,
							children: failure
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								justifyContent: "flex-end",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: props.onClose,
								disabled: busy,
								children: "取消"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								size: "sm",
								onClick: save,
								disabled: busy,
								children: busy ? "保存中…" : "保存"
							})]
						})
					] })
				})
			});
		}
		function SelfModal(props) {
			const [values, setValues] = (0, react.useState)(props.state.selfState);
			const [busy, setBusy] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)("");
			const ORDER = [
				"valence",
				"arousal",
				"dominance",
				"stamina",
				"trust"
			];
			const ordered = [...values].sort((left, right) => ORDER.indexOf(left.key) - ORDER.indexOf(right.key));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: props.onClose,
				title: "己 · 状态",
				closeLabel: "关闭",
				className: QueryModal_module_css_default.wide,
				contentClassName: QueryModal_module_css_default.body,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 12,
						padding: 16
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "grid",
								gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
								gap: 12
							},
							children: [ordered.map((one) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 3
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										...styles.fieldLabel,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis"
									},
									title: `${STATE_HINTS[one.key] ?? ""}${(props.state.parameters ?? []).find((item) => item.key === one.key)?.description ?? ""}`,
									children: [STATE_LABELS[one.key] ?? one.key, (props.state.parameters ?? []).find((item) => item.key === one.key)?.label !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										style: {
											opacity: .65,
											marginLeft: 4
										},
										children: ["· ", (props.state.parameters ?? []).find((item) => item.key === one.key)?.label]
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									min: [
										"valence",
										"arousal",
										"dominance",
										"trust"
									].includes(one.key) ? -1 : 0,
									max: 1,
									step: .01,
									style: {
										...styles.input,
										width: "100%",
										maxWidth: 120,
										fontSize: 13,
										textAlign: "center"
									},
									value: one.value,
									onChange: (event) => {
										const value = Number(event.target.value);
										setValues((current) => current.map((item) => item.key === one.key ? {
											...item,
											value
										} : item));
									},
									onBlur: () => {
										props.face.setSelfState({
											id: props.cardId,
											key: one.key,
											value: one.value
										}).catch(() => {});
									}
								})]
							}, one.key)), values.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.hint,
								children: "（暂无状态数据）"
							})]
						}),
						props.state.selfTags.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								flexWrap: "wrap",
								gap: 6
							},
							children: props.state.selfTags.map((tag) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.badge,
								children: tag
							}, tag))
						}),
						(props.state.traits ?? []).length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 4
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.fieldLabel,
								children: "性格倾向"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									flexWrap: "wrap",
									gap: 6
								},
								children: (props.state.traits ?? []).map((one) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: styles.badge,
									title: one.description,
									children: [
										TRAIT_LABELS[one.key] ?? one.key,
										" · ",
										one.label
									]
								}, one.key))
							})]
						}),
						(props.state.lingering ?? []).length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 4
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.fieldLabel,
								children: "残留情绪"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									flexWrap: "wrap",
									gap: 6
								},
								children: (props.state.lingering ?? []).map((one) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: styles.badge,
									title: `到期：${one.expiresAt.slice(0, 16).replace("T", " ")}`,
									children: [
										one.label,
										" · ",
										Math.round(one.intensity * 100),
										"%"
									]
								}, one.label))
							})]
						}),
						props.state.sleep.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.hint,
							children: props.state.sleep.map((one) => `睡眠中（至 ${one.wakeAt === null ? "未知" : one.wakeAt.slice(0, 16).replace("T", " ")}）`).join("；")
						}),
						notice !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.hint,
							children: notice
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								justifyContent: "flex-end",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: props.onClose,
								disabled: busy,
								children: "关闭"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								size: "sm",
								disabled: busy,
								onClick: () => {
									setBusy(true);
									setNotice("");
									Promise.all(values.map((one) => props.face.setSelfState({
										id: props.cardId,
										key: one.key,
										value: one.value
									}))).then(() => {
										setBusy(false);
										setNotice("已保存");
									}, (error) => {
										setBusy(false);
										setNotice(`保存失败：${error instanceof Error ? error.message : String(error)}`);
									});
								},
								children: busy ? "保存中…" : "保存"
							})]
						})
					]
				})
			});
		}
		const PARAM_LABELS = {
			valence: "愉悦度",
			arousal: "激活度",
			dominance: "掌控感",
			stamina: "体力",
			trust: "信任",
			attachment: "依恋",
			solidarity: "亲近",
			status: "地位",
			commitment: "承诺"
		};
		const REASON_LABELS = {
			appraisal: "事件评价",
			decay: "自然衰减",
			manual: "手动修改",
			system: "系统"
		};
		function ChangeLogModal(props) {
			const [rows, setRows] = (0, react.useState)([]);
			const [error, setError] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				if (typeof props.face.emotionChangeLog !== "function") {
					setError("当前宿主未提供变动记录接口，请重启应用后再试。");
					return;
				}
				try {
					props.face.emotionChangeLog({
						id: props.cardId,
						limit: 200
					}).then((value) => {
						setRows(value.rows);
					}, (cause) => {
						setError(cause instanceof Error ? cause.message : String(cause));
					});
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			}, [props.cardId, props.face]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: props.onClose,
				title: "变动记录",
				closeLabel: "关闭",
				className: QueryModal_module_css_default.xwide,
				contentClassName: QueryModal_module_css_default.body,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 8,
						padding: 16
					},
					children: [error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: styles.hint,
						children: error
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
						style: styles.table,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "时间"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "对象"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "参数"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "前值"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "变化"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "后值"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "原因"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "触发"
							})
						] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tbody", { children: [rows.map((row, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: {
									...styles.td,
									whiteSpace: "nowrap"
								},
								children: String(row.ts ?? "").slice(0, 16).replace("T", " ")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: row.scope === "entity" ? String(row.entity_name ?? "") : "己"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: PARAM_LABELS[String(row.param ?? "")] ?? String(row.param ?? "")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: Number(row.before ?? 0).toFixed(2)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
								style: styles.td,
								children: [Number(row.delta ?? 0) >= 0 ? "+" : "", Number(row.delta ?? 0).toFixed(2)]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: Number(row.after ?? 0).toFixed(2)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: REASON_LABELS[String(row.reason ?? "")] ?? String(row.reason ?? "")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: String(row.message ?? row.cause_text ?? "")
							})
						] }, String(row.id ?? index))), rows.length === 0 && error === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: styles.td,
							colSpan: 8,
							children: "（暂无记录）"
						}) })] })]
					})]
				})
			});
		}
		function RelationsModal(props) {
			const { face, cardId, mode, onClose } = props;
			const [query, setQuery] = (0, react.useState)("");
			const [rows, setRows] = (0, react.useState)([]);
			const [name, setName] = (0, react.useState)("");
			const [extra, setExtra] = (0, react.useState)("");
			const [content, setContent] = (0, react.useState)("");
			const [role, setRole] = (0, react.useState)("user");
			const [salience, setSalience] = (0, react.useState)(.5);
			const [busy, setBusy] = (0, react.useState)(false);
			const load = () => {
				if (mode === "dream") {
					face.dreamList({ id: cardId }).then((value) => setRows(value.dreams), () => {});
					return;
				}
				if (mode === "memory") face.listMemories({
					id: cardId,
					query
				}).then((value) => setRows(value.rows), () => {});
				else face.listEntities({
					id: cardId,
					query
				}).then((value) => setRows(value.rows), () => {});
			};
			(0, react.useEffect)(load, [cardId, mode]);
			const add = () => {
				setBusy(true);
				if (mode === "memory") face.addMemory({
					id: cardId,
					kind: role,
					content,
					salience
				}).then(() => {
					setContent("");
					setBusy(false);
					load();
				}, () => setBusy(false));
				else face.saveEntity({
					id: cardId,
					entity: {
						name,
						cognition: extra
					}
				}).then(() => {
					setName("");
					setExtra("");
					setBusy(false);
					load();
				}, () => setBusy(false));
			};
			const remove = (entityId) => {
				if (mode === "memory") face.deleteMemory({
					id: cardId,
					memoryId: entityId
				}).then(load, () => {});
				else face.deleteEntity({
					id: cardId,
					entityId
				}).then(load, () => {});
			};
			const attitudeKeys = [...new Set(rows.flatMap((row) => (row.attitudes ?? []).map((a) => a.key)))];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: mode === "entity" ? "关系" : mode === "dream" ? "梦境记录" : "记忆记录",
				closeLabel: "关闭",
				className: QueryModal_module_css_default.xwide,
				contentClassName: QueryModal_module_css_default.body,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 10,
						padding: 16
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								style: { flex: 1 },
								value: query,
								placeholder: "按名称/内容搜索",
								onChange: (event) => setQuery(event.target.value)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								onClick: load,
								children: "搜索"
							})]
						}),
						mode === "entity" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 8
							},
							children: [rows.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.hint,
								children: "（暂无记录）"
							}), rows.map((row) => {
								const saveRow = () => {
									face.saveEntity({
										id: cardId,
										entity: {
											id: row.id,
											name: row.name,
											cognition: row.cognition
										}
									}).then(load, () => {});
								};
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: styles.entityRow,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											style: {
												...styles.entityCell,
												flex: "1 1 120px"
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: styles.fieldLabel,
												children: "名称"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												style: {
													...styles.input,
													fontSize: 12
												},
												value: String(row.name ?? ""),
												onChange: (event) => {
													const value = event.target.value;
													setRows((current) => current.map((item) => item.id === row.id ? {
														...item,
														name: value
													} : item));
												},
												onBlur: saveRow
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											style: {
												...styles.entityCell,
												flex: "2 1 240px"
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: styles.fieldLabel,
												children: "认知"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												style: {
													...styles.input,
													fontSize: 12
												},
												value: String(row.cognition ?? ""),
												onChange: (event) => {
													const value = event.target.value;
													setRows((current) => current.map((item) => item.id === row.id ? {
														...item,
														cognition: value
													} : item));
												},
												onBlur: saveRow
											})]
										}),
										attitudeKeys.map((key) => {
											const found = (row.attitudes ?? []).find((a) => a.key === key);
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: {
													...styles.entityCell,
													flex: "0 0 64px"
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: styles.fieldLabel,
													children: ATTITUDE_LABELS[key] ?? key
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "number",
													min: key === "status" || key === "trust" ? -1 : 0,
													max: 1,
													step: .01,
													style: {
														...styles.input,
														fontSize: 12,
														textAlign: "center"
													},
													value: found?.value ?? 0,
													onChange: (event) => {
														const value = Number(event.target.value);
														setRows((current) => current.map((item) => item.id === row.id ? {
															...item,
															attitudes: [...(item.attitudes ?? []).filter((a) => a.key !== key), {
																key,
																value
															}]
														} : item));
													},
													onBlur: () => {
														face.setEntityState({
															id: cardId,
															entityId: String(row.id),
															key,
															value: found?.value ?? 0
														}).catch(() => {});
													}
												})]
											}, key);
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: {
												...styles.entityCell,
												flex: "0 0 auto",
												justifyContent: "flex-end"
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "outline",
												size: "sm",
												onClick: () => remove(String(row.id)),
												children: "删除"
											})
										})
									]
								}, String(row.id));
							})]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
							style: styles.table,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: mode === "dream" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "时间"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: styles.th,
								children: "梦境"
							})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
									style: styles.th,
									children: "时间"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
									style: styles.th,
									children: "角色"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
									style: styles.th,
									children: "内容"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
									style: styles.th,
									children: "震撼值"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
									style: styles.th,
									children: "操作"
								})
							] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tbody", { children: [rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [mode === "dream" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: {
									...styles.td,
									whiteSpace: "nowrap",
									maxWidth: "none"
								},
								children: String(row.addedAt ?? "").slice(0, 16).replace("T", " ")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: String(row.content ?? "")
							})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									style: {
										...styles.td,
										whiteSpace: "nowrap",
										maxWidth: "none"
									},
									children: String(row.created_at ?? "").slice(0, 16).replace("T", " ")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									style: styles.td,
									children: KIND_LABELS[String(row.kind ?? "")] ?? String(row.kind ?? "")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									style: styles.td,
									children: String(row.content ?? "")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									style: {
										...styles.td,
										whiteSpace: "nowrap",
										maxWidth: "none"
									},
									children: Number(row.salience ?? 0).toFixed(2)
								})
							] }), mode !== "dream" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									size: "sm",
									onClick: () => remove(String(row.id), String(row.kind ?? "")),
									children: "删除"
								})
							})] }, String(row.id))), rows.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: styles.td,
								colSpan: mode === "dream" ? 2 : 5,
								children: "（暂无记录）"
							}) })] })]
						}),
						mode !== "dream" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								gap: 8,
								alignItems: "center",
								flexWrap: "wrap"
							},
							children: mode === "memory" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									style: styles.input,
									value: role,
									onChange: (event) => setRole(event.target.value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "user",
										children: "用户"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "assistant",
										children: "助手"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									style: {
										flex: 1,
										minWidth: 200
									},
									value: content,
									placeholder: "记忆内容",
									onChange: (event) => setContent(event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									style: { width: 90 },
									value: String(salience),
									placeholder: "震撼值",
									onChange: (event) => setSalience(Number(event.target.value) || 0)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									size: "sm",
									disabled: busy || content.trim() === "" || salience < 0 || salience > 1,
									onClick: add,
									children: "添加"
								})
							] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									style: {
										flex: 1,
										minWidth: 140
									},
									value: name,
									placeholder: "名称",
									onChange: (event) => setName(event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									style: {
										flex: 2,
										minWidth: 220
									},
									value: extra,
									placeholder: "认知（身份、外号、关系等）",
									onChange: (event) => setExtra(event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									size: "sm",
									disabled: busy || name.trim() === "",
									onClick: add,
									children: "添加"
								})
							] })
						})
					]
				})
			});
		}
		const styles = {
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
			fieldRow: {
				display: "grid",
				gridTemplateColumns: "1fr 1fr",
				gap: 12
			},
			field: {
				display: "flex",
				flexDirection: "column",
				gap: 4,
				minWidth: 0
			},
			fieldLabel: {
				fontSize: 13,
				opacity: .75
			},
			fieldHead: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				minHeight: 28
			},
			table: {
				width: "100%",
				borderCollapse: "collapse",
				fontSize: 13
			},
			entityRow: {
				display: "flex",
				flexWrap: "wrap",
				gap: 8,
				alignItems: "flex-end",
				padding: "8px 10px",
				border: "1px solid var(--dsh-border, #ddd)",
				borderRadius: 10
			},
			entityCell: {
				display: "flex",
				flexDirection: "column",
				gap: 3,
				minWidth: 0
			},
			th: {
				textAlign: "left",
				padding: "4px 8px",
				borderBottom: "1px solid var(--dsh-border, #ccc)",
				opacity: .7
			},
			td: {
				padding: "4px 8px",
				borderBottom: "1px solid var(--dsh-border, rgba(127,127,127,0.2))",
				whiteSpace: "normal",
				wordBreak: "break-word",
				maxWidth: 360
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
				minWidth: 420
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
		const NS = "settings.memory-echo";
		const inject = [
			"slots",
			"locale",
			"remote",
			"remote.memory-echo",
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
			}), "ui-memory-echo: copy dictionaries");
			const memory = ctx.remote["memory-echo"];
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
				query: (input) => unwrap(memory.connQuery(input)),
				generatePresets: () => unwrap(memory.generatePresets()),
				workspaceOptions: () => unwrap(memory.workspaceOptions()),
				presetOptions: () => unwrap(memory.presetOptions()),
				createCharacterPreset: (input) => unwrap(memory.createCharacterPreset(input)),
				openDatabaseLocation: (input) => unwrap(memory.openDatabaseLocation(input)),
				cardState: (input) => unwrap(memory.cardState(input)),
				dreamList: (input) => unwrap(memory.dreamList(input)),
				cardDisposition: (input) => unwrap(memory.cardDisposition(input)),
				setCardDisposition: (input) => unwrap(memory.setCardDisposition(input)),
				emotionChangeLog: (input) => unwrap(memory.emotionChangeLog(input)),
				setSelfState: (input) => unwrap(memory.setSelfState(input)),
				listEntities: (input) => unwrap(memory.listEntities(input)),
				saveEntity: (input) => unwrap(memory.saveEntity(input)),
				deleteEntity: (input) => unwrap(memory.deleteEntity(input)),
				listMemories: (input) => unwrap(memory.listMemories(input)),
				addMemory: (input) => unwrap(memory.addMemory(input)),
				deleteMemory: (input) => unwrap(memory.deleteMemory(input)),
				setEntityState: (input) => unwrap(memory.setEntityState(input)),
				databaseFiles: () => unwrap(memory.databaseFiles()),
				loadDatabase: (input) => unwrap(memory.loadDatabase(input))
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "memory-echo",
				order: 26,
				label: () => t("navMemoryRecall"),
				locale: NS,
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