import type { LibraryKey } from './locales.ts';
export interface RagDatabase {
    id: string;
    name: string;
    description: string;
    model: string;
    dimension: number;
    chunks: number;
}
export interface RagHit {
    content: string;
    distance: number;
}
export interface RagFace {
    t(key: keyof LibraryKey): string;
    list(): Promise<{
        databases: RagDatabase[];
    }>;
    create(name: string, description: string): Promise<unknown>;
    remove(id: string): Promise<void>;
    ingest(id: string, texts: readonly string[]): Promise<{
        count: number;
    }>;
    query(id: string, text: string, k: number): Promise<{
        results: RagHit[];
    }>;
}
export declare function KnowledgeSection(props: {
    face?: RagFace;
}): ReactNode;
//# sourceMappingURL=KnowledgeSection.d.ts.map