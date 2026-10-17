window.__ModuleLoader__.load({
	id: "@dsh/dh-mount",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region lib/client/index.js
		/**
		 * Client half: mount the digital-hands remote contribution as early as the
		 * remote service exists, so the settings section (which injects
		 * `remote.digitalHands`) resolves it during its own activation. Mirrors
		 * the account-hub-mount layout.
		 *
		 * Codec contract (verified against dsh-api-gateway client + dsh-typert-loader):
		 * - the client `$mount` validation (`requireStrictInputs`) rejects any
		 *   *parameter* codec that is not `mode:"strict"` — result codecs may stay
		 *   `src-json`;
		 * - strict parameter codecs are never parsed on the client (values ride
		 *   the wire as plain JSON and `prepareInvocation` copies them verbatim),
		 *   so an identity-parse factory satisfies the shape check losslessly.
		 */
		const jsonParam = (symbol) => ({
			mode: "strict",
			typeSymbol: symbol,
			create: () => ({ parse: (value) => value })
		});
		const TYPERT_REMOTE = {
			package: "dsh-plugin-digital-hands",
			descriptors: [
				{
					id: "dsh-plugin-digital-hands#digitalHands/listTools",
					service: "digitalHandsController",
					namespace: "digitalHands",
					method: "listTools",
					invocation: { kind: "direct" },
					parameters: [],
					result: { mode: "src-json" },
					sourceLocation: { file: "src/host/controller.ts", line: 1, column: 1 }
				},
				{
					id: "dsh-plugin-digital-hands#digitalHands/listPlans",
					service: "digitalHandsController",
					namespace: "digitalHands",
					method: "listPlans",
					invocation: { kind: "direct" },
					parameters: [],
					result: { mode: "src-json" },
					sourceLocation: { file: "src/host/controller.ts", line: 1, column: 1 }
				},
				{
					id: "dsh-plugin-digital-hands#digitalHands/savePlan",
					service: "digitalHandsController",
					namespace: "digitalHands",
					method: "savePlan",
					invocation: { kind: "direct" },
				parameters: ["name", "yaml"].map((key) => ({
					name: key,
					wire: key,
					source: "json",
					codec: jsonParam(`dsh-plugin-digital-hands#digitalHands/savePlan:${key}`)
				})),
					result: { mode: "src-json" },
					sourceLocation: { file: "src/host/controller.ts", line: 1, column: 1 }
				},
				{
					id: "dsh-plugin-digital-hands#digitalHands/deletePlan",
					service: "digitalHandsController",
					namespace: "digitalHands",
					method: "deletePlan",
					invocation: { kind: "direct" },
					parameters: ["name"].map((key) => ({
						name: key,
						wire: key,
						source: "json",
						codec: jsonParam(`dsh-plugin-digital-hands#digitalHands/deletePlan:${key}`)
					})),
					result: { mode: "src-json" },
					sourceLocation: { file: "src/host/controller.ts", line: 1, column: 1 }
				},
				{
					id: "dsh-plugin-digital-hands#digitalHands/status",
					service: "digitalHandsController",
					namespace: "digitalHands",
					method: "status",
					invocation: { kind: "direct" },
					parameters: [],
					result: { mode: "src-json" },
					sourceLocation: { file: "src/host/controller.ts", line: 1, column: 1 }
				},
				{
					id: "dsh-plugin-digital-hands#digitalHands/testMcp",
					service: "digitalHandsController",
					namespace: "digitalHands",
					method: "testMcp",
					invocation: { kind: "direct" },
					parameters: ["spec"].map((key) => ({
						name: key,
						wire: key,
						source: "json",
						codec: jsonParam(`dsh-plugin-digital-hands#digitalHands/testMcp:${key}`)
					})),
					result: { mode: "src-json" },
					sourceLocation: { file: "src/host/controller.ts", line: 1, column: 1 }
				}
			]
		};
		const name = "dh-mount";
		/** Only the remote carrier itself; the namespace appears when the mount lands. */
		const inject = ["remote"];
		/** @param ctx - Client plugin context. */
		function apply(ctx) {
			ctx.effect(() => {
				const disposer = ctx.remote.$mount(TYPERT_REMOTE);
				return () => {
					disposer.then((dispose) => dispose());
				};
			}, "digitalHands: remote contribution");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
