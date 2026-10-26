"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.name = void 0;
exports.apply = apply;
/**
 * Client half: mount the account-hub remote contribution as early as the
 * remote service exists, so plugins that inject `remote.accountHub` (the
 * account column) resolve it during their own activation. Splitting the
 * mount from the column mirrors the stock layout where the remotes assembly
 * mounts every namespace before the consuming UI plugins activate.
 */
var remote_1 = require("@dsh/api-account-hub/remote");
exports.name = 'account-hub-mount';
/** Only the remote carrier itself; the namespace appears when the mount lands. */
exports.inject = ['remote'];
/** @param ctx - Client plugin context. */
function apply(ctx) {
    ctx.effect(function () {
        var disposer = ctx.remote.$mount(remote_1.default);
        return function () { void disposer.then(function (dispose) { return dispose(); }); };
    }, 'accountHub: remote contribution');
}
