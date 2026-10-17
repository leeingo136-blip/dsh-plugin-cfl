/** Host half of the dh-mount plugin: no host-side composition. */

export const name = 'dh-mount'

/** @param ctx - Host context (reserved; the mount lives on the client half). */
export function apply(ctx) {
  void ctx
}
