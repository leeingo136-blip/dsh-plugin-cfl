/**
 * Knowledge Book host seam: one `knowledge` remote namespace over two
 * capabilities — skill file management across the official discovery roots,
 * and a local sqlite-vec knowledge store embedded by the `embedding` service.
 *
 * Every method takes and returns plain JSON values, so the hand-written
 * Typert manifest (lib/typert.host.js) carries one reusable codec. The
 * embedding dependency is lazy (`ctx.get`) on purpose: the plugin must still
 * activate — and skill management must keep working — when the local
 * embedding plugin is disabled.
 */
import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { JsonValue } from '@deepseek-ai/dsh-util-values';
import zschema from '@deepseek-ai/schemastery';
export declare const name = "knowledge-api";
/** The schema class instance type, nameable without dragging cosmokit in. */
type SchemaNode = InstanceType<typeof zschema>;
/**
 * No runtime settings surface of our own (v1); the schema stays because the
 * loader always mounts one.
 */
export declare const Config: SchemaNode;
/**
 * Host service backing the generated `ctx.remote.knowledge` namespace.
 * @typert service knowledgeController
 */
export declare class KnowledgeController extends TypertRemoteService {
    private rag;
    constructor(ctx: Context);
    /** One lazy optional-service lookup, untyped at the boundary. */
    private svc;
    private embedFor;
    private store;
    private workspaces;
    private sources;
    private entryFor;
    /** Every manageable source, for the source dropdowns. */
    skillSources(): Promise<JsonValue>;
    /** Every skill across all sources (file-backed + runtime). */
    skillList(): Promise<JsonValue>;
    /** Body of one skill (file-backed read from disk; runtime via the registry). */
    skillRead(input: JsonValue): Promise<JsonValue>;
    /**
     * Create or update one skill; moving between editable sources rides the
     * same call (fromSourceId + fromName identify the previous location).
     */
    skillSave(input: JsonValue): Promise<JsonValue>;
    /** Delete one file-backed skill from an editable source. */
    skillDelete(input: JsonValue): Promise<JsonValue>;
    /** Every knowledge base with chunk counts. */
    ragList(): Promise<JsonValue>;
    /** Create one knowledge base (dimension learned from the bound model). */
    ragCreate(input: JsonValue): Promise<JsonValue>;
    /** Delete one knowledge base and its file. */
    ragDelete(input: JsonValue): Promise<JsonValue>;
    /** Embed and store a batch of chunks. */
    ragIngest(input: JsonValue): Promise<JsonValue>;
    /** KNN query against one knowledge base. */
    ragQuery(input: JsonValue): Promise<JsonValue>;
}
export declare function apply(ctx: Context): void;
export {};
//# sourceMappingURL=index.d.ts.map