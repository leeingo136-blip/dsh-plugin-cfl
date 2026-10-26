var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import zschema from '@deepseek-ai/schemastery';
import { ConnectionStore, localDatabaseDir, validate } from "./connections.js";
import { filterDocuments, searchByVector } from "./query.js";
/** Shared with the toolset package: it opens the same cards this controller manages. */
export { ConnectionStore, localDatabaseDir } from "./connections.js";
export { countDocuments, createDocument, filterDocuments, deleteDocuments, ensureLocalDatabase, getDocument, hashContent, hasCurrentSchema, listDocuments, openDb, searchByVector, updateDocument, vectorDim, } from "./query.js";
export const name = 'memory-api';
/**
 * No runtime settings surface of our own (v1); the schema stays because the
 * loader always mounts one.
 */
export const Config = zschema.object({});
/** Plain-object projection for the wire: drops undefined fields. */
const asJson = (value) => JSON.parse(JSON.stringify(value));
/** Map a registry fault onto the wire vocabulary. */
function fault(error) {
    switch (error.code) {
        case 'name-required':
            return new RemoteError('rag-knowledge/invalid-input', '名称不能为空', {});
        case 'name-duplicate':
            return new RemoteError('rag-knowledge/name-duplicate', `名称已存在：${error.name}`, { name: error.name });
        case 'kind-unknown':
            return new RemoteError('rag-knowledge/invalid-input', '未知的数据库类型', {});
        case 'address-required':
            return new RemoteError('rag-knowledge/invalid-input', '数据库地址不能为空', {});
        case 'embedding-required':
            return new RemoteError('rag-knowledge/invalid-input', '请选择 embedding 引擎', {});
    }
}
/**
 * Host service backing the generated `ctx.remote['rag-knowledge']` namespace.
 * @typert service memoryRecallController
 */
