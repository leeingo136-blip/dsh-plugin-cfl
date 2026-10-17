/** Embedding function the store binds at construction (keeps this module pure). */
export type Embed = (texts: readonly string[]) => Promise<number[][]>;
interface DatabaseRecord {
    id: string;
    name: string;
    description: string;
    /** The embedding model id (embedding-local's model identifier). */
    model: string;
    dimension: number;
    createdAt: string;
}
export interface RagStoreOptions {
    embed: Embed;
}
/**
 * The knowledge store. Every operation opens the database lazily and closes
 * it after the statement batch — knowledge bases are queried far less often
 * than they are edited, and a short-lived connection sidesteps file-handle
 * lifetime questions entirely.
 */
export declare class RagStore {
    private readonly embed;
    constructor(options: RagStoreOptions);
    /** Every knowledge base with live row counts. */
    list(): Array<DatabaseRecord & {
        chunks: number;
    }>;
    /** Create one knowledge base; the dimension is learned from a probe embed. */
    create(name: string, description: string, model: string | undefined): Promise<DatabaseRecord>;
    /** Delete one knowledge base: registry row + database file. */
    delete(id: string): void;
    /** Embed and insert a batch of chunks; returns how many rows landed. */
    ingest(id: string, texts: readonly string[]): Promise<number>;
    /** KNN search: embed the query, return the nearest chunks with distances. */
    query(id: string, text: string, k: number): Promise<Array<{
        content: string;
        distance: number;
    }>>;
}
/** Dev sanity helper: the data root this store writes into. */
export declare function dataRoot(): string;
/** Directory listing of one knowledge base's stored chunk count, without a DB open. */
export declare function storedDatabaseIds(): string[];
export {};
//# sourceMappingURL=rag.d.ts.map