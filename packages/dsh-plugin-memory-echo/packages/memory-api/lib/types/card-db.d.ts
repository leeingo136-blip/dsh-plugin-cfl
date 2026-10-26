/** 角色卡 SQLite 存储：meta / self（己）/ memories（流水记忆）。 */
import { DatabaseSync } from 'node:sqlite';
export interface CardData {
    name: string;
    persona: string;
}
export declare function openCardDb(address: string): DatabaseSync;
export declare function ensureCardSchema(db: DatabaseSync, dim?: number): void;
export declare function writeMeta(db: DatabaseSync, key: string, value: string): void;
export declare function readMeta(db: DatabaseSync, key: string): string;
/** 从 DB 读取完整卡片数据。 */
export declare function readCard(address: string): CardData | undefined;
/** 把卡片字段写回 DB（含 seed 记忆重建）。 */
export declare function writeCard(address: string, data: CardData, dim?: number): void;
/** 新建一个空数据库文件并初始化 schema。 */
export declare function createCardDb(address: string): void;
//# sourceMappingURL=card-db.d.ts.map