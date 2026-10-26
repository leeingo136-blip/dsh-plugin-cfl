export declare const PLAN_PATTERN: RegExp;
interface RegistryEntry {
    plan: string;
    address: string;
    embeddingModel: string;
    basePreset: string;
    injectGroups: number;
}
export interface ConnectionRecord extends RegistryEntry {
    id: string;
    name: string;
    persona: string;
    createdAt: string;
    updatedAt: string;
}
export interface ConnectionInput {
    plan?: unknown;
    name?: unknown;
    persona?: unknown;
    address?: unknown;
    embeddingModel?: unknown;
    basePreset?: unknown;
    injectGroups?: unknown;
}
export declare function normalizeName(value: unknown): string;
export declare function normalizePlan(value: unknown): string;
export type ConnectionFault = {
    code: 'plan-required';
} | {
    code: 'plan-invalid';
} | {
    code: 'plan-duplicate';
    name: string;
} | {
    code: 'name-required';
} | {
    code: 'address-required';
} | {
    code: 'embedding-required';
};
export declare function localDatabaseDir(): string;
export declare function dataRoot(): string;
export declare function defaultAddress(plan: string): string;
/** 首次运行：扫描 databases/ 建立 cards.json（方案字段从旧 meta 或文件名推断）。 */
export declare function migrateLegacyCards(): number;
export declare function validate(input: ConnectionInput, existing: readonly ConnectionRecord[], selfId?: string): ConnectionFault | undefined;
export declare class ConnectionStore {
    list(): ConnectionRecord[];
    get(id: string): ConnectionRecord | undefined;
    byPlan(plan: string): ConnectionRecord | undefined;
    create(input: ConnectionInput): ConnectionRecord;
    update(id: string, input: ConnectionInput): ConnectionRecord | undefined;
    remove(id: string): boolean;
}
export {};
//# sourceMappingURL=connections.d.ts.map