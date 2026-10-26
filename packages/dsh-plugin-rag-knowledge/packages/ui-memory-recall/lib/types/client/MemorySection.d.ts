import type { MemoryKey } from './locales.ts';
/** One saved RAG connection card (wire shape of the rag-knowledge namespace). */
export interface ConnectionCard {
    id: string;
    name: string;
    description: string;
    kind: 'local' | 'service';
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
        name: string;
        description: string;
        kind: string;
        address: string;
        embeddingModel: string;
    }): Promise<ConnectionCard>;
    update(input: {
        id: string;
        name?: string;
        description?: string;
        kind?: string;
        address?: string;
        embeddingModel?: string;
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
    docs(input: {
        id: string;
        query: string;
        limit?: number;
    }): Promise<{
        documents: Array<DocHitWire>;
    }>;
}
/** One KNN hit (wire shape). */
export interface DocHitWire {
    id: string;
    title: string;
    snippet: string;
    updatedAt: string;
    status: string;
}
export interface QueryHitWire {
    content: string;
    distance: number;
}
export declare function MemorySection(props: {
    face?: MemoryFace;
}): ReactNode;
//# sourceMappingURL=MemorySection.d.ts.map