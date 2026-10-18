/**
 * Library host seam: a local sqlite-vec knowledge store exposed as the
 * `library` remote namespace, embedded by the optional `embedding` service.
 *
 * Every method takes and returns plain JSON values, so the hand-written
 * Typert manifest (lib/typert.host.js) carries one reusable codec. The
 * embedding dependency is lazy (`ctx.get`) on purpose: the plugin must still
 * activate — listing and deleting bases keep working — when the local
 * embedding plugin is disabled.
 */
import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { JsonValue } from '@deepseek-ai/dsh-util-values';
import zschema from '@deepseek-ai/schemastery';
export declare const name = "library-api";
/** The schema class instance type, nameable without dragging cosmokit in. */
type SchemaNode = InstanceType<typeof zschema>;
/**
 * No runtime settings surface of our own (v1); the schema stays because the
 * loader always mounts one.
 */
export declare const Config: SchemaNode;
/**
 * Host service backing the generated `ctx.remote.library` namespace.
 * @typert service libraryController
 */
export declare class LibraryController extends TypertRemoteService {
    private rag;
    constructor(ctx: Context);
    /** One lazy optional-service lookup, untyped at the boundary. */
    private svc;
    private embedFor;
    private store;
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