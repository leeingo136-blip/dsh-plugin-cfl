import type { MemoryKey } from './locales.ts';
/** One saved RAG connection card (wire shape of the memory-echo namespace). */
export interface ConnectionCard {
    id: string;
    plan: string;
    persona: string;
    injectGroups: number;
    name: string;
    address: string;
    embeddingModel: string;
    createdAt: string;
    updatedAt: string;
}
export interface EmbeddingModelInfo {
    id: string;
    file: string;
    loaded: boolean;
}
export interface MemoryFace {
    t(key: keyof MemoryKey): string;
    list(): Promise<{
        connections: ConnectionCard[];
        defaults?: {
            localDir?: string;
        };
    }>;
    create(input: {
        plan: string;
        name: string;
        persona: string;
        address: string;
        embeddingModel: string;
        basePreset: string;
        injectGroups: number;
    }): Promise<ConnectionCard>;
    update(input: {
        id: string;
        name?: string;
        plan?: string;
        persona?: string;
        address?: string;
        embeddingModel?: string;
        basePreset?: string;
        injectGroups?: number;
    }): Promise<ConnectionCard>;
    remove(id: string): Promise<void>;
    embeddingModels(): Promise<{
        models: EmbeddingModelInfo[];
        available: boolean;
    }>;
    query(input: {
        id: string;
        query: string;
        topK?: number;
    }): Promise<{
        results: Array<QueryHitWire>;
    }>;
    generatePresets(): Promise<{
        path: string;
        generated: number;
        skipped: number;
        conflicts: string[];
    }>;
    presetOptions(): Promise<{
        presets: Array<{
            id: string;
            name: string;
        }>;
    }>;
    createCharacterPreset(input: {
        plan: string;
        basePresetId: string;
    }): Promise<{
        plan: string;
        name: string;
    }>;
    openDatabaseLocation(input: {
        id: string;
    }): Promise<{
        path: string;
    }>;
    databaseFiles(): Promise<{
        files: Array<{
            address: string;
            name: string;
            plan: string;
            title: string;
        }>;
    }>;
    loadDatabase(input: {
        address: string;
    }): Promise<{
        name: string;
        persona: string;
    }>;
    setSelfState(input: {
        id: string;
        key: string;
        value: number;
    }): Promise<{
        key: string;
        value: number;
    }>;
    listEntities(input: {
        id: string;
        kind: 'person' | 'object';
        query?: string;
    }): Promise<{
        rows: Array<Record<string, unknown>>;
    }>;
    saveEntity(input: {
        id: string;
        kind: 'person' | 'object';
        entity: Record<string, unknown>;
    }): Promise<{
        id: string;
    }>;
    deleteEntity(input: {
        id: string;
        kind: 'person' | 'object';
        entityId: string;
    }): Promise<{
        ok: boolean;
    }>;
    listMemories(input: {
        id: string;
        query?: string;
        limit?: number;
    }): Promise<{
        rows: Array<Record<string, unknown>>;
    }>;
    addMemory(input: {
        id: string;
        kind: string;
        content: string;
        salience: number;
    }): Promise<{
        id: string;
    }>;
    deleteMemory(input: {
        id: string;
        memoryId: string;
    }): Promise<{
        ok: boolean;
    }>;
    setEntityState(input: {
        id: string;
        entityId: string;
        key: string;
        value: number;
    }): Promise<{
        key: string;
        value: number;
    }>;
    dreamList(input: {
        id: string;
        limit?: number;
    }): Promise<{
        dreams: Array<{
            rowid: number;
            content: string;
            addedAt: string;
            source: string;
        }>;
    }>;
    cardState(input: {
        id: string;
    }): Promise<{
        sleep: Array<{
            session: string;
            wakeAt: string | null;
        }>;
        selfTags: string[];
        personTags: Array<{
            id: string;
            name: string;
            tags: string[];
        }>;
        selfState: Array<{
            key: string;
            value: number;
        }>;
        persons: Array<{
            id: string;
            name: string;
            aliases: string;
            description: string;
            attitudes: Array<{
                key: string;
                value: number;
            }>;
        }>;
        objects: Array<{
            id: string;
            name: string;
            category: string;
            description: string;
            attitudes: Array<{
                key: string;
                value: number;
            }>;
        }>;
    }>;
}
/** One KNN hit (wire shape). */
export interface QueryHitWire {
    content: string;
    distance: number;
}
export declare function MemorySection(props: {
    face?: MemoryFace;
}): ReactNode;
//# sourceMappingURL=MemorySection.d.ts.map