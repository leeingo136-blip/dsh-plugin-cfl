export interface QueryHit {
    content: string;
    distance: number;
}
/** Human-readable reasons a local query can fail before/outside SQL. */
export type QueryFault = {
    code: 'db-missing';
    address: string;
} | {
    code: 'db-empty';
    address: string;
};
/**
 * KNN search over one local database. The embedding column dimension is
 * whatever the database was created with — a mismatch against the query
 * vector surfaces as a sqlite-vec error the caller maps onto a message.
 */
export declare function queryLocal(address: string, vector: readonly number[], k: number): QueryFault | QueryHit[];
//# sourceMappingURL=query.d.ts.map