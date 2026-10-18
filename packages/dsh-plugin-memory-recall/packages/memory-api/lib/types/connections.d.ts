/** Which linking strategy a connection uses. */
export type ConnectionKind = 'local' | 'service';
export declare const CONNECTION_KINDS: readonly ConnectionKind[];
export interface ConnectionRecord {
    id: string;
    /** Unique, tool-facing handle (the value tools pass as the database parameter). */
    name: string;
    description: string;
    kind: ConnectionKind;
    /** Local: database file path. Service: endpoint URL. */
    address: string;
    /** The embedding engine this connection binds (embedding model id). */
    embeddingModel: string;
    createdAt: string;
    updatedAt: string;
}
/** Field-level validation shared by create and update. */
export interface ConnectionInput {
    name?: unknown;
    description?: unknown;
    kind?: unknown;
    address?: unknown;
    embeddingModel?: unknown;
}
export declare function normalizeName(value: unknown): string;
/** The error reasons a create/update can fail with, for the wire face. */
export type ConnectionFault = {
    code: 'name-required';
} | {
    code: 'name-duplicate';
    name: string;
} | {
    code: 'kind-unknown';
} | {
    code: 'address-required';
} | {
    code: 'embedding-required';
};
/**
 * Validate one card input against the registry. Returns the fault on
 * failure — the controller maps it onto the RemoteError vocabulary.
 */
export declare function validate(input: ConnectionInput, existing: readonly ConnectionRecord[], selfId?: string): ConnectionFault | undefined;
/**
 * The connection card registry. Pure JSON CRUD — no database is opened
 * here; cards describe how to reach one, and the tools open it.
 */
export declare class ConnectionStore {
    /** Every saved card, creation order preserved. */
    list(): ConnectionRecord[];
    /** One card by id. */
    get(id: string): ConnectionRecord | undefined;
    /** Create one card from validated input. */
    create(input: ConnectionInput): ConnectionRecord;
    /** Update one card in place; only provided fields change. */
    update(id: string, input: ConnectionInput): ConnectionRecord | undefined;
    /** Delete one card. Returns false when the id is unknown. */
    remove(id: string): boolean;
}
/** Dev sanity helper: the data root this store writes into. */
export declare function dataRoot(): string;
/**
 * Where tool-managed local databases live by default — inside the package's
 * own data root, keeping the in-repo self-contained posture. The editor
 * prefills local addresses here so cards stay inside the plugin by default.
 */
export declare function localDatabaseDir(): string;
//# sourceMappingURL=connections.d.ts.map