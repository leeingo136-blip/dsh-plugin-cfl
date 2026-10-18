//#region lib/types/index.js
/** Host half of the knowledge mount plugin: no host-side composition. */
const name = "memory-mount";
/** @param ctx - Host context (reserved; the mount lives on the client half). */
function apply(ctx) {}
//#endregion
export { apply, name };
