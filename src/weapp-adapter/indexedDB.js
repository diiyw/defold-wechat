
// ===== 工具函数 =====
function nextTick(fn) {
    setTimeout(fn, 0);
}

function IDBRequest() {
    const req = {
        readyState: 'pending',
        result: undefined,
        error: null,
        source: null,
        transaction: null,
        onsuccess: null,
        onerror: null
    };
    return req;
}

// ===== 模拟数据库 =====
class IndexedDB {
    constructor() {
        const wx = window.wx;

        const fs = wx.getFileSystemManager();
        const rootDir = `${wx.env.USER_DATA_PATH}/indexedDB/`;

        try {
            fs.mkdirSync(rootDir);
        } catch (e) { }

        this.databases = new Map(); // name -> { version, stores }
    }

    open(name, version = 1) {
        const request = IDBRequest();
        const self = this;

        nextTick(() => {
            const key = `${name}_${version}`;
            const filePath = `${rootDir}${key}.json`;

            let dbData;
            try {
                const data = fs.readFileSync(filePath, 'utf8');
                dbData = JSON.parse(data);
            } catch (e) {
                dbData = { meta: { version: 0 }, stores: {} };
            }

            const oldVersion = dbData.meta.version;
            const upgradeNeeded = version > oldVersion;
            const db = new IDBDatabase(name, version, dbData, filePath);

            if (upgradeNeeded) {
                const upgradeTx = new IDBTransaction(db, 'versionchange');
                request.transaction = upgradeTx;

                try {
                    if (request.onupgradeneeded) {
                        const event = {
                            type: 'upgradeneeded',
                            target: request,
                            oldVersion,
                            newVersion: version
                        };
                        request.onupgradeneeded(event);
                    }

                    db.meta.version = version;
                    db.save()
                        .then(() => {
                            request.result = db;
                            request.readyState = 'done';
                            if (request.onsuccess) request.onsuccess({ target: request });
                        })
                        .catch(err => {
                            request.error = err;
                            if (request.onerror) request.onerror({ target: request, error: err });
                        });
                } catch (err) {
                    request.error = err;
                    if (request.onerror) request.onerror({ target: request, error: err });
                }
            } else {
                request.result = db;
                request.readyState = 'done';
                if (request.onsuccess) request.onsuccess({ target: request });
            }
        });

        return request;
    }

    deleteDatabase(name) {
        const request = IDBRequest();
        nextTick(() => {
            try {
                // 删除所有版本
                for (let v = 1; v <= 10; v++) {
                    const path = `${rootDir}${name}_v${v}.json`;
                    try {
                        fs.unlinkSync(path);
                    } catch (e) { }
                }
                request.result = undefined;
                if (request.onsuccess) request.onsuccess({ target: request });
            } catch (err) {
                request.error = err;
                if (request.onerror) request.onerror({ target: request, error: err });
            }
        });
        return request;
    }
}

class IDBDatabase {
    constructor(name, version, data, filePath) {
        this.name = name;
        this.version = version;
        this.objectStoreNames = new IDBObjectStoreNames();
        this._data = data;
        this._filePath = filePath;
        this._stores = {};

        // 初始化 objectStoreNames
        this.objectStoreNames._add(...Object.keys(data.stores));

        // 创建 store 实例
        for (const name in data.stores) {
            this._stores[name] = new IDBObjectStore(this, name, data.stores[name]);
        }
    }

    createObjectStore(name, options = {}) {
        if (this._stores[name]) throw new Error(`Store '${name}' exists`);
        const storeData = {
            keyPath: options.keyPath || 'id',
            autoIncrement: !!options.autoIncrement,
            data: {},
            indexes: {}
        };
        this._data.stores[name] = storeData;
        this._stores[name] = new IDBObjectStore(this, name, storeData);
        this.objectStoreNames._add(name);
        return this._stores[name];
    }

    deleteObjectStore(name) {
        if (!this._stores[name]) throw new Error(`Store '${name}' not exists`);
        delete this._stores[name];
        delete this._data.stores[name];
        this.objectStoreNames._delete(name);
    }

    transaction(storeNames, mode = 'readonly') {
        return new IDBTransaction(this, mode, storeNames);
    }

    save() {
        return new Promise((resolve, reject) => {
            try {
                fs.writeFileSync(this._filePath, JSON.stringify(this._data), 'utf8');
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }
}

class IDBObjectStoreNames {
    constructor() {
        this._names = [];
    }
    contains(name) {
        return this._names.includes(name);
    }
    _add(...names) {
        this._names.push(...names);
    }
    _delete(name) {
        const idx = this._names.indexOf(name);
        if (idx !== -1) this._names.splice(idx, 1);
    }
    [Symbol.iterator]() {
        return this._names[Symbol.iterator]();
    }
}

class IDBTransaction {
    constructor(db, mode, storeNames = []) {
        if (!Array.isArray(storeNames)) storeNames = [storeNames];
        this.db = db;
        this.mode = mode;
        this.objectStoreNames = storeNames;
        this._active = true;
        this.onerror = null;
        this.oncomplete = null;
        this.onabort = null;
    }

    objectStore(name) {
        if (!this.db._stores[name]) throw new Error(`Store not in transaction: ${name}`);
        return this.db._stores[name];
    }

    commit() {
        this.db.save().then(() => {
            if (this.oncomplete) this.oncomplete({ target: this });
        });
    }

    abort() {
        // 不支持回滚
        if (this.onabort) this.onabort({ target: this });
    }
}

class IDBObjectStore {
    constructor(db, name, data) {
        this._db = db;
        this.name = name;
        this.keyPath = data.keyPath;
        this.autoIncrement = data.autoIncrement;
        this.data = data.data;
        this._indexes = data.indexes;
        this._nextKey = 1;

        if (this.autoIncrement) {
            const keys = Object.keys(this.data).map(Number).filter(k => !isNaN(k));
            this._nextKey = keys.length ? Math.max(...keys) + 1 : 1;
        }
    }

    _getKey(value) {
        return value[this.keyPath];
    }

    _updateIndex(key, value, isDelete = false) {
        for (const idxName in this._indexes) {
            const idxKey = value[idxName];
            if (idxKey === undefined) continue;
            if (!this._indexes[idxName][idxKey]) this._indexes[idxName][idxKey] = [];
            const arr = this._indexes[idxName][idxKey];
            const i = arr.indexOf(key);
            if (isDelete && i !== -1) arr.splice(i, 1);
            else if (!isDelete && i === -1) arr.push(key);
        }
    }

    createIndex(name, keyPath, options = {}) {
        if (!this._indexes[name]) {
            this._indexes[name] = {};
            // 建立索引
            for (const key in this.data) {
                const item = this.data[key];
                const idxKey = item[keyPath];
                if (idxKey !== undefined) {
                    if (!this._indexes[name][idxKey]) this._indexes[name][idxKey] = [];
                    this._indexes[name][idxKey].push(key);
                }
            }
        }
    }

    index(name) {
        if (!this._indexes[name]) throw new Error(`Index ${name} not exists`);
        return new IDBIndex(this, name);
    }

    put(value) {
        const req = IDBRequest();
        nextTick(() => {
            try {
                let key = this._getKey(value);
                const autoInc = this.autoIncrement && (key == null);

                if (autoInc) {
                    key = this._nextKey++;
                    value[this.keyPath] = key;
                } else if (key == null) {
                    throw new Error('No key');
                }

                if (this.data[key]) {
                    this._updateIndex(key, this.data[key], true);
                }
                this.data[key] = value;
                this._updateIndex(key, value, false);

                req.result = key;
                req.onsuccess?.({ target: req });
            } catch (e) {
                req.error = e;
                req.onerror?.({ target: req, error: e });
            }
        });
        return req;
    }

    add(value) {
        const req = IDBRequest();
        nextTick(() => {
            const key = this._getKey(value);
            if (key !== undefined && this.data[key] !== undefined) {
                req.error = new Error('Key exists');
                req.onerror?.(req.error);
                return;
            }
            this.put(value).onsuccess = () => {
                req.result = req.result;
                req.onsuccess?.({ target: req });
            };
        });
        return req;
    }

    get(key) {
        const req = IDBRequest();
        nextTick(() => {
            req.result = this.data[key] || undefined;
            req.onsuccess?.({ target: req });
        });
        return req;
    }

    getAll(query, count) {
        const req = IDBRequest();
        nextTick(() => {
            let result = Object.values(this.data);
            if (query !== undefined) {
                if (typeof query === 'object' && query.index) {
                    const keys = this._indexes[query.index]?.[query.value] || [];
                    result = keys.map(k => this.data[k]).filter(Boolean);
                } else {
                    result = result.filter(v => this._getKey(v) == query);
                }
            }
            if (count) result = result.slice(0, count);
            req.result = result;
            req.onsuccess?.({ target: req });
        });
        return req;
    }

    delete(key) {
        const req = IDBRequest();
        nextTick(() => {
            const value = this.data[key];
            if (value) {
                this._updateIndex(key, value, true);
                delete this.data[key];
            }
            req.result = undefined;
            req.onsuccess?.({ target: req });
        });
        return req;
    }

    clear() {
        const req = IDBRequest();
        nextTick(() => {
            this.data = {};
            this._indexes = {};
            req.result = undefined;
            req.onsuccess?.({ target: req });
        });
        return req;
    }

    count() {
        const req = IDBRequest();
        nextTick(() => {
            req.result = Object.keys(this.data).length;
            req.onsuccess?.({ target: req });
        });
        return req;
    }

    openCursor() {
        const req = IDBRequest();
        nextTick(() => {
            const keys = Object.keys(this.data).sort();
            let i = 0;
            const cursor = {
                continue: () => {
                    if (i >= keys.length) return null;
                    const key = keys[i++];
                    const value = this.data[key];
                    Object.assign(cursor, {
                        key,
                        primaryKey: key,
                        value,
                        continue: cursor.continue
                    });
                    return cursor;
                }
            };
            req.result = cursor;
            req.onsuccess?.({ target: req });
        });
        return req;
    }
}

class IDBIndex {
    constructor(store, name) {
        this.store = store;
        this.name = name;
    }
    get(key) {
        const req = IDBRequest();
        nextTick(() => {
            const keys = this.store._indexes[this.name]?.[key];
            if (keys && keys.length > 0) {
                req.result = this.store.data[keys[0]] || undefined;
            } else {
                req.result = undefined;
            }
            req.onsuccess?.({ target: req });
        });
        return req;
    }
    getAll(key, count) {
        const req = IDBRequest();
        nextTick(() => {
            const keys = this.store._indexes[this.name]?.[key] || [];
            req.result = keys
                .slice(0, count)
                .map(k => this.store.data[k])
                .filter(Boolean);
            req.onsuccess?.({ target: req });
        });
        return req;
    }
}
var IDBCursor = null;
// ===== 挂载到全局 =====
export const indexedDB = new IndexedDB();
export { IDBRequest, IDBTransaction, IDBIndex, IDBCursor, IDBDatabase };

// 可选：支持 indexedDB.open().then(...)
if (!indexedDB.open.toString().includes('native')) {
    indexedDB.open = function (name, version) {
        const req = IndexedDB.prototype.open.call(this, name, version);
        req.then = (onSuccess, onError) => {
            return new Promise((resolve, reject) => {
                req.onsuccess = (e) => {
                    const result = e.target.result;
                    onSuccess?.(result);
                    resolve(result);
                };
                req.onerror = (e) => {
                    const err = e.target.error;
                    onError?.(err);
                    reject(err);
                };
            });
        };
        return req;
    };
}