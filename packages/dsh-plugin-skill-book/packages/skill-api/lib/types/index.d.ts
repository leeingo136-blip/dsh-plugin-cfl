/**
 * Skill Book host seam: skill file management across the official discovery
 * roots, exposed as the `skill-book` remote namespace. Registry entries
 * (runtime sessions, plugin-carried bundles) are read-only; file-backed roots
 * (global/user + per-workspace) are editable.
 *
 * Every method takes and returns plain JSON values, so the hand-written
 * Typert manifest (lib/typert.host.js) carries one reusable codec.
 */
import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { JsonValue } from '@deepseek-ai/dsh-util-values';
import zschema from '@deepseek-ai/schemastery';
export declare const name = "skill-api";
/** The schema class instance type, nameable without dragging cosmokit in. */
type SchemaNode = InstanceType<typeof zschema>;
/**
 * No runtime settings surface of our own (v1); the schema stays because the
 * loader always mounts one.
 */
export declare const Config: SchemaNode;
/**
 * Host service backing the generated `ctx.remote['skill-book']` namespace.
 * @typert service skillBookController
 */
export declare class SkillBookController extends TypertRemoteService {
    constructor(ctx: Context);
    /** One lazy optional-service lookup, untyped at the boundary. */
    private svc;
    private workspaces;
    private sources;
    /** Registry summaries (all providers), or empty when the stack is absent. */
    private registrySkills;
    private fullList;
    private entryFor;
    /** Every manageable source, for the source dropdowns. */
    skillSources(): Promise<JsonValue>;
    /** Every skill across all sources (file-backed + registry: runtime/plugin). */
    skillList(): Promise<JsonValue>;
    /** Body of one skill (file-backed read from disk; runtime/plugin via the registry). */
    skillRead(input: JsonValue): Promise<JsonValue>;
    /**
     * Create or update one skill; moving between editable sources rides the
     * same call (fromSourceId + fromName identify the previous location).
     */
    skillSave(input: JsonValue): Promise<JsonValue>;
    /** Delete one file-backed skill from an editable source. */
    skillDelete(input: JsonValue): Promise<JsonValue>;
}
export declare function apply(ctx: Context): void;
export {};
//# sourceMappingURL=index.d.ts.map