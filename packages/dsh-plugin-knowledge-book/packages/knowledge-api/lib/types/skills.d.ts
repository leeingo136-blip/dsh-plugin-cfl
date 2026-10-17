/** One manageable skill entry as serialized over the wire. */
export interface SkillEntry {
    name: string;
    description: string;
    sourceId: string;
    sourceLabel: string;
    editable: boolean;
    /** Directory form (`<name>/SKILL.md`) vs flat form (`<name>.md`). */
    form: 'dir' | 'flat' | 'runtime';
    /** Absolute skill file path for file-backed entries. */
    path?: string;
    body?: string;
}
/** One discovery root exposed to the UI as a source. */
export interface SkillSource {
    id: string;
    label: string;
    kind: 'global' | 'workspace' | 'bundled' | 'runtime';
    editable: boolean;
    dir?: string;
}
interface WorkspaceLike {
    list(): Array<{
        record: {
            path: string;
            title?: string;
        };
    }>;
}
export type { WorkspaceLike };
/** Kebab-case any user-typed name; empty (e.g. pure CJK) yields a dated stem. */
export declare function sanitizeSkillName(raw: string): string;
/**
 * Resolve a name collision inside one root the way the registry's own
 * grammar allows: keep kebab-case and append `-2`, `-3`, … until free.
 */
export declare function resolveConflict(root: string, name: string, form: 'dir' | 'flat'): string;
/** The workspace registry carries every registered workspace root. */
export declare function skillSources(workspaces: WorkspaceLike): SkillSource[];
/** Full listing: file-backed entries from the roots + runtime registrations. */
export declare function listSkills(sources: SkillSource[], runtimeSkills: Array<{
    name: string;
    description: string;
    source?: string;
}>): SkillEntry[];
/** Body of one skill: file-backed entries read from disk, runtime via the registry. */
export declare function readSkillBody(entry: SkillEntry, registryRead?: (name: string) => string | undefined): string;
export interface SaveRequest {
    /** Empty when creating a new skill. */
    fromName?: string;
    fromSourceId?: string;
    fromForm?: 'dir' | 'flat';
    targetSourceId: string;
    name: string;
    body: string;
}
export interface SaveResult {
    name: string;
    sourceId: string;
    sourceLabel: string;
    renamed: boolean;
    moved: boolean;
    created: boolean;
}
/**
 * Create or update one skill, optionally moving it between sources. A name
 * collision at the target is resolved by the kebab-case suffix rule; the
 * caller learns the final name from the result.
 */
export declare function saveSkill(sources: SkillSource[], request: SaveRequest): SaveResult;
/** Remove one file-backed skill (directory form). Runtime and bundled reject. */
export declare function deleteSkill(sources: SkillSource[], sourceId: string, name: string): void;
//# sourceMappingURL=skills.d.ts.map