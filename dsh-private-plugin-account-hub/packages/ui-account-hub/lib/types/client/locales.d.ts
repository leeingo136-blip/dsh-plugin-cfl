/** Copy dictionaries for the settings account column. */
/** English strings (the key-set source of truth for this pair). */
export declare const en: {
    readonly nav: "Accounts";
    readonly empty: "Install an account plugin to use accounts.";
    readonly loadFailed: "Loading the account registry failed";
    readonly save: "Save";
    readonly saving: "Saving…";
    readonly saved: "Saved";
    readonly saveFailed: "Saving failed";
    readonly actionFailed: "Action failed";
    readonly optionsFailed: "Loading options failed";
    readonly busy: "Working…";
    readonly selectPlaceholder: "Select…";
    readonly signedIn: "Signed in";
    readonly accountInfo: "Account info";
    readonly loading: "Loading…";
    readonly cancel: "Cancel";
};
export type AccountHubKey = keyof typeof en;
/** Chinese strings (same keys as {@link en}). */
export declare const zh: {
    [Key in AccountHubKey]: string;
};
//# sourceMappingURL=locales.d.ts.map