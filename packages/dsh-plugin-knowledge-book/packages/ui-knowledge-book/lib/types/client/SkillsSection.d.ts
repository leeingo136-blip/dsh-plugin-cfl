import type { KnowledgeKey } from './locales.ts';
export interface SkillCard {
    name: string;
    description: string;
    sourceId: string;
    sourceLabel: string;
    editable: boolean;
    form: 'dir' | 'flat' | 'runtime';
    path?: string;
}
export interface SkillSourceOption {
    id: string;
    label: string;
    kind: 'global' | 'workspace' | 'bundled' | 'runtime';
    editable: boolean;
    dir?: string;
}
export interface SkillsFace {
    t(key: keyof KnowledgeKey): string;
    listSkills(): Promise<{
        skills: SkillCard[];
    }>;
    listSources(): Promise<{
        sources: SkillSourceOption[];
    }>;
    readSkill(name: string, sourceId: string): Promise<{
        body: string;
    }>;
    saveSkill(request: {
        fromName?: string;
        fromSourceId?: string;
        targetSourceId: string;
        name: string;
        body: string;
    }): Promise<{
        name: string;
        renamed: boolean;
        created: boolean;
    }>;
    deleteSkill(name: string, sourceId: string): Promise<void>;
}
export declare function SkillsSection(props: {
    face?: SkillsFace;
}): ReactNode;
//# sourceMappingURL=SkillsSection.d.ts.map