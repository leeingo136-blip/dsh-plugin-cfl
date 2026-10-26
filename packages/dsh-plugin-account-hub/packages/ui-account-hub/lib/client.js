window.__ModuleLoader__.load({
	id: "@dsh/ui-account-hub",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locales.ts
		/** Copy dictionaries for the settings account column. */
		/** English strings (the key-set source of truth for this pair). */
		const en = {
			nav: "Accounts",
			empty: "Install an account plugin to use accounts.",
			loadFailed: "Loading the account registry failed",
			save: "Save",
			saving: "Saving…",
			saved: "Saved",
			saveFailed: "Saving failed",
			actionFailed: "Action failed",
			optionsFailed: "Loading options failed",
			busy: "Working…",
			selectPlaceholder: "Select…",
			selectSearchPlaceholder: "Search…",
			selectNoMatch: "No matches",
			signedIn: "Signed in",
			accountInfo: "Account info",
			loading: "Loading…",
			cancel: "Cancel",
			groupChat: "Chat models",
			groupEmbedding: "Embedding models",
			groupTts: "Text-to-speech",
			groupAsr: "Speech recognition"
		};
		/** Chinese strings (same keys as {@link en}). */
		const zh = {
			nav: "账号",
			empty: "安装插件以便使用账号",
			loadFailed: "账号注册表加载失败",
			save: "保存",
			saving: "保存中…",
			saved: "已保存",
			saveFailed: "保存失败",
			actionFailed: "操作失败",
			optionsFailed: "选项加载失败",
			busy: "处理中…",
			selectPlaceholder: "请选择…",
			selectSearchPlaceholder: "搜索…",
			selectNoMatch: "无匹配项",
			signedIn: "已登录",
			accountInfo: "账号信息",
			loading: "加载中…",
			cancel: "取消",
			groupChat: "对话模型",
			groupEmbedding: "向量模型",
			groupTts: "语音合成",
			groupAsr: "语音识别"
		};
		//#endregion
		//#region \0dsh-css:/Users/infinite/Projects/DeepSeekHarnessPrivatePlugin/deep-seek-harness-plugin/packages/dsh-plugin-account-hub/packages/ui-account-hub/src/client/HubAccountCard.module.css.mjs
		const css = ".dEbo8a_card{border:.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-default,#e2e2e2));border-radius:var(--dsw-radius-xl,12px);background:var(--dsw-alias-surface-default,transparent);flex-direction:column;gap:12px;margin:8px 0;padding:14px 16px;display:flex}.dEbo8a_plain{flex-direction:column;gap:12px;display:flex}.dEbo8a_head{align-items:baseline;gap:10px;display:flex}.dEbo8a_name{color:var(--dsw-alias-text-primary);font-size:14px;font-weight:600}.dEbo8a_status{color:var(--dsw-alias-text-secondary);font-size:12px}.dEbo8a_statusOk{color:var(--dsw-alias-text-success,var(--dsw-ref-green-600,#1a7f37))}.dEbo8a_statusWarn{color:var(--dsw-alias-text-warning,var(--dsw-ref-yellow-600,#9a6700))}.dEbo8a_statusError{color:var(--dsw-alias-text-danger,var(--dsw-ref-red-600,#cf222e))}.dEbo8a_field{flex-direction:column;gap:4px;display:flex}.dEbo8a_label{color:var(--dsw-alias-text-secondary);font-size:12px;font-weight:500}.dEbo8a_hint{color:var(--dsw-alias-text-tertiary,var(--dsw-alias-text-secondary));margin:0;font-size:11px}.dEbo8a_select{border:1px solid var(--dsw-alias-border-default,var(--dsw-ref-neutral-200,#e2e2e2));background:var(--dsw-alias-surface-default,transparent);height:30px;color:var(--dsw-alias-text-primary);border-radius:8px;padding:0 8px;font-size:13px}.dEbo8a_combo{position:relative}.dEbo8a_comboTrigger{border:1px solid var(--dsw-alias-border-default,var(--dsw-ref-neutral-200,#e2e2e2));background:var(--dsw-alias-surface-default,transparent);width:100%;height:30px;color:var(--dsw-alias-text-primary);cursor:pointer;text-align:left;border-radius:8px;justify-content:space-between;align-items:center;gap:6px;padding:0 8px;font-size:13px;display:flex}.dEbo8a_comboPlaceholder{color:var(--dsw-alias-text-tertiary,var(--dsw-alias-text-secondary))}.dEbo8a_comboValue{text-overflow:ellipsis;white-space:nowrap;flex:1;overflow:hidden}.dEbo8a_comboCaret{color:var(--dsw-alias-text-tertiary,var(--dsw-alias-text-secondary));flex:none;font-size:10px}.dEbo8a_comboBackdrop{z-index:90;position:fixed;inset:0}.dEbo8a_comboPanel{z-index:91;border:1px solid var(--dsw-alias-border-default,var(--dsw-ref-neutral-200,#e2e2e2));background:var(--dsw-alias-surface-raised,var(--dsw-ref-neutral-0,#fff));border-radius:8px;flex-direction:column;gap:6px;padding:8px;display:flex;position:absolute;top:calc(100% + 4px);left:0;right:0;box-shadow:0 8px 24px #0000001f}.dEbo8a_comboList{max-height:240px;display:block;overflow-y:auto}.dEbo8a_comboOption{box-sizing:border-box;width:100%;color:var(--dsw-alias-text-primary);text-align:left;cursor:pointer;text-overflow:ellipsis;white-space:nowrap;background:0 0;border:0;border-radius:6px;padding:6px 8px;font-size:13px;display:block;overflow:hidden}.dEbo8a_comboOption:hover{background:var(--dsw-alias-interactive-bg-hover,#8080801a)}.dEbo8a_comboOptionActive{background:var(--dsw-alias-interactive-bg-hover,#8080801a);font-weight:600}.dEbo8a_comboEmpty{color:var(--dsw-alias-text-secondary);padding:6px 8px;font-size:12px}.dEbo8a_notice{color:var(--dsw-alias-text-secondary);margin:0;font-size:12px}.dEbo8a_error{color:var(--dsw-alias-text-danger,var(--dsw-ref-red-600,#cf222e));margin:0;font-size:12px}.dEbo8a_actions{justify-content:flex-end;gap:8px;display:flex}.dEbo8a_rich{color:var(--dsw-alias-label-primary,var(--dsw-alias-text-primary));flex-direction:column;gap:16px;padding:8px 0;font-size:13px;line-height:22px;display:flex}.dEbo8a_officialCard{border:.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-default,#e2e2e2));border-radius:var(--dsw-radius-xl,12px);background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-surface-default,transparent));flex-direction:column;gap:4px;padding:12px 16px;display:flex}.dEbo8a_brandCard{border:.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-default,#e2e2e2));border-radius:var(--dsw-radius-xl,12px);background:var(--dsw-alias-surface-default,transparent);align-items:center;gap:10px;margin:8px 0;padding:12px 16px;display:flex}.dEbo8a_brandMark{flex:none;width:24px;height:24px}.dEbo8a_brandName{min-width:0;color:var(--dsw-alias-text-primary);white-space:nowrap;flex:1;font-size:14px;font-weight:600}.dEbo8a_brandActions{flex:none;align-items:center;gap:8px;display:flex}.dEbo8a_brandStatus{max-width:42%;color:var(--dsw-alias-text-secondary);text-overflow:ellipsis;white-space:nowrap;flex:none;font-size:12px;line-height:20px;overflow:hidden}.dEbo8a_brandStatusError{color:var(--dsw-alias-text-danger,var(--dsw-ref-red-600,#cf222e))}.dEbo8a_identityRow{justify-content:space-between;align-items:center;gap:16px;min-height:44px;display:flex}.dEbo8a_rowEnd{flex:none;align-items:center;gap:20px;display:flex}.dEbo8a_identity{align-items:center;gap:10px;min-width:0;min-height:44px;display:flex}.dEbo8a_avatar{corner-shape:round;width:32px;height:32px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-text-tertiary));background:var(--dsw-alias-bg-skeleton,var(--dsw-ref-neutral-100,#f2f2f2));border-radius:50%;flex:none;justify-content:center;align-items:center;display:flex;overflow:hidden}.dEbo8a_avatarImage{object-fit:cover;width:100%;height:100%}.dEbo8a_avatarBrand{width:22px;height:22px}.dEbo8a_identityCopy{flex-direction:column;min-width:0;display:flex}.dEbo8a_nameLine{font-size:14px;font-weight:500}.dEbo8a_statusLine{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-text-tertiary));text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.dEbo8a_accountInfo{color:var(--dsw-alias-label-primary,var(--dsw-alias-text-primary));white-space:nowrap;flex:none;align-items:center;gap:2px;font-size:13px;line-height:22px;text-decoration:none;display:inline-flex}.dEbo8a_accountInfo:hover{text-underline-offset:3px;text-decoration:underline}.dEbo8a_bRow{box-sizing:border-box;justify-content:space-between;align-items:center;gap:16px;min-height:40px;padding:6px 0;display:flex}.dEbo8a_divider{border-top:.5px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-default,#e2e2e2))}.dEbo8a_amount{flex-wrap:wrap;justify-content:flex-end;font-size:18px;font-weight:510;line-height:28px;display:flex}.dEbo8a_secondary,.dEbo8a_unavailable{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-text-tertiary))}.dEbo8a_links{flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:10px;display:flex}.dEbo8a_linkButton{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-default,#e2e2e2));border-radius:var(--dsw-radius-md,8px);min-width:58px;height:36px;color:var(--dsw-alias-label-primary,var(--dsw-alias-text-primary));white-space:nowrap;background:0 0;flex:none;justify-content:center;align-items:center;padding:0 14px;font-size:14px;line-height:22px;text-decoration:none;display:inline-flex}.dEbo8a_linkButton:hover{background:var(--dsw-alias-interactive-bg-hover,#8080801a)}.dEbo8a_primaryLink{color:var(--dsw-alias-label-primary-foreground,#fff);background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-text-primary));border-color:#0000;font-weight:500}.dEbo8a_primaryLink:hover{background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-text-primary))}.dEbo8a_unavailableLink{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-text-tertiary));text-underline-offset:3px;text-decoration:underline}.dEbo8a_unavailableLink:hover{color:var(--dsw-alias-label-primary,var(--dsw-alias-text-primary))}";
		const tagId = "@dsh/ui-account-hub/HubAccountCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh/ui-account-hub";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var HubAccountCard_module_css_default = {
			"accountInfo": "dEbo8a_accountInfo",
			"actions": "dEbo8a_actions",
			"amount": "dEbo8a_amount",
			"avatar": "dEbo8a_avatar",
			"avatarBrand": "dEbo8a_avatarBrand",
			"avatarImage": "dEbo8a_avatarImage",
			"bRow": "dEbo8a_bRow",
			"brandActions": "dEbo8a_brandActions",
			"brandCard": "dEbo8a_brandCard",
			"brandMark": "dEbo8a_brandMark",
			"brandName": "dEbo8a_brandName",
			"brandStatus": "dEbo8a_brandStatus",
			"brandStatusError": "dEbo8a_brandStatusError",
			"card": "dEbo8a_card",
			"combo": "dEbo8a_combo",
			"comboBackdrop": "dEbo8a_comboBackdrop",
			"comboCaret": "dEbo8a_comboCaret",
			"comboEmpty": "dEbo8a_comboEmpty",
			"comboList": "dEbo8a_comboList",
			"comboOption": "dEbo8a_comboOption",
			"comboOptionActive": "dEbo8a_comboOptionActive",
			"comboPanel": "dEbo8a_comboPanel",
			"comboPlaceholder": "dEbo8a_comboPlaceholder",
			"comboTrigger": "dEbo8a_comboTrigger",
			"comboValue": "dEbo8a_comboValue",
			"divider": "dEbo8a_divider",
			"error": "dEbo8a_error",
			"field": "dEbo8a_field",
			"head": "dEbo8a_head",
			"hint": "dEbo8a_hint",
			"identity": "dEbo8a_identity",
			"identityCopy": "dEbo8a_identityCopy",
			"identityRow": "dEbo8a_identityRow",
			"label": "dEbo8a_label",
			"linkButton": "dEbo8a_linkButton",
			"links": "dEbo8a_links",
			"name": "dEbo8a_name",
			"nameLine": "dEbo8a_nameLine",
			"notice": "dEbo8a_notice",
			"officialCard": "dEbo8a_officialCard",
			"plain": "dEbo8a_plain",
			"primaryLink": "dEbo8a_primaryLink",
			"rich": "dEbo8a_rich",
			"rowEnd": "dEbo8a_rowEnd",
			"secondary": "dEbo8a_secondary",
			"select": "dEbo8a_select",
			"status": "dEbo8a_status",
			"statusError": "dEbo8a_statusError",
			"statusLine": "dEbo8a_statusLine",
			"statusOk": "dEbo8a_statusOk",
			"statusWarn": "dEbo8a_statusWarn",
			"unavailable": "dEbo8a_unavailable",
			"unavailableLink": "dEbo8a_unavailableLink"
		};
		//#endregion
		//#region src/client/HubAccountCard.tsx
		/**
		* The hub-rendered account card: a declarative form drawn entirely from the
		* plugin's card descriptor. The plugin ships no browser code — its descriptor,
		* the values stored under its settings namespace (read back redacted), and its
		* invoke seam are the whole surface. Field kinds: text, password, checkbox,
		* select (static or plugin-served options), and buttons whose actions run
		* plugin-side (e.g. scanning the account's available models) and may push
		* fresh select options back.
		*/
		/** Narrow an unknown value to a JSON object record; anything else is empty. */
		function asRecord(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
			return value;
		}
		function asString(value) {
			return typeof value === "string" ? value : "";
		}
		function asBoolean(value) {
			return value === true;
		}
		/** Parse a plugin-served option payload; malformed entries are dropped. */
		function parseOptions(value) {
			const rows = Array.isArray(value) ? value : asRecord(value).options;
			if (!Array.isArray(rows)) return [];
			return rows.map((row) => ({
				value: asString(asRecord(row).value),
				label: asString(asRecord(row).label)
			})).filter((row) => row.value !== "");
		}
		function sameValue(before, after) {
			return JSON.stringify(before ?? null) === JSON.stringify(after ?? null);
		}
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/**
		* Render one account's declarative card.
		* @param props - the row (with its card descriptor) and the hub seams.
		* @returns the card, redrawn from the descriptor alone.
		*/
		function HubAccountCard(props) {
			const { t, row, surface = "account", invoke, readParams, commitParams, editor, zone } = props;
			const status = asRecord(row.state);
			const visibleFields = (0, react.useMemo)(() => (row.card?.fields ?? []).filter((field) => {
				if (field.surface !== void 0 && field.surface !== surface) return false;
				if (field.when === "signed-in" && status.signedIn !== true) return false;
				if (field.when === "signed-out" && status.signedIn === true) return false;
				if (surface === "models" && zone !== void 0 && field.placement === "catalog" !== (zone === "catalog")) return false;
				return true;
			}), [
				row.card,
				surface,
				status,
				zone
			]);
			const [initial, setInitial] = (0, react.useState)({});
			const [values, setValues] = (0, react.useState)({});
			const [options, setOptions] = (0, react.useState)({});
			const [filters, setFilters] = (0, react.useState)({});
			const [openKey, setOpenKey] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(null);
			const [dialogField, setDialogField] = (0, react.useState)(null);
			const [dialogValues, setDialogValues] = (0, react.useState)({});
			const [dialogNotice, setDialogNotice] = (0, react.useState)(null);
			const [dialogBusy, setDialogBusy] = (0, react.useState)(false);
			const alive = (0, react.useRef)(true);
			(0, react.useEffect)(() => () => {
				alive.current = false;
			}, []);
			(0, react.useEffect)(() => {
				alive.current = true;
				(async () => {
					try {
						const stored = asRecord(await readParams());
						if (!alive.current) return;
						setInitial(stored);
						setValues(stored);
						setNotice(null);
					} catch (error) {
						if (alive.current) setNotice({
							tone: "error",
							text: messageOf(error)
						});
					}
				})();
				return () => {
					alive.current = false;
				};
			}, [readParams, row.id]);
			const dynamicKey = visibleFields.filter((field) => field.kind === "select" && field.options === void 0).map((field) => field.key).join("\0");
			(0, react.useEffect)(() => {
				if (dynamicKey === "") return;
				(async () => {
					for (const key of dynamicKey.split("\0")) try {
						const raw = await invoke("options", { field: key });
						if (!alive.current) return;
						setOptions((previous) => ({
							...previous,
							[key]: parseOptions(raw)
						}));
					} catch (error) {
						if (!alive.current) return;
						const field = visibleFields.find((candidate) => candidate.key === key);
						setNotice({
							tone: "error",
							text: `${t("optionsFailed")} — ${field?.label ?? key}: ${messageOf(error)}`
						});
					}
				})();
			}, [
				dynamicKey,
				invoke,
				visibleFields,
				t
			]);
			const statusText = asString(status.text);
			const statusLevel = status.level === "ok" || status.level === "warn" || status.level === "error" ? status.level : null;
			const brand = asRecord(status.brand);
			const brandLogo = asString(brand.logoUrl);
			const brandName = asString(brand.name);
			if (visibleFields.length === 0) return null;
			const isDraftBound = (field) => field.kind === "select" && field.bind !== void 0 && editor !== void 0;
			const isValueField = (field) => field.kind !== "button" && field.kind !== "dialog" && field.kind !== "note";
			const dirty = visibleFields.some((field) => isValueField(field) && !isDraftBound(field) && !sameValue(initial[field.key], values[field.key]));
			const setValue = (key, value) => {
				setValues((previous) => ({
					...previous,
					[key]: value
				}));
			};
			const autoSaveValue = (field, value) => {
				const op = value === void 0 || value === "" ? {
					op: "unset",
					path: [field.key]
				} : {
					op: "set",
					path: [field.key],
					value
				};
				(async () => {
					try {
						await commitParams([op]);
						if (!alive.current) return;
						setInitial((previous) => ({
							...previous,
							[field.key]: value
						}));
						setValues((previous) => ({
							...previous,
							[field.key]: value
						}));
					} catch (error) {
						if (alive.current) setNotice({
							tone: "error",
							text: `${t("saveFailed")}: ${messageOf(error)}`
						});
					}
				})();
			};
			const save = () => {
				(async () => {
					const ops = [];
					for (const field of visibleFields) {
						if (!isValueField(field) || isDraftBound(field)) continue;
						const before = initial[field.key];
						const after = values[field.key];
						if (sameValue(before, after)) continue;
						if (after === void 0 || after === "") ops.push({
							op: "unset",
							path: [field.key]
						});
						else ops.push({
							op: "set",
							path: [field.key],
							value: after
						});
					}
					if (ops.length === 0) return;
					setBusy("save");
					try {
						await commitParams(ops);
						if (!alive.current) return;
						setInitial({ ...values });
						setNotice({
							tone: "info",
							text: t("saved")
						});
					} catch (error) {
						if (alive.current) setNotice({
							tone: "error",
							text: `${t("saveFailed")}: ${messageOf(error)}`
						});
					} finally {
						if (alive.current) setBusy(null);
					}
				})();
			};
			const runAction = (field) => {
				const action = field.action;
				if (action === void 0) return;
				(async () => {
					setBusy(field.key);
					setNotice(null);
					try {
						const raw = asRecord(await invoke(action, { values }));
						if (!alive.current) return;
						const updates = Array.isArray(raw.options) ? raw.options : [];
						if (updates.length > 0) setOptions((previous) => {
							const next = { ...previous };
							for (const update of updates) {
								const record = asRecord(update);
								const key = asString(record.field);
								if (key !== "") next[key] = parseOptions(record.choices);
							}
							return next;
						});
						const message = asString(raw.message);
						if (message !== "") setNotice({
							tone: "info",
							text: message
						});
					} catch (error) {
						if (alive.current) setNotice({
							tone: "error",
							text: `${t("actionFailed")}: ${messageOf(error)}`
						});
					} finally {
						if (alive.current) setBusy(null);
					}
				})();
			};
			/** Close the open dialog, discarding its draft values and notice. */
			const closeDialog = () => {
				if (dialogBusy) return;
				setDialogField(null);
				setDialogValues({});
				setDialogNotice(null);
			};
			/** Run one dialog field's action with the entered values merged in; the
			* result's message shows inside the modal and `close: true` dismisses it
			* after a beat so the outcome stays readable. */
			const runDialogSubmit = () => {
				const field = dialogField;
				if (field === null) return;
				const action = field.action;
				if (action === void 0) return;
				(async () => {
					setDialogBusy(true);
					setDialogNotice(null);
					try {
						const raw = asRecord(await invoke(action, { values: {
							...values,
							...dialogValues
						} }));
						if (!alive.current) return;
						const message = asString(raw.message);
						if (message !== "") setDialogNotice({
							tone: raw.error === true ? "error" : "info",
							text: message
						});
						if (raw.close === true) window.setTimeout(() => {
							if (!alive.current) return;
							setDialogField(null);
							setDialogValues({});
							setDialogNotice(null);
						}, 1e3);
					} catch (error) {
						if (alive.current) setDialogNotice({
							tone: "error",
							text: messageOf(error)
						});
					} finally {
						if (alive.current) setDialogBusy(false);
					}
				})();
			};
			const openDialog = (field) => {
				setDialogField(field);
				setDialogValues({});
				setDialogNotice(null);
			};
			const renderButtonControl = (field) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: field.tone === "primary" ? "primary" : "outline",
				size: "sm",
				disabled: busy !== null,
				onClick: () => {
					if (field.kind === "dialog") openDialog(field);
					else runAction(field);
				},
				children: busy === field.key ? field.busyLabel ?? t("busy") : field.label
			}, field.key);
			const renderField = (field) => {
				if (field.kind === "note") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: HubAccountCard_module_css_default.hint,
					children: field.label
				}, field.key);
				if (field.kind === "button" || field.kind === "dialog") return renderButtonControl(field);
				const domId = `account-hub-${row.id}-${field.key}`;
				const control = () => {
					switch (field.kind) {
						case "text": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							id: domId,
							type: "text",
							value: asString(values[field.key]),
							placeholder: field.placeholder,
							onChange: (event) => {
								setValue(field.key, event.target.value);
							}
						});
						case "password": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							id: domId,
							type: "password",
							value: asString(values[field.key]),
							placeholder: field.placeholder,
							autoComplete: "off",
							onChange: (event) => {
								setValue(field.key, event.target.value);
							}
						});
						case "checkbox": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Checkbox, {
							checked: asBoolean(values[field.key]),
							label: field.label,
							onChange: (next) => {
								setValue(field.key, next);
							}
						});
						case "select": {
							const choices = [...field.options ?? [], ...options[field.key] ?? []];
							const bound = field.bind !== void 0 && editor !== void 0 ? {
								path: field.bind,
								access: editor
							} : void 0;
							const current = bound !== void 0 ? asString(bound.access.getPath([bound.path])) : asString(values[field.key]);
							const pick = (value) => {
								if (bound !== void 0) bound.access.setPath([bound.path], value);
								else if (field.autoSave === true) autoSaveValue(field, value);
								else setValue(field.key, value);
								setFilters((previous) => ({
									...previous,
									[field.key]: ""
								}));
								setOpenKey(null);
							};
							if (field.searchable === true) {
								const query = asString(filters[field.key]).trim().toLowerCase();
								const filtered = query === "" ? choices : choices.filter((choice) => choice.label.toLowerCase().includes(query) || choice.value.toLowerCase().includes(query));
								const visible = current === "" || query === "" || filtered.some((choice) => choice.value === current) ? filtered : [choices.find((choice) => choice.value === current), ...filtered].filter((choice) => choice !== void 0);
								const open = openKey === field.key;
								const currentChoice = choices.find((choice) => choice.value === current);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: HubAccountCard_module_css_default.combo,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										id: domId,
										className: HubAccountCard_module_css_default.comboTrigger,
										onClick: () => {
											setOpenKey(open ? null : field.key);
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: currentChoice === void 0 && current === "" ? HubAccountCard_module_css_default.comboPlaceholder : HubAccountCard_module_css_default.comboValue,
											children: currentChoice?.label ?? (current === "" ? t("selectPlaceholder") : current)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: HubAccountCard_module_css_default.comboCaret,
											children: "▾"
										})]
									}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: HubAccountCard_module_css_default.comboBackdrop,
										onClick: () => {
											setOpenKey(null);
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: HubAccountCard_module_css_default.comboPanel,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											type: "text",
											value: asString(filters[field.key]),
											placeholder: t("selectSearchPlaceholder"),
											autoComplete: "off",
											onChange: (event) => {
												setFilters((previous) => ({
													...previous,
													[field.key]: event.target.value
												}));
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: HubAccountCard_module_css_default.comboList,
											children: visible.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: HubAccountCard_module_css_default.comboEmpty,
												children: t("selectNoMatch")
											}) : visible.map((choice) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: choice.value === current ? `${HubAccountCard_module_css_default.comboOption} ${HubAccountCard_module_css_default.comboOptionActive}` : HubAccountCard_module_css_default.comboOption,
												onClick: () => {
													pick(choice.value);
												},
												children: choice.label
											}, choice.value))
										})]
									})] })]
								});
							}
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								id: domId,
								className: HubAccountCard_module_css_default.select,
								value: current,
								onChange: (event) => {
									pick(event.target.value);
								},
								children: [current === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: t("selectPlaceholder")
								}), choices.map((choice) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: choice.value,
									children: choice.label
								}, choice.value))]
							});
						}
						case "button": return renderButtonControl(field);
					}
				};
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: HubAccountCard_module_css_default.field,
					children: [
						field.kind !== "checkbox" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: HubAccountCard_module_css_default.label,
							htmlFor: domId,
							children: field.label
						}),
						control(),
						field.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: HubAccountCard_module_css_default.hint,
							children: field.description
						})
					]
				}, field.key);
			};
			const dialogModal = dialogField?.dialog === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: closeDialog,
				title: dialogField.dialog.title ?? dialogField.label,
				closeLabel: t("cancel"),
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					size: "sm",
					disabled: dialogBusy,
					onClick: closeDialog,
					children: t("cancel")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					size: "sm",
					disabled: dialogBusy,
					onClick: runDialogSubmit,
					children: dialogBusy ? dialogField.busyLabel ?? t("busy") : dialogField.dialog.submitLabel ?? dialogField.label
				})] }),
				children: [dialogField.dialog.fields.map((input, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: HubAccountCard_module_css_default.field,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						className: HubAccountCard_module_css_default.label,
						htmlFor: `account-hub-dialog-${row.id}-${input.key}`,
						children: input.label
					}), input.kind === "select" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						id: `account-hub-dialog-${row.id}-${input.key}`,
						className: HubAccountCard_module_css_default.select,
						value: asString(dialogValues[input.key]),
						autoComplete: "off",
						"data-modal-autofocus": index === 0 ? "" : void 0,
						onChange: (event) => {
							setDialogValues((previous) => ({
								...previous,
								[input.key]: event.target.value
							}));
						},
						children: [asString(dialogValues[input.key]) === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { value: "" }), (input.options ?? []).filter((option) => input.dependsOn === void 0 || option.when === void 0 || asString(dialogValues[input.dependsOn]) === option.when).map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: option.value,
							children: option.label
						}, option.value))]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
						id: `account-hub-dialog-${row.id}-${input.key}`,
						type: input.kind,
						value: asString(dialogValues[input.key]),
						placeholder: input.placeholder,
						autoComplete: "off",
						"data-modal-autofocus": index === 0 ? "" : void 0,
						onChange: (event) => {
							setDialogValues((previous) => ({
								...previous,
								[input.key]: event.target.value
							}));
						}
					})]
				}, input.key)), dialogNotice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: dialogNotice.tone === "error" ? HubAccountCard_module_css_default.error : HubAccountCard_module_css_default.notice,
					children: dialogNotice.text
				})]
			});
			const identity = asRecord(status.identity);
			const balance = asRecord(status.balance);
			const details = asRecord(status.details);
			if (surface !== "models" && status.signedIn === true && (asString(identity.name) !== "" || asString(identity.contact) !== "" || asString(identity.avatarUrl) !== "" || asString(identity.infoUrl) !== "")) {
				const balanceRows = Array.isArray(balance.rows) ? balance.rows : [];
				const moreRows = Array.isArray(balance.more) ? balance.more : [];
				const detailRows = Array.isArray(details.rows) ? details.rows : [];
				const buttons = visibleFields.filter((field) => field.kind === "button" || field.kind === "dialog");
				const rowLink = (raw) => {
					const link = asRecord(raw);
					const href = asString(link.href);
					const label = asString(link.label);
					if (href === "" || label === "") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: HubAccountCard_module_css_default.unavailable,
						children: label
					});
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						className: `${HubAccountCard_module_css_default.unavailable} ${HubAccountCard_module_css_default.unavailableLink}`,
						href,
						target: "_blank",
						rel: "noreferrer",
						children: label
					});
				};
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: HubAccountCard_module_css_default.rich,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: HubAccountCard_module_css_default.officialCard,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: HubAccountCard_module_css_default.identityRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: HubAccountCard_module_css_default.identity,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: HubAccountCard_module_css_default.avatar,
											children: brandLogo !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
												className: HubAccountCard_module_css_default.avatarBrand,
												src: brandLogo,
												alt: ""
											}) : asString(identity.avatarUrl) !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
												className: HubAccountCard_module_css_default.avatarImage,
												src: asString(identity.avatarUrl),
												alt: "",
												referrerPolicy: "no-referrer"
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconUserOutlineMedium, { size: 16 })
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: HubAccountCard_module_css_default.identityCopy,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: HubAccountCard_module_css_default.nameLine,
												children: asString(identity.name) !== "" ? asString(identity.name) : t("signedIn")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: HubAccountCard_module_css_default.statusLine,
												role: "status",
												children: asString(identity.contact)
											})]
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: HubAccountCard_module_css_default.rowEnd,
										children: [buttons.map(renderButtonControl), asString(identity.infoUrl) !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
											className: HubAccountCard_module_css_default.accountInfo,
											href: asString(identity.infoUrl),
											target: "_blank",
											rel: "noopener noreferrer",
											children: [asString(identity.infoLabel) !== "" ? asString(identity.infoLabel) : t("accountInfo"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutlineRegular, { size: 12 })]
										})]
									})]
								}),
								(detailRows.length > 0 || balanceRows.length > 0 || moreRows.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: HubAccountCard_module_css_default.divider }),
								detailRows.map((raw, index) => {
									const d = asRecord(raw);
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [index > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: HubAccountCard_module_css_default.divider }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: HubAccountCard_module_css_default.bRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: asString(d.label) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: asString(d.value) })]
									})] }, `detail-${index}`);
								}),
								balanceRows.map((raw, index) => {
									const r = asRecord(raw);
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [(index > 0 || detailRows.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: HubAccountCard_module_css_default.divider }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: HubAccountCard_module_css_default.bRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: asString(r.label) }), asString(r.value) !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: HubAccountCard_module_css_default.amount,
											children: asString(r.value)
										}) : r.loading === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: HubAccountCard_module_css_default.unavailable,
											children: t("loading")
										}) : rowLink(r.unavailable ?? null)]
									})] }, `balance-${index}`);
								}),
								moreRows.map((raw, index) => {
									const m = asRecord(raw);
									const links = Array.isArray(m.links) ? m.links : [];
									if (links.length === 0) return null;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [(index > 0 || detailRows.length > 0 || balanceRows.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: HubAccountCard_module_css_default.divider }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: HubAccountCard_module_css_default.bRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: HubAccountCard_module_css_default.secondary,
											children: asString(m.label)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: HubAccountCard_module_css_default.links,
											children: links.map((rawLink, linkIndex) => {
												const link = asRecord(rawLink);
												const href = asString(link.href);
												const action = asString(link.action);
												const label = asString(link.label);
												if (action !== "") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: link.primary === true ? `${HubAccountCard_module_css_default.linkButton} ${HubAccountCard_module_css_default.primaryLink}` : HubAccountCard_module_css_default.linkButton,
													onClick: () => {
														(async () => {
															setNotice(null);
															try {
																await invoke(action, {});
															} catch (error) {
																setNotice({
																	tone: "error",
																	text: `${t("actionFailed")}: ${messageOf(error)}`
																});
															}
														})();
													},
													children: label
												}, linkIndex);
												if (href === "") return null;
												return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
													className: link.primary === true ? `${HubAccountCard_module_css_default.linkButton} ${HubAccountCard_module_css_default.primaryLink}` : HubAccountCard_module_css_default.linkButton,
													href,
													target: "_blank",
													rel: "noreferrer",
													children: label
												}, linkIndex);
											})
										})]
									})] }, `more-${index}`);
								})
							]
						}),
						notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: notice.tone === "error" ? HubAccountCard_module_css_default.error : HubAccountCard_module_css_default.notice,
							children: notice.text
						}),
						dialogModal
					]
				});
			}
			if (surface !== "models" && brandLogo !== "" && brandName !== "" && !visibleFields.some((field) => isValueField(field))) {
				const actionFields = status.signingIn === true ? [] : visibleFields.filter((field) => field.kind === "button" || field.kind === "dialog");
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: HubAccountCard_module_css_default.brandCard,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
							className: HubAccountCard_module_css_default.brandMark,
							src: brandLogo,
							alt: ""
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: HubAccountCard_module_css_default.brandName,
							children: brandName
						}),
						statusText !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: [HubAccountCard_module_css_default.brandStatus, statusLevel === "error" ? HubAccountCard_module_css_default.brandStatusError : void 0].join(" "),
							role: "status",
							children: statusText
						}),
						actionFields.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: HubAccountCard_module_css_default.brandActions,
							children: actionFields.map(renderButtonControl)
						}),
						notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: notice.tone === "error" ? HubAccountCard_module_css_default.error : HubAccountCard_module_css_default.notice,
							children: notice.text
						}),
						dialogModal
					]
				});
			}
			if (surface === "models" && zone === "catalog") {
				if (visibleFields.length === 0) return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: visibleFields.map(renderField) });
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: surface === "models" ? HubAccountCard_module_css_default.plain : HubAccountCard_module_css_default.card,
				children: [
					surface !== "models" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: HubAccountCard_module_css_default.head,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: HubAccountCard_module_css_default.name,
							children: row.displayName
						}), statusText !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: [HubAccountCard_module_css_default.status, statusLevel === null ? void 0 : HubAccountCard_module_css_default[statusLevel]].join(" "),
							children: statusText
						})]
					}),
					visibleFields.map(renderField),
					notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: notice.tone === "error" ? HubAccountCard_module_css_default.error : HubAccountCard_module_css_default.notice,
						children: notice.text
					}),
					visibleFields.some((field) => isValueField(field) && !isDraftBound(field) && field.autoSave !== true) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: HubAccountCard_module_css_default.actions,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "sm",
							disabled: !dirty || busy !== null,
							onClick: () => {
								save();
							},
							children: busy === "save" ? t("saving") : t("save")
						})
					}),
					dialogModal
				]
			});
		}
		//#endregion
		//#region src/client/HubSection.tsx
		/**
		* Rendered seats of the settings account column: the section wrapper, its
		* loaded row list, and one account's models-page provider card. Split from the
		* client entry because the shared client preset resolves `src/client/index.ts`
		* as the bundle input, and a JSX-bearing entry leaves that path unresolvable
		* for tooling reading the preset (the third-party notices generator among it).
		*/
		/** Display order of the capability groups; a group with no rows renders nothing. */
		const GROUP_ORDER = [
			"chat",
			"embedding",
			"tts",
			"asr"
		];
		/** The locale key of each group's heading. */
		const GROUP_KEYS = {
			chat: "groupChat",
			embedding: "groupEmbedding",
			tts: "groupTts",
			asr: "groupAsr"
		};
		/** Style of the group heading shown only when several families coexist. */
		const GROUP_HEADING = {
			margin: "10px 0 4px",
			fontSize: 12,
			fontWeight: 500,
			opacity: .65
		};
		/**
		* Render the settings account column: the registry read lives here, row
		* content is delegated per account to the `account.hub.row` slot.
		* @param props - slot-delivered injected dependencies.
		* @returns the section, or null while the shell has not injected yet.
		*/
		function AccountHubSection(props) {
			const { face, renderSlot } = props;
			if (face === void 0 || renderSlot === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Loaded, {
				face,
				renderSlot
			});
		}
		/** @param props - the resolved face and the row renderer. @returns the row list. */
		function Loaded({ face, renderSlot }) {
			const [rows, setRows] = (0, react.useState)([]);
			const [failed, setFailed] = (0, react.useState)(null);
			const [official, setOfficial] = (0, react.useState)(face.official?.getSnapshot());
			(0, react.useEffect)(() => {
				let alive = true;
				const refresh = () => {
					face.list().then((value) => {
						if (!alive) return;
						setRows(value.map((row) => ({ row })));
						setFailed(null);
						for (const row of value) if (row.modelsCard === true) face.ensureModelsCard(row.settingsNs);
					}, (error) => {
						if (alive) setFailed(error instanceof Error ? error.message : String(error));
					});
				};
				refresh();
				const dispose = face.subscribe(refresh);
				const stopOfficial = face.official?.subscribe(() => setOfficial(face.official?.getSnapshot()));
				return () => {
					alive = false;
					dispose();
					stopOfficial?.();
				};
			}, [face]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [face.official !== void 0 && official !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HubAccountCard, {
				t: face.t,
				row: {
					id: "deepseek-official",
					displayName: "DeepSeek账号",
					settingsNs: "deepseek-account",
					type: "chat",
					card: { fields: official.signingIn ? [{
						key: "authorize",
						kind: "button",
						surface: "account",
						action: "open-authorize",
						label: "打开授权页"
					}, {
						key: "cancel",
						kind: "button",
						surface: "account",
						action: "cancel",
						label: "取消",
						tone: "primary",
						busyLabel: "取消中…"
					}] : [
						{
							key: "signIn",
							kind: "button",
							surface: "account",
							when: "signed-out",
							action: "sign-in",
							label: "登录",
							tone: "primary",
							busyLabel: "等待浏览器授权…"
						},
						{
							key: "signOut",
							kind: "button",
							surface: "account",
							when: "signed-in",
							action: "sign-out",
							label: "退出登录",
							tone: "primary",
							busyLabel: "退出中…"
						},
						{
							key: "console",
							kind: "button",
							surface: "account",
							when: "signed-in",
							action: "open-console",
							label: "控制台"
						}
					] },
					state: {
						signedIn: official.signedIn,
						signingIn: false,
						text: official.text,
						level: official.level,
						brand: {
							logoUrl: "data:image/svg+xml;base64,PHN2ZyBmaWxsPSIjNEQ2QkZFIiByb2xlPSJpbWciIHZpZXdCb3g9IjAgMCAyNCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48dGl0bGU+RGVlcFNlZWs8L3RpdGxlPjxwYXRoIGQ9Ik0yMy43NDggNC42NTFjLS4yNTQtLjEyNC0uMzY0LjExMy0uNTEyLjIzMy0uMDUxLjA0LS4wOTQuMDktLjEzNy4xMzctLjM3Mi4zOTctLjgwNi42NTctMS4zNzMuNjI2LS44MjktLjA0Ni0xLjUzNy4yMTQtMi4xNjMuODQ4LS4xMzMtLjc4Mi0uNTc1LTEuMjQ4LTEuMjQ3LTEuNTQ4LS4zNTItLjE1NS0uNzA4LS4zMTEtLjk1NS0uNjUtLjE3Mi0uMjQtLjIxOS0uNTA5LS4zMDUtLjc3NC0uMDU1LS4xNi0uMTEtLjMyMy0uMjkzLS4zNS0uMi0uMDMxLS4yNzguMTM2LS4zNTYuMjc2LS4zMTMuNTcyLS40MzQgMS4yMDItLjQyMiAxLjg0LjAyNyAxLjQzNi42MzMgMi41OCAxLjgzOCAzLjM5My4xMzcuMDk0LjE3Mi4xODcuMTI5LjMyMy0uMDgyLjI4LS4xOC41NTMtLjI2Ni44MzMtLjA1NS4xNzktLjEzNy4yMTgtLjMyOC4xNGE1LjUgNS41IDAgMCAxLTEuNzM3LTEuMTc5Yy0uODU3LS44MjgtMS42MzEtMS43NDMtMi41OTctMi40NmExMiAxMiAwIDAgMC0uNjg5LS40N2MtLjk4NS0uOTU3LjEzLTEuNzQzLjM4Ny0xLjgzNi4yNy0uMDk4LjA5NC0uNDMzLS43NzgtLjQyOC0uODcyLjAwMy0xLjY3LjI5NS0yLjY4Ny42ODVhMyAzIDAgMCAxLS40NjUuMTM2IDkuNiA5LjYgMCAwIDAtMi44ODMtLjEwMWMtMS44ODUuMjEtMy4zOSAxLjEtNC40OTcgMi42MjJDLjA4MiA4Ljc3Ni0uMjMxIDEwLjg1NC4xNTIgMTMuMDJjLjQwMyAyLjI4NCAxLjU2OCA0LjE3NSAzLjM2IDUuNjUzIDEuODU3IDEuNTMzIDMuOTk3IDIuMjg0IDYuNDM4IDIuMTQgMS40ODItLjA4NSAzLjEzMi0uMjg0IDQuOTk0LTEuODYuNDcuMjM0Ljk2Mi4zMjggMS43OC4zOTguNjI5LjA1OCAxLjIzNS0uMDMxIDEuNzA1LS4xMjkuNzM1LS4xNTUuNjg0LS44MzYuNDE4LS45NjEtMi4xNTUtMS4wMDQtMS42ODItLjU5NS0yLjExMi0uOTI2IDEuMDk1LTEuMjk1IDIuNzY4LTMuNTk4IDMuMjg0LTYuNzMzLjA1LS4zNDYuMTE1LS44MzQuMTA4LTEuMTE0LS4wMDQtLjE3MS4wMzUtLjIzOC4yMy0uMjU3YTQuMiA0LjIgMCAwIDAgMS41NDUtLjQ3NWMxLjM5Ny0uNzYzIDEuOTYtMi4wMTYgMi4wOTMtMy41MTcuMDItLjIzLS4wMDQtLjQ2Ny0uMjQ3LS41ODhNMTEuNTggMTguMTY4Yy0yLjA4OC0xLjY0Mi0zLjEwMS0yLjE4My0zLjUyLTIuMTYtLjM5LjAyNC0uMzIuNDcyLS4yMzQuNzYzLjA5LjI4OC4yMDcuNDg3LjM3MS43NC4xMTQuMTY3LjE5Mi40MTYtLjExMy42MDMtLjY3My40MTYtMS44NDItLjE0LTEuODk3LS4xNjgtMS4zNjEtLjgwMS0yLjUtMS44Ni0zLjMwMS0zLjMwNi0uNzc1LTEuMzkzLTEuMjI1LTIuODg4LTEuMjk5LTQuNDgyLS4wMi0uMzg1LjA5NC0uNTIyLjQ3Ny0uNTkyYTQuNyA0LjcgMCAwIDEgMS41My0uMDM4YzIuMTMxLjMxMSAzLjk0NiAxLjI2NCA1LjQ2NyAyLjc3NC44NjguODYgMS41MjUgMS44ODcgMi4yMDIgMi44OS43MiAxLjA2NiAxLjQ5NCAyLjA4MiAyLjQ4IDIuOTE1LjM0OC4yOTEuNjI2LjUxMy44OTIuNjc3LS44MDIuMDktMi4xNC4xMDktMy4wNTUtLjYxNXptMS4wMDEtNi40NGEuMzA2LjMwNiAwIDAgMSAuNDE1LS4yODcuMy4zIDAgMCAxIC4xMTMuMDc0LjMuMyAwIDAgMSAuMDg2LjIxNGMwIC4xNy0uMTM2LjMwNy0uMzA4LjMwN2EuMzAzLjMwMyAwIDAgMS0uMzA2LS4zMDdtMy4xMSAxLjU5NmMtLjIuMDgxLS40LjE1MS0uNTkxLjE2YTEuMjUgMS4yNSAwIDAgMS0uNzk4LS4yNTRjLS4yNzQtLjIzLS40Ny0uMzU4LS41NTEtLjc1OGExLjcgMS43IDAgMCAxIC4wMTUtLjU4OGMuMDctLjMyNy0uMDA3LS41MzctLjIzOC0uNzI3LS4xODgtLjE1Ni0uNDI2LS4xOTktLjY4OS0uMTk5YS42LjYgMCAwIDEtLjI1NC0uMDc4LjI1My4yNTMgMCAwIDEtLjExNC0uMzU4IDEgMSAwIDAgMSAuMTkyLS4yMWMuMzU2LS4yMDIuNzY3LS4xMzYgMS4xNDYuMDE2LjM1Mi4xNDQuNjE4LjQwOCAxLjAwMS43ODIuMzkyLjQ1MS40NjIuNTc2LjY4NS45MTUuMTc2LjI2NC4zMzYuNTM2LjQ0Ni44NDguMDY2LjE5NC0uMDIuMzUzLS4yNS40NSIvPjwvc3ZnPg==",
							name: "DeepSeek账号"
						},
						identity: {
							name: official.name,
							contact: official.contact,
							avatarUrl: official.avatarUrl
						},
						balance: { rows: official.rows.length > 0 ? official.rows : [{
							label: "余额",
							value: official.signedIn ? "加载中…" : "未登录"
						}] }
					}
				},
				invoke: async (method) => {
					if (method === "sign-in") {
						await face.official?.signIn();
						return { message: "已发起登录，请完成浏览器授权。" };
					}
					if (method === "sign-out") {
						await face.official?.signOut();
						return {};
					}
					if (method === "open-console") {
						face.official?.openConsole();
						return {};
					}
					if (method === "cancel") {
						await face.official?.cancel();
						return {};
					}
					if (method === "open-authorize") {
						face.official?.openAuthorize();
						return {};
					}
					return {};
				},
				readParams: async () => ({}),
				commitParams: async () => {}
			}), failed !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
				face.t("loadFailed"),
				" — ",
				failed
			] }) : rows.length === 0 && face.official === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: face.t("empty") }) : groups.length <= 1 ? rows.map(({ row }) => renderRow(row)) : groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [group.rows.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: GROUP_HEADING,
				children: face.t(GROUP_KEYS[group.type])
			}), group.rows.map(({ row }) => renderRow(row))] }, group.type))] });
			/** Render one row: the declarative card, or the plugin's own slot row. */
			function renderRow(row) {
				return row.card !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HubAccountCard, {
					t: face.t,
					row,
					invoke: (method, args) => face.invoke(row.id, method, args),
					readParams: () => face.readParams(row.id),
					commitParams: (ops) => face.commitParams(row.id, ops)
				}, row.id) : renderSlot("account.hub.row", {
					accountId: row.id,
					displayName: row.displayName,
					state: row.state,
					invoke: (method, args) => face.invoke(row.id, method, args)
				}, { entryKey: row.id });
			}
			/** Group the rows by resolved capability family, in display order. */
			function groups() {
				return GROUP_ORDER.map((type) => ({
					type,
					rows: rows.filter(({ row }) => (row.type ?? "chat") === type)
				})).filter((group) => group.rows.length > 0);
			}
		}
		/**
		* Draw one account's models-page provider card. The seat renders for every
		* directory row; only the account that opted in through `modelsCard` finds a
		* matching row, so every other provider renders nothing.
		* @param props - the row's owner facts and the hub face.
		* @returns the account's models-surface card, or nothing.
		*/
		function ProviderModelsCard(props) {
			const { face } = props;
			const settingsNs = props.provider.settingsNs;
			const [row, setRow] = (0, react.useState)(null);
			const [settled, setSettled] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				let alive = true;
				const refresh = () => {
					face.list().then((rows) => {
						if (!alive) return;
						setRow(rows.find((candidate) => candidate.settingsNs === settingsNs && candidate.modelsCard === true && candidate.card?.fields.some((field) => field.surface === "models") === true) ?? null);
						setSettled(true);
					}, () => {
						if (alive) setSettled(true);
					});
				};
				refresh();
				const dispose = face.subscribe(refresh);
				const stopOfficial = face.official?.subscribe(() => setOfficial(face.official?.getSnapshot()));
				return () => {
					alive = false;
					dispose();
					stopOfficial?.();
				};
			}, [face, settingsNs]);
			if (!settled || row === null) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HubAccountCard, {
				t: face.t,
				row,
				surface: "models",
				editor: props.editor,
				zone: props.zone,
				invoke: (method, args) => face.invoke(row.id, method, args),
				readParams: () => face.readParams(row.id),
				commitParams: (ops) => face.commitParams(row.id, ops)
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** One registered account as the section renders it. */
		/** 官方余额格式：两位小数、不足一分显示 <¥0.01、负数接近 0 显示 -¥0.01，其余向下截断。 */
		function formatBalance(amount, symbol) {
			const raw = String(amount).trim();
			if (raw === "" || Number.isNaN(Number(raw))) return `${symbol}0.00`;
			const negative = raw.startsWith("-");
			const [integerPart = "0", fractionRaw = ""] = (negative ? raw.slice(1) : raw).split(".");
			const fraction = (fractionRaw + "00").slice(0, 2);
			if (/^0*$/.test(integerPart) && /^0*$/.test(fraction)) return `${symbol}0.00`;
			if (/^0*$/.test(integerPart) && Number(`0.${fractionRaw}`) < .01) return negative ? `-${symbol}0.01` : `<${symbol}0.01`;
			const grouped = Number(integerPart.replace(/^0+(?=\d)/, "") || "0").toLocaleString("en-US");
			return `${negative ? "-" : ""}${symbol}${grouped}.${fraction}`;
		}
		/** @returns the localized display name for the section nav. */
		function sectionLabel(t) {
			return t("nav");
		}
		/** Services required by the account column. `remote.accountHub` is mounted
		* by the account-hub-mount plugin, which activates off the bare remote
		* carrier; this plugin's activation parks on the namespace service until the
		* mount lands, so apply() sees it fully populated. */
		const inject = [
			"slots",
			"locale",
			"remote",
			"remote.accountHub",
			"remote.account",
			"theme"
		];
		/**
		* Register the account column. Both renderers run this: the Desktop shell and
		* the Browser settings panel render the same `settings.section` seat, and the
		* hub's registry read and invoke seam are both served by the host rather than
		* by a surface-specific bridge. @param ctx - client plugin context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("settings.accountHub", {
				en,
				zh
			}), "accountHub: dictionaries");
			const t = ctx.locale.bind("settings.accountHub");
			let official;
			try {
				const account = ctx.remote.account;
				let activeAttemptId;
				let openedAuthorize = "";
				let officialState = {
					signedIn: false,
					text: "未登录",
					level: "warn",
					name: "DeepSeek 账号",
					contact: "",
					avatarUrl: "",
					consoleUrl: "",
					signingIn: false,
					expired: false,
					authorizeUrl: "",
					rows: []
				};
				const officialListeners = /* @__PURE__ */ new Set();
				const publishOfficial = (patch) => {
					officialState = {
						...officialState,
						...patch
					};
					for (const listener of officialListeners) listener();
				};
				const clientMeta = () => ({
					version: globalThis.DSH_CLIENT_VERSION ?? "0.2.1-rc.3",
					locale: ctx.locale.getSnapshot().active,
					timezoneOffsetSeconds: -(/* @__PURE__ */ new Date()).getTimezoneOffset() * 60
				});
				const readProfile = async () => {
					if (account === void 0) return;
					try {
						const [profile, balance] = await Promise.all([account.getProfile(clientMeta()).catch(() => void 0), account.getBalance(clientMeta()).catch(() => void 0)]);
						const p = profile?.ok === true && profile.value !== null && typeof profile.value === "object" ? profile.value.value ?? {} : {};
						const balanceDetails = balance?.ok === true && balance.value !== null && typeof balance.value === "object" ? balance.value : void 0;
						const name = typeof p["name"] === "string" ? p["name"] : typeof p["nickname"] === "string" ? p["nickname"] : "DeepSeek 账号";
						const contact = typeof p["email"] === "string" ? p["email"] : typeof p["phone"] === "string" ? p["phone"] : "";
						const avatarUrl = typeof p["avatarUrl"] === "string" ? p["avatarUrl"] : "";
						const rows = [];
						const wallets = Array.isArray(balanceDetails?.value) ? balanceDetails.value : [];
						for (const wallet of wallets) {
							const currency = typeof wallet["currency"] === "string" ? wallet["currency"] : "CNY";
							const amount = wallet["balance"] ?? wallet["amount"];
							if (typeof amount === "string" || typeof amount === "number") rows.push({
								label: "余额",
								value: formatBalance(amount, currency === "CNY" ? "¥" : "$")
							});
						}
						const bonusWallets = Array.isArray(balanceDetails?.bonusWallets) ? balanceDetails.bonusWallets : [];
						for (const wallet of bonusWallets) {
							const currency = typeof wallet["currency"] === "string" ? wallet["currency"] : "CNY";
							const amount = wallet["balance"] ?? wallet["amount"];
							if ((typeof amount === "string" || typeof amount === "number") && Number(amount) > 0) rows.push({
								label: "赠金",
								value: formatBalance(amount, currency === "CNY" ? "¥" : "$")
							});
						}
						publishOfficial({
							name,
							contact,
							avatarUrl,
							rows,
							signedIn: true,
							level: "ok",
							text: "已登录"
						});
					} catch {}
				};
				if (account !== void 0) ctx.effect(() => {
					const controller = new AbortController();
					try {
						const stream = ctx.remote.$stream({
							name: "account",
							open: (signal) => account.watch(signal),
							ended: () => /* @__PURE__ */ new Error("account stream ended")
						});
						(async () => {
							try {
								for await (const frame of stream) {
									const view = frame.value;
									const signedIn = view.status === "credential-stored";
									const phase = view.attempt?.phase ?? "";
									if (typeof view.attempt?.id === "string") activeAttemptId = view.attempt.id;
									if (typeof view.attempt?.authorizeUrl === "string" && view.attempt.authorizeUrl !== "" && view.attempt.authorizeUrl !== officialState.authorizeUrl) publishOfficial({ authorizeUrl: view.attempt.authorizeUrl });
									if (phase === "waiting-browser" && typeof view.attempt?.authorizeUrl === "string" && view.attempt.authorizeUrl !== "" && view.attempt.authorizeUrl !== openedAuthorize) {
										openedAuthorize = view.attempt.authorizeUrl;
										try {
											globalThis.open(view.attempt.authorizeUrl, "_blank", "noopener,noreferrer");
										} catch {}
									}
									const rawConsole = view.links?.usageUrl;
									if (typeof rawConsole === "string" && rawConsole !== "") try {
										publishOfficial({ consoleUrl: new URL(rawConsole, globalThis.location.origin).href });
									} catch {}
									if (signedIn) publishOfficial({
										signedIn: true,
										signingIn: false,
										expired: false,
										authorizeUrl: "",
										level: "ok",
										text: "已登录"
									});
									else if ([
										"initializing",
										"waiting-browser",
										"exchanging",
										"committing"
									].includes(phase)) publishOfficial({
										signedIn: false,
										signingIn: true,
										expired: false,
										level: "warn",
										text: "已发起登录，请完成浏览器授权……"
									});
									else if (phase === "expired") publishOfficial({
										signedIn: false,
										signingIn: false,
										expired: true,
										authorizeUrl: "",
										level: "error",
										text: "登录已过期。",
										name: "DeepSeek 账号",
										contact: "",
										avatarUrl: "",
										rows: []
									});
									else publishOfficial({
										signedIn: false,
										signingIn: false,
										expired: false,
										level: "warn",
										text: "未登录",
										name: "DeepSeek 账号",
										contact: "",
										avatarUrl: "",
										rows: []
									});
									frame.accept();
									if (signedIn) readProfile();
								}
							} catch {}
						})();
					} catch (error) {
						console.warn("[account-hub] official account stream unavailable", error);
					}
					return () => {
						controller.abort();
					};
				}, "accountHub: official account stream");
				official = account === void 0 ? void 0 : {
					getSnapshot: () => ({
						...officialState,
						rows: [...officialState.rows]
					}),
					subscribe: (onChange) => {
						officialListeners.add(onChange);
						return () => {
							officialListeners.delete(onChange);
						};
					},
					signIn: async () => {
						const transport = globalThis.__DSH_TRANSPORT__;
						const origin = transport?.streamBaseUrl !== void 0 ? new URL(transport.streamBaseUrl).origin : globalThis.location.origin;
						if ((await account.startSignIn(clientMeta(), origin, "desktop")).ok !== true) throw new Error("官方账号登录启动失败");
					},
					openConsole: () => {
						const url = officialState.consoleUrl !== "" ? officialState.consoleUrl : "https://platform.deepseek.com";
						globalThis.open(url, "_blank", "noopener,noreferrer");
					},
					signOut: async () => {
						if ((await account.signOut(clientMeta())).ok !== true) throw new Error("官方账号退出失败");
					},
					openAuthorize: () => {
						if (officialState.authorizeUrl === "") return;
						globalThis.open(officialState.authorizeUrl, "_blank", "noopener,noreferrer");
					},
					cancel: async () => {
						if (activeAttemptId === void 0) return;
						await account.cancelSignIn(activeAttemptId);
					}
				};
			} catch (error) {
				console.warn("[account-hub] official account bridge unavailable", error);
			}
			const face = {
				official,
				t,
				list: async () => {
					const result = await ctx.remote.accountHub.list();
					if (!result.ok) throw new Error(result.error.message);
					return result.value.map((view) => ({
						...view,
						state: view.state
					}));
				},
				subscribe: (onChange) => {
					const stream = ctx.remote.$stream({
						name: "accountHub",
						open: (signal) => ctx.remote.accountHub.watch(signal),
						ended: () => /* @__PURE__ */ new Error("account hub stream ended")
					});
					(async () => {
						for await (const frame of stream) {
							frame.accept();
							onChange();
						}
					})();
					return () => {
						stream.dispose();
					};
				},
				invoke: async (accountId, method, args) => {
					const result = await ctx.remote.accountHub.invoke(accountId, method, args);
					if (!result.ok) throw new Error(result.error.message);
					return result.value;
				},
				readParams: async (accountId) => {
					const result = await ctx.remote.accountHub.readParams(accountId);
					if (!result.ok) throw new Error(result.error.message);
					return result.value;
				},
				commitParams: async (accountId, ops) => {
					const result = await ctx.remote.accountHub.commitParams(accountId, ops);
					if (!result.ok) throw new Error(result.error.message);
				},
				ensureModelsCard: (settingsNs) => {
					if (modelCardEntries.has(settingsNs)) return;
					const dispose = ctx.slots.register({
						name: "settings.models.provider-card",
						key: settingsNs,
						locale: "settings.accountHub",
						inject: () => ({ face })
					}, ProviderModelsCard);
					modelCardEntries.set(settingsNs, dispose);
				}
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "account",
				order: -10,
				label: () => t("nav"),
				locale: "settings.accountHub",
				children: { "account.hub.row": {
					kind: "keyed",
					scope: "root"
				} },
				inject: () => ({ face })
			}, AccountHubSection));
			const modelCardEntries = /* @__PURE__ */ new Map();
			ctx.effect(() => () => {
				for (const dispose of modelCardEntries.values()) dispose();
			}, "accountHub: models-card entries");
		}
		//#endregion
		exports.AccountHubSection = AccountHubSection;
		exports.ProviderModelsCard = ProviderModelsCard;
		exports.apply = apply;
		exports.inject = inject;
		exports.sectionLabel = sectionLabel;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map