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
import { RagStore } from "./rag.js";
export const name = 'library-api';
/**
 * No runtime settings surface of our own (v1); the schema stays because the
 * loader always mounts one.
 */
export const Config = zschema.object({});
/** Plain-object projection for the wire: drops undefined fields. */
const asJson = (value) => JSON.parse(JSON.stringify(value));
/**
 * Host service backing the generated `ctx.remote.library` namespace.
 * @typert service libraryController
 */
let LibraryController = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _ragList_decorators;
    let _ragCreate_decorators;
    let _ragDelete_decorators;
    let _ragIngest_decorators;
    let _ragQuery_decorators;
    return class LibraryController extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _ragList_decorators = [Remote];
            _ragCreate_decorators = [Remote];
            _ragDelete_decorators = [Remote];
            _ragIngest_decorators = [Remote];
            _ragQuery_decorators = [Remote];
            __esDecorate(this, null, _ragList_decorators, { kind: "method", name: "ragList", static: false, private: false, access: { has: obj => "ragList" in obj, get: obj => obj.ragList }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _ragCreate_decorators, { kind: "method", name: "ragCreate", static: false, private: false, access: { has: obj => "ragCreate" in obj, get: obj => obj.ragCreate }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _ragDelete_decorators, { kind: "method", name: "ragDelete", static: false, private: false, access: { has: obj => "ragDelete" in obj, get: obj => obj.ragDelete }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _ragIngest_decorators, { kind: "method", name: "ragIngest", static: false, private: false, access: { has: obj => "ragIngest" in obj, get: obj => obj.ragIngest }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _ragQuery_decorators, { kind: "method", name: "ragQuery", static: false, private: false, access: { has: obj => "ragQuery" in obj, get: obj => obj.ragQuery }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        rag = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx) {
            super(ctx, 'libraryController', { namespace: 'library' });
        }
        /** One lazy optional-service lookup, untyped at the boundary. */
        svc(name) {
            return this.ctx.get(name);
        }
        embedFor() {
            const embedding = this.svc('embedding');
            if (embedding === undefined) {
                throw new RemoteError('library/embedding-unavailable', '嵌入服务不可用：请先在账号列启用本地向量模型', {});
            }
            return inputs => embedding.embed(inputs);
        }
        store() {
            this.rag ??= new RagStore({ embed: inputs => this.embedFor()(inputs) });
            return this.rag;
        }
        /** Every knowledge base with chunk counts. */
        async ragList() {
            return asJson({ databases: this.store().list() });
        }
        /** Create one knowledge base (dimension learned from the bound model). */
        async ragCreate(input) {
            const { name, description, model } = input;
            if (typeof name !== 'string' || name.trim() === '') {
                throw new RemoteError('library/rag-invalid', '知识库名称不能为空', {});
            }
            return asJson(await this.store().create(name.trim(), description ?? '', model));
        }
        /** Delete one knowledge base and its file. */
        async ragDelete(input) {
            const { id } = input;
            this.store().delete(id);
            return asJson({ message: '知识库已删除' });
        }
        /** Embed and store a batch of chunks. */
        async ragIngest(input) {
            const { id, texts } = input;
            if (!Array.isArray(texts) || texts.length === 0) {
                throw new RemoteError('library/rag-invalid', '没有可入库的文本', {});
            }
            const count = await this.store().ingest(id, texts);
            return asJson({ message: `已入库 ${count} 条`, count });
        }
        /** KNN query against one knowledge base. */
        async ragQuery(input) {
            const { id, text, k } = input;
            if (typeof text !== 'string' || text.trim() === '') {
                throw new RemoteError('library/rag-invalid', '查询文本不能为空', {});
            }
            const results = await this.store().query(id, text.trim(), Math.min(Math.max(k ?? 5, 1), 50));
            return asJson({ results });
        }
    };
})();
export { LibraryController };
export function apply(ctx) {
    ctx.plugin(LibraryController);
}
//# sourceMappingURL=index.js.map