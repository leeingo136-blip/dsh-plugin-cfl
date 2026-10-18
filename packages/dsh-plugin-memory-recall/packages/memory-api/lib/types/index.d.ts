/**
 * Memory-recall host seam: the RAG connection card registry exposed as the
 * `memory-recall` remote namespace. The embedding dependency is lazy
 * (`ctx.get`) and read-only (`listModels`) on purpose: cards are pure
 * configuration — create/list/edit/delete keep working when the local
 * embedding plugin is disabled, and the model picker just shows an empty
 * catalog with a hint.
 *
 * Every method takes and returns plain JSON values, so the hand-written
 * Typert manifest (lib/typert.host.js) carries one reusable codec.
 */
import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { JsonValue } from '@deepseek-ai/dsh-util-values';
import zschema from '@deepseek-ai/schemastery';
export declare const name = "memory-api";
/** The schema class instance type, nameable without dragging cosmokit in. */
type SchemaNode = InstanceType<typeof zschema>;
/**
 * No runtime settings surface of our own (v1); the schema stays because the
 * loader always mounts one.
 */
export declare const Config: SchemaNode;
/**
 * Host service backing the generated `ctx.remote['memory-recall']` namespace.
 * @typert service memoryRecallController
 */
export declare class MemoryRecallController extends TypertRemoteService {
    private store;
    constructor(ctx: Context);
    /** One lazy optional-service lookup, untyped at the boundary. */
    private svc;
    /** Every saved connection card, plus editor defaults (local dir inside the plugin). */
    connList(): Promise<JsonValue>;
    /** Create one connection card (the name must be unique — tools use it as the handle). */
    connCreate(input: JsonValue): Promise<JsonValue>;
    /** Update one connection card in place (unique-name check skips itself). */
    connUpdate(input: JsonValue): Promise<JsonValue>;
    /** Delete one connection card. */
    connDelete(input: JsonValue): Promise<JsonValue>;
    /**
     * The embedding model catalog for the card editor's engine picker; empty
     * (not an error) when the embedding service is absent, so the editor
     * stays usable and the UI shows a hint instead.
     */
    embeddingModels(): Promise<JsonValue>;
}
export declare function apply(ctx: Context): void;
export {};
//# sourceMappingURL=index.d.ts.map