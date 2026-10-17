window.__ModuleLoader__.load({
	id: "@dsh/dh-ui",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
async function call(promise) {
  const result = await promise;
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
var section = { display: "flex", flexDirection: "column", gap: 16, padding: "4px 0" };
var card = {
  border: "0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-default, #e2e2e2))",
  borderRadius: "var(--dsw-radius-xl, 12px)",
  background: "var(--dsw-alias-settings-card-fill, var(--dsw-alias-surface-default, transparent))",
  padding: "12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10
};
var head = { display: "flex", alignItems: "baseline", gap: 10 };
var title = { color: "var(--dsw-alias-text-primary)", fontSize: 14, fontWeight: 600, margin: 0 };
var hint = { color: "var(--dsw-alias-text-secondary)", margin: 0, fontSize: 12 };
var muted = { color: "var(--dsw-alias-text-tertiary, var(--dsw-alias-text-secondary))", margin: 0, fontSize: 12 };
var errorText = { color: "var(--dsw-alias-text-danger, var(--dsw-ref-red-600, #cf222e))", margin: 0, fontSize: 12, whiteSpace: "pre-wrap" };
var okText = { color: "var(--dsw-alias-text-success, var(--dsw-ref-green-600, #1a7f37))", margin: 0, fontSize: 12 };
var row = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
var input = {
  height: 30,
  border: "1px solid var(--dsw-alias-border-default, var(--dsw-ref-neutral-200, #e2e2e2))",
  borderRadius: 8,
  background: "var(--dsw-alias-surface-default, transparent)",
  color: "var(--dsw-alias-text-primary)",
  padding: "0 8px",
  fontSize: 13
};
var button = {
  height: 30,
  border: "0.5px solid var(--dsw-alias-border-default, var(--dsw-ref-neutral-200, #e2e2e2))",
  borderRadius: 8,
  background: "transparent",
  color: "var(--dsw-alias-label-primary, var(--dsw-alias-text-primary))",
  padding: "0 12px",
  fontSize: 13,
  cursor: "pointer"
};
var primaryButton = {
  ...button,
  background: "var(--dsw-alias-button-primary-fill, var(--dsw-alias-text-primary))",
  color: "var(--dsw-alias-label-primary-foreground, #fff)",
  borderColor: "transparent",
  fontWeight: 500
};
var tabRow = { display: "flex", gap: 4 };
var tab = (active) => ({
  ...button,
  border: "none",
  fontWeight: active ? 600 : 400,
  background: active ? "var(--dsw-alias-interactive-bg-hover, #8080801a)" : "transparent"
});
var select = { ...input, cursor: "pointer" };
var textarea = {
  width: "100%",
  minHeight: 320,
  boxSizing: "border-box",
  border: "1px solid var(--dsw-alias-border-default, var(--dsw-ref-neutral-200, #e2e2e2))",
  borderRadius: 8,
  background: "var(--dsw-alias-surface-default, transparent)",
  color: "var(--dsw-alias-text-primary)",
  padding: 10,
  fontSize: 12.5,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  lineHeight: 1.55,
  resize: "vertical"
};
var NEW_PLAN_TEMPLATE = `# Digital Hands \u65B9\u6848\uFF1A\u58F0\u660E\u53D7\u7BA1 MCP \u670D\u52A1\u5668\u4E0E\u811A\u672C\u5DE5\u5177\u3002
# servers: \u6BCF\u6761\u4E00\u4E2A MCP \u670D\u52A1\u5668\uFF08transport: streamable-http \u9700\u8981 url\uFF0Cstdio \u9700\u8981 command/args\uFF09\u3002
# scripts: \u6BCF\u6761\u4E00\u4E2A\u672C\u5730 ES \u6A21\u5757\uFF08\u5BFC\u51FA\u5DE5\u5177\u5B9A\u4E49\uFF09\u3002
# docs: \u53EF\u9009\uFF0C\u5DE5\u5177\u540D -> \u5BCC\u6587\u672C\u8BF4\u660E\uFF0Ctool_search \u4F1A\u5C55\u793A\u3002
name: new-plan
servers: []
scripts: []
docs: {}
`;
function appendServer(yaml, spec) {
  const lines = [];
  const push = (key, value) => {
    lines.push(`    ${key}: ${JSON.stringify(value)}`);
  };
  push("name", spec.name);
  push("transport", spec.transport);
  if (spec.transport === "streamable-http") {
    push("url", spec.url);
    if (spec.headers !== "") {
      for (const pair of spec.headers.split("\n")) {
        const idx = pair.indexOf(":");
        if (idx > 0) lines.push(`    ${pair.slice(0, idx).trim()}: ${JSON.stringify(pair.slice(idx + 1).trim())}`);
      }
    }
  } else {
    push("command", spec.command);
    for (const arg of spec.args.split(/\s+/).filter((a) => a !== "")) {
      lines.push(`    - ${JSON.stringify(arg)}`);
    }
  }
  const block = lines.join("\n");
  if (/^servers:\s*\[\s*\]?\s*$/m.test(yaml)) {
    return yaml.replace(/^servers:[^\n]*$/m, "servers:\n  - " + block.split("\n").join("\n    ").replace(/^ {4}/, ""));
  }
  if (/^servers:\s*$/m.test(yaml)) {
    return yaml.replace(/^servers:\s*$/m, `servers:
  ${block.split("\n").join("\n    ")}`);
  }
  return `${yaml.replace(/\s*$/, "")}
servers:
  ${block.split("\n").join("\n    ")}
`;
}
var inject = ["slots", "remote", "remote.digitalHands"];
function apply(ctx) {
  const remote = ctx.remote;
  const face = {
    listTools: () => call(remote.digitalHands.listTools()),
    listPlans: () => call(remote.digitalHands.listPlans()),
    savePlan: async (name, yaml) => {
      await call(remote.digitalHands.savePlan(name, yaml));
    },
    deletePlan: async (name) => {
      await call(remote.digitalHands.deletePlan(name));
    },
    status: () => call(remote.digitalHands.status()),
    testMcp: (spec) => call(remote.digitalHands.testMcp(spec))
  };
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      {
        name: "settings.section",
        id: "digital-hands",
        order: -9,
        label: () => "\u6570\u636E\u624B",
        inject: () => ({ face })
      },
      DigitalHandsSection
    )
  );
}
function DigitalHandsSection(props) {
  const { face } = props;
  const [activeTab, setActiveTab] = (0, import_react.useState)("tools");
  if (face === void 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: section, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: tabRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: tab(activeTab === "tools"), onClick: () => setActiveTab("tools"), children: "\u5DE5\u5177\u5217\u8868" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: tab(activeTab === "mcp"), onClick: () => setActiveTab("mcp"), children: "MCP \u670D\u52A1\u5668" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: tab(activeTab === "plans"), onClick: () => setActiveTab("plans"), children: "\u65B9\u6848" })
    ] }),
    activeTab === "tools" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolsView, { face }) : activeTab === "mcp" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(McpView, { face }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlansView, { face })
  ] });
}
var badge = {
  fontSize: 11,
  lineHeight: "16px",
  padding: "0 8px",
  borderRadius: 999,
  border: "0.5px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-default, #e2e2e2))",
  whiteSpace: "nowrap"
};
var BADGES = {
  official: { label: "\u7B2C\u4E00\u65B9\u63D2\u4EF6", style: badge },
  "third-party": { label: "\u7B2C\u4E09\u65B9\u63D2\u4EF6", style: { ...badge, color: "var(--dsw-alias-text-secondary)" } },
  mcp: { label: "MCP", style: { ...badge, color: "var(--dsw-alias-text-success, var(--dsw-ref-green-600, #1a7f37))" } },
  self: { label: "\u7B2C\u4E09\u65B9\u63D2\u4EF6", style: { ...badge, color: "var(--dsw-alias-text-secondary)" } }
};
var toolList = { display: "flex", flexDirection: "column" };
var toolLine = {
  display: "flex",
  gap: 12,
  padding: "5px 0",
  borderBottom: "0.5px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-default, #e2e2e2))",
  alignItems: "baseline"
};
var toolName = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12.5,
  color: "var(--dsw-alias-text-primary)",
  minWidth: 220,
  flexShrink: 0
};
var toolDesc = { color: "var(--dsw-alias-text-secondary)", fontSize: 12.5, minWidth: 0 };
function ToolsView({ face }) {
  const [groups, setGroups] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  const refresh = (0, import_react.useCallback)(() => {
    face.listTools().then((value) => {
      setGroups(value.groups);
      setError(null);
    }).catch((cause) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [face]);
  (0, import_react.useEffect)(refresh, [refresh]);
  if (error !== null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: card, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: errorText, children: [
    "\u52A0\u8F7D\u5931\u8D25\uFF1A",
    error
  ] }) });
  if (groups === null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: card, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: muted, children: "\u52A0\u8F7D\u4E2D\u2026" }) });
  const list = Array.isArray(groups) ? groups : [];
  const total = list.reduce((sum, group) => sum + group.tools.length, 0);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...row, paddingLeft: 2 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: muted, children: [
        list.length,
        " \u4E2A\u6765\u6E90 \xB7 ",
        total,
        " \u4E2A\u5DE5\u5177"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: button, onClick: refresh, children: "\u5237\u65B0" })
    ] }),
    list.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...card, gap: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: head, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: title, children: group.title }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: BADGES[group.origin].style, children: BADGES[group.origin].label }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: muted, children: [
          group.tools.length,
          " \u4E2A\u5DE5\u5177"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: muted, children: group.subtitle }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: toolList, children: [
        group.tools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: toolLine, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: toolName, children: [
            tool.name,
            tool.hasDocs === true ? " \xB7" : ""
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: toolDesc, children: tool.description })
        ] }, tool.name)),
        group.tools.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: muted, children: "\u8BE5\u6765\u6E90\u5F53\u524D\u6CA1\u6709\u53EF\u7528\u5DE5\u5177\u3002" })
      ] })
    ] }, `${group.origin}:${group.title}`))
  ] });
}
var EMPTY_FORM = { name: "", transport: "streamable-http", url: "", command: "", args: "", headers: "" };
function McpView({ face }) {
  const [status, setStatus] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  const [form, setForm] = (0, import_react.useState)({ ...EMPTY_FORM });
  const [probe, setProbe] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [notice, setNotice] = (0, import_react.useState)(null);
  const [targetPlan, setTargetPlan] = (0, import_react.useState)("default");
  const refresh = (0, import_react.useCallback)(() => {
    face.status().then((value) => {
      setStatus(value);
      setError(null);
    }).catch((cause) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [face]);
  (0, import_react.useEffect)(refresh, [refresh]);
  const spec = () => {
    const base = { name: form.name.trim(), transport: form.transport };
    if (form.transport === "streamable-http") {
      base.url = form.url.trim();
      const headers = {};
      for (const pair of form.headers.split("\n")) {
        const idx = pair.indexOf(":");
        if (idx > 0) headers[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
      }
      if (Object.keys(headers).length > 0) base.headers = headers;
    } else {
      base.command = form.command.trim();
      base.args = form.args.split(/\s+/).filter((a) => a !== "");
    }
    return base;
  };
  const runProbe = () => {
    if (form.name.trim() === "") {
      setProbe({ ok: false, error: "\u5148\u586B\u670D\u52A1\u5668\u540D\u3002" });
      return;
    }
    setBusy(true);
    setProbe(null);
    face.testMcp(spec()).then((value) => {
      setProbe(value);
    }).catch((cause) => {
      setProbe({ ok: false, error: cause instanceof Error ? cause.message : String(cause) });
    }).finally(() => {
      setBusy(false);
    });
  };
  const saveToPlan = () => {
    if (probe?.ok !== true) {
      setNotice("\u8BF7\u5148\u6D4B\u8BD5\u8FDE\u63A5\u6210\u529F\u518D\u4FDD\u5B58\u3002");
      return;
    }
    setBusy(true);
    setNotice(null);
    face.listPlans().then(async (plans) => {
      const existing = plans.find((p) => p.name === targetPlan);
      const yaml = appendServer(existing?.yaml ?? NEW_PLAN_TEMPLATE.replace("name: new-plan", `name: ${targetPlan}`), {
        name: form.name.trim(),
        transport: form.transport,
        ...form.transport === "streamable-http" ? { url: form.url.trim(), headers: form.headers } : { command: form.command.trim(), args: form.args }
      });
      await face.savePlan(targetPlan, yaml);
      setNotice(`\u5DF2\u5199\u5165\u65B9\u6848\u300C${targetPlan}\u300D\u5E76\u70ED\u91CD\u8F7D\u3002`);
      setForm({ ...EMPTY_FORM });
      setProbe(null);
      refresh();
    }).catch((cause) => {
      setNotice(`\u4FDD\u5B58\u5931\u8D25\uFF1A${cause instanceof Error ? cause.message : String(cause)}`);
    }).finally(() => {
      setBusy(false);
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: head, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: title, children: "\u53D7\u7BA1 MCP \u670D\u52A1\u5668" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: button, onClick: refresh, children: "\u5237\u65B0" })
      ] }),
      error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: errorText, children: [
        "\u52A0\u8F7D\u5931\u8D25\uFF1A",
        error
      ] }),
      status === null && error === null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: muted, children: "\u52A0\u8F7D\u4E2D\u2026" }),
      status !== null && status.mcp.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: muted, children: "\u5F53\u524D\u6CA1\u6709\u53D7\u7BA1 MCP \u670D\u52A1\u5668\u3002\u5728\u4E0B\u65B9\u6DFB\u52A0\uFF0C\u6216\u5728\u65B9\u6848\u91CC\u58F0\u660E\u3002" }),
      status !== null && status.mcp.map((server) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...title, fontWeight: 500 }, children: server.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: server.state === "connected" ? okText : server.state === "failed" ? errorText : muted, children: server.state === "connected" ? `\u5DF2\u8FDE\u63A5 \xB7 ${server.tools} \u4E2A\u5DE5\u5177` : server.state === "failed" ? `\u5931\u8D25\uFF1A${server.failure ?? ""}` : "\u672A\u8FDE\u63A5" })
      ] }, server.name)),
      status !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: hint, children: [
        "\u6FC0\u6D3B\u65B9\u6848\uFF1A",
        status.activePlans.join("\u3001") || "\uFF08\u65E0\uFF09"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: title, children: "\u6DFB\u52A0 MCP \u670D\u52A1\u5668" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: hint, children: "\u5148\u6D4B\u8BD5\u8FDE\u63A5\uFF0C\u6210\u529F\u540E\u5199\u5165\u65B9\u6848\u5E76\u81EA\u52A8\u70ED\u91CD\u8F7D\uFF08\u6A21\u578B\u5373\u53EF\u76F4\u63A5\u8C03\u7528\u5176\u5DE5\u5177\uFF09\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            style: { ...input, width: 180 },
            placeholder: "\u670D\u52A1\u5668\u540D\uFF08\u82F1\u6587\uFF09",
            value: form.name,
            onChange: (e) => setForm({ ...form, name: e.target.value })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "select",
          {
            style: { ...select, width: 170 },
            value: form.transport,
            onChange: (e) => setForm({ ...form, transport: e.target.value }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "streamable-http", children: "Streamable HTTP\uFF08url\uFF09" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "stdio", children: "stdio\uFF08\u672C\u5730\u547D\u4EE4\uFF09" })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { style: { ...select, width: 160 }, value: targetPlan, onChange: (e) => setTargetPlan(e.target.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "default", children: "\u65B9\u6848\uFF1Adefault" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "mcp", children: "\u65B9\u6848\uFF1Amcp" })
        ] })
      ] }),
      form.transport === "streamable-http" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            style: { ...input, width: "100%", boxSizing: "border-box" },
            placeholder: "https://example.com/mcp",
            value: form.url,
            onChange: (e) => setForm({ ...form, url: e.target.value })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            style: { ...textarea, minHeight: 52 },
            placeholder: "\u8BF7\u6C42\u5934\uFF08\u53EF\u9009\uFF0C\u6BCF\u884C Key: Value\uFF09",
            value: form.headers,
            onChange: (e) => setForm({ ...form, headers: e.target.value })
          }
        )
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            style: { ...input, flex: 1, minWidth: 220 },
            placeholder: "\u547D\u4EE4\uFF0C\u5982 npx",
            value: form.command,
            onChange: (e) => setForm({ ...form, command: e.target.value })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            style: { ...input, flex: 2, minWidth: 220 },
            placeholder: "\u53C2\u6570\uFF08\u7A7A\u683C\u5206\u9694\uFF09\uFF0C\u5982 -y @some/mcp-server",
            value: form.args,
            onChange: (e) => setForm({ ...form, args: e.target.value })
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: button, disabled: busy, onClick: runProbe, children: busy ? "\u6D4B\u8BD5\u4E2D\u2026" : "\u6D4B\u8BD5\u8FDE\u63A5" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: primaryButton, disabled: busy || probe?.ok !== true, onClick: saveToPlan, children: "\u4FDD\u5B58\u5230\u65B9\u6848" })
      ] }),
      probe !== null && (probe.ok ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: okText, children: [
        "\u8FDE\u63A5\u6210\u529F\uFF0C",
        probe.tools?.length ?? 0,
        " \u4E2A\u5DE5\u5177\uFF1A",
        probe.tools?.join("\u3001") || "\uFF08\u65E0\uFF09"
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: errorText, children: [
        "\u8FDE\u63A5\u5931\u8D25\uFF1A",
        probe.error
      ] })),
      notice !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: muted, children: notice })
    ] })
  ] });
}
function PlansView({ face }) {
  const [plans, setPlans] = (0, import_react.useState)(null);
  const [selected, setSelected] = (0, import_react.useState)(null);
  const [draft, setDraft] = (0, import_react.useState)("");
  const [dirty, setDirty] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [notice, setNotice] = (0, import_react.useState)(null);
  const [newName, setNewName] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const refresh = (0, import_react.useCallback)((keep) => {
    face.listPlans().then((value) => {
      setPlans(value);
      setError(null);
      setSelected((current) => {
        const target = keep ?? current;
        if (target !== null && value.some((p) => p.name === target)) {
          setDraft(value.find((p) => p.name === target)?.yaml ?? "");
          return target;
        }
        setDraft(value[0]?.yaml ?? "");
        return value[0]?.name ?? null;
      });
      setDirty(false);
    }).catch((cause) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [face]);
  (0, import_react.useEffect)(() => {
    refresh();
  }, [refresh]);
  const open = (name) => {
    const plan = plans?.find((p) => p.name === name);
    if (plan === void 0) return;
    setSelected(name);
    setDraft(plan.yaml);
    setDirty(false);
    setNotice(null);
  };
  const save = () => {
    if (selected === null) return;
    setBusy(true);
    setNotice(null);
    face.savePlan(selected, draft).then(() => {
      setNotice(`\u5DF2\u4FDD\u5B58\u300C${selected}\u300D\u5E76\u70ED\u91CD\u8F7D\u3002`);
      setDirty(false);
      refresh(selected);
    }).catch((cause) => {
      setNotice(`\u4FDD\u5B58\u5931\u8D25\uFF1A${cause instanceof Error ? cause.message : String(cause)}`);
    }).finally(() => {
      setBusy(false);
    });
  };
  const remove = () => {
    if (selected === null || !window.confirm(`\u786E\u5B9A\u5220\u9664\u65B9\u6848\u300C${selected}\u300D\uFF1F\u8BE5\u6587\u4EF6\u4E0D\u53EF\u6062\u590D\u3002`)) return;
    setBusy(true);
    setNotice(null);
    face.deletePlan(selected).then(() => {
      setNotice(`\u5DF2\u5220\u9664\u300C${selected}\u300D\u5E76\u70ED\u91CD\u8F7D\u3002`);
      refresh();
    }).catch((cause) => {
      setNotice(`\u5220\u9664\u5931\u8D25\uFF1A${cause instanceof Error ? cause.message : String(cause)}`);
    }).finally(() => {
      setBusy(false);
    });
  };
  const create = () => {
    const stem = newName.trim().replace(/\.ya?ml$/i, "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (stem === "") {
      setNotice("\u65B9\u6848\u540D\u53EA\u80FD\u5305\u542B\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u8FDE\u5B57\u7B26\u4E0E\u4E0B\u5212\u7EBF\u3002");
      return;
    }
    setBusy(true);
    setNotice(null);
    face.savePlan(stem, NEW_PLAN_TEMPLATE.replace("name: new-plan", `name: ${stem}`)).then(() => {
      setNewName("");
      refresh(stem);
    }).catch((cause) => {
      setNotice(`\u521B\u5EFA\u5931\u8D25\uFF1A${cause instanceof Error ? cause.message : String(cause)}`);
    }).finally(() => {
      setBusy(false);
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: head, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: title, children: "\u65B9\u6848" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: button, onClick: () => refresh(selected), children: "\u5237\u65B0" })
    ] }),
    error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: errorText, children: [
      "\u52A0\u8F7D\u5931\u8D25\uFF1A",
      error
    ] }),
    plans !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: row, children: plans.map((plan) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", style: tab(selected === plan.name), onClick: () => open(plan.name), children: [
      plan.name,
      plan.active ? " \u25CF" : ""
    ] }, plan.name)) }),
    plans !== null && plans.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: muted, children: "\u8FD8\u6CA1\u6709\u65B9\u6848\u6587\u4EF6\u3002\u5728\u4E0B\u65B9\u8F93\u5165\u540D\u79F0\u65B0\u5EFA\u4E00\u4E2A\uFF0C\u6216\u624B\u52A8\u653E\u7F6E\u5230 ~/.dsh/digital-hands/plans/\u3002" }),
    selected !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: hint, children: [
        "\u7F16\u8F91 ",
        selected,
        ".yml\uFF08\u25CF = \u672C\u8F6E\u5DF2\u6302\u8F7D\uFF09\u3002\u4FDD\u5B58\u540E\u81EA\u52A8\u70ED\u91CD\u8F7D\u53D7\u7BA1\u5DE5\u5177\uFF1B\u8BED\u6CD5\u9519\u8BEF\u7684\u65B9\u6848\u4E0D\u4F1A\u88AB\u5199\u5165\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "textarea",
        {
          style: textarea,
          value: draft,
          spellCheck: false,
          onChange: (e) => {
            setDraft(e.target.value);
            setDirty(true);
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...row, justifyContent: "flex-end" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: button, disabled: busy, onClick: remove, children: "\u5220\u9664\u65B9\u6848" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: primaryButton, disabled: busy || !dirty, onClick: save, children: dirty ? "\u4FDD\u5B58\u5E76\u70ED\u91CD\u8F7D" : "\u5DF2\u4FDD\u5B58" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...row, borderTop: "0.5px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-default, #e2e2e2))", paddingTop: 10 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: { ...input, width: 220 },
          placeholder: "\u65B0\u65B9\u6848\u540D\uFF08\u5982 research\uFF09",
          value: newName,
          onChange: (e) => setNewName(e.target.value)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: button, disabled: busy, onClick: create, children: "\u65B0\u5EFA\u65B9\u6848" })
    ] }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: muted, children: notice })
  ] });
}

		return module.exports;
	}
});