let MemoryRecallController = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _connList_decorators;
    let _connCreate_decorators;
    let _connUpdate_decorators;
    let _connDelete_decorators;
    let _embeddingModels_decorators;
    let _connDocs_decorators;
    let _connQuery_decorators;
    return class MemoryRecallController extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _connList_decorators = [Remote];
            _connCreate_decorators = [Remote];
            _connUpdate_decorators = [Remote];
            _connDelete_decorators = [Remote];
            _embeddingModels_decorators = [Remote];
            _connDocs_decorators = [Remote];
            _connQuery_decorators = [Remote];
            __esDecorate(this, null, _connList_decorators, { kind: "method", name: "connList", static: false, private: false, access: { has: obj => "connList" in obj, get: obj => obj.connList }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _connCreate_decorators, { kind: "method", name: "connCreate", static: false, private: false, access: { has: obj => "connCreate" in obj, get: obj => obj.connCreate }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _connUpdate_decorators, { kind: "method", name: "connUpdate", static: false, private: false, access: { has: obj => "connUpdate" in obj, get: obj => obj.connUpdate }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _connDelete_decorators, { kind: "method", name: "connDelete", static: false, private: false, access: { has: obj => "connDelete" in obj, get: obj => obj.connDelete }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _embeddingModels_decorators, { kind: "method", name: "embeddingModels", static: false, private: false, access: { has: obj => "embeddingModels" in obj, get: obj => obj.embeddingModels }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _connDocs_decorators, { kind: "method", name: "connDocs", static: false, private: false, access: { has: obj => "connDocs" in obj, get: obj => obj.connDocs }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _connQuery_decorators, { kind: "method", name: "connQuery", static: false, private: false, access: { has: obj => "connQuery" in obj, get: obj => obj.connQuery }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        store = (__runInitializers(this, _instanceExtraInitializers), new ConnectionStore());
        constructor(ctx) {
            super(ctx, 'memoryRecallController', { namespace: 'rag-knowledge' });
        }
        /** One lazy optional-service lookup, untyped at the boundary. */
        svc(name) {
            return this.ctx.get(name);
        }
        /** Every saved connection card, plus editor defaults (local dir inside the plugin). */
        async connList() {
            return asJson({ connections: this.store.list(), defaults: { localDir: localDatabaseDir() } });
        }
        /** Create one connection card (the name must be unique — tools use it as the handle). */
        async connCreate(input) {
            const body = input;
            const problem = validate(body, this.store.list());
            if (problem !== undefined)
                throw fault(problem);
            return asJson(this.store.create(body));
        }
        /** Update one connection card in place (unique-name check skips itself). */
        async connUpdate(input) {
            const { id, ...fields } = input;
            const current = this.store.get(id);
            if (current === undefined) {
                throw new RemoteError('rag-knowledge/not-found', '卡片不存在', { id });
            }
            const problem = validate({ ...current, ...fields }, this.store.list(), id);
            if (problem !== undefined)
                throw fault(problem);
            const updated = this.store.update(id, fields);
            if (updated === undefined) {
                throw new RemoteError('rag-knowledge/not-found', '卡片不存在', { id });
            }
            return asJson(updated);
        }
        /** Delete one connection card. */
        async connDelete(input) {
            const { id } = input;
            if (!this.store.remove(id)) {
                throw new RemoteError('rag-knowledge/not-found', '卡片不存在', { id });
            }
            return asJson({ message: '卡片已删除' });
        }
        /**
         * The embedding model catalog for the card editor's engine picker; empty
         * (not an error) when the embedding service is absent, so the editor
         * stays usable and the UI shows a hint instead.
         */
        async embeddingModels() {
            const embedding = this.svc('embedding');
            if (embedding === undefined)
                return asJson({ models: [], available: false });
            return asJson({ models: embedding.listModels(), available: true });
        }
        /**
         * KNN search over one card's database: embed the query with the card's
         * bound engine, then run a top-k nearest-neighbour query. Local cards
         * search the sqlite-vec file at `address`; service cards are not
         * implemented yet (the tools own that transport later).
         */
        /** Browse one card's documents by keyword; empty query returns nothing. */
        async connDocs(input) {
            const body = input;
            const id = typeof body.id === 'string' ? body.id : '';
            const query = typeof body.query === 'string' ? body.query : '';
            const card = this.store.get(id);
            if (card === undefined)
                throw new RemoteError('rag-knowledge/not-found', '卡片不存在', { id });
            if (card.kind === 'service')
                throw new RemoteError('rag-knowledge/not-implemented', '网络服务浏览尚未实现', { kind: 'service' });
            return asJson({ documents: filterDocuments(card.address, query, Math.min(Math.max(Number(body.limit) || 20, 1), 100)) });
        }
        async connQuery(input) {
            const body = input;
            const id = typeof body.id === 'string' ? body.id : '';
            const text = typeof body.query === 'string' ? body.query.trim() : '';
            if (text === '')
                throw new RemoteError('rag-knowledge/invalid-input', '检索内容不能为空', {});
            const card = this.store.get(id);
            if (card === undefined)
                throw new RemoteError('rag-knowledge/not-found', '卡片不存在', { id });
            if (card.kind === 'service') {
                throw new RemoteError('rag-knowledge/not-implemented', '网络服务检索尚未实现', { kind: 'service' });
            }
            const embedding = this.svc('embedding');
            if (embedding === undefined) {
                throw new RemoteError('rag-knowledge/embedding-unavailable', 'embedding 服务不可用：请先在账号列启用本地向量模型', {});
            }
            const vectors = await embedding.embed([text], card.embeddingModel === '' ? undefined : card.embeddingModel);
            const vector = vectors[0];
            if (vector === undefined || vector.length === 0) {
                throw new RemoteError('rag-knowledge/embedding-failed', '查询向量生成失败', {});
            }
            const k = Math.min(Math.max(Number(body.topK) || 5, 1), 20);
            // searchByVector heals the database on demand, so a card whose file was
            // deleted (or never written) yields an empty result rather than an error.
            const results = searchByVector(card.address, vector, k);
            return asJson({ results });
        }
    };
})();
export { MemoryRecallController };
export function apply(ctx) {
    ctx.plugin(MemoryRecallController);
}
//# sourceMappingURL=index.js.map