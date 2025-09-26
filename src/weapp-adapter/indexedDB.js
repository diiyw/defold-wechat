// 基于微信小程序文件系统的 IndexedDB 适配器
import EventTarget from './EventTarget'

const wxFs = wx.getFileSystemManager();
const DB_ROOT_PATH = `${wx.env.USER_DATA_PATH}/indexedDB`;

// 确保根目录存在
wxFs.access({
    filePath: DB_ROOT_PATH,
    fail: () => {
        wxFs.mkdirSync(DB_ROOT_PATH, true);
    }
})

// IDBRequest 模拟
class IDBRequest extends EventTarget {
    constructor() {
        super();
        this.result = null;
        this.error = null;
        this.readyState = 'pending';
        this.source = null;
        this.transaction = null;
        this.onsuccess = null;
        this.onerror = null;
        this.onupgradeneeded = null;
    }

    _success(result) {
        this.result = result;
        this.readyState = 'done';
        if (this.onsuccess) {
            this.onsuccess({ target: this, type: 'success' });
        }
        this.dispatchEvent({ type: 'success', target: this });
    }

    _error(error) {
        this.error = error;
        this.readyState = 'done';
        if (this.onerror) {
            this.onerror({ target: this, type: 'error' });
        }
        this.dispatchEvent({ type: 'error', target: this });
    }
}

Set.prototype.contains = Set.prototype.has;

// IDBDatabase 模拟
class IDBDatabase extends EventTarget {
    constructor(name, version) {
        super();
        this.name = name;
        this.version = version;
        this.objectStoreNames = new Set();
        this.onabort = null;
        this.onclose = null;
        this.onerror = null;
        this.onversionchange = null;
        this._closed = false;
        this._stores = new Map();

        // 读取目录下的子目录来填充 objectStoreNames和_stores
        this._loadExistingObjectStores();
    }

    _loadExistingObjectStores() {
        const dbPath = `${DB_ROOT_PATH}/${this.name}`;
        wxFs.access({
            filePath: dbPath,
            fail: () => {
                wxFs.mkdirSync(dbPath, true);
            },
            complete: () => {
                try {
                    // 读取数据库目录下的子目录
                    const items = wxFs.readdirSync(dbPath);

                    items.forEach(item => {
                        try {
                            const itemPath = `${dbPath}/${item}`;
                            const stat = wxFs.statSync(itemPath);
                            // 如果是目录且不是版本文件，则作为 ObjectStore
                            if (stat.isDirectory()) {
                                this.objectStoreNames.add(item);
                                // 同时为该 ObjectStore 创建对应的实例
                                const objStore = new IDBObjectStore(item, this);
                                this._stores.set(item, objStore);
                            }
                        } catch (e) {
                            // 忽略读取单个项目的错误
                            console.warn(`Failed to process item ${item}:`, e);
                        }
                    });
                } catch (e) {
                    // 如果数据库目录不存在或读取失败，忽略错误
                    // objectStoreNames 保持为空的 Set
                    console.warn(`Failed to load existing object stores for database ${this.name}:`, e);
                }
            }
        })
    }

    close() {
        this._closed = true;
        if (this.onclose) {
            this.onclose({ target: this, type: 'close' });
        }
    }

    createObjectStore(name, options = {}) {
        if (this._closed) {
            throw new Error('Database is closed');
        }

        const store = new IDBObjectStore(name, this);
        this._stores.set(name, store);
        this.objectStoreNames.add(name);

        // 创建存储目录
        const storePath = `${DB_ROOT_PATH}/${this.name}/${name}`;
        wxFs.access(
            {
                filePath: storePath,
                fail: () => {
                    wxFs.mkdirSync(storePath, true);
                }
            }
        )
        return store;
    }

    deleteObjectStore(name) {
        if (this._closed) {
            throw new Error('Database is closed');
        }

        this._stores.delete(name);
        this.objectStoreNames.delete(name);

        // 删除存储目录
        const storePath = `${DB_ROOT_PATH}/${this.name}/${name}`;
        try {
            wxFs.rmdirSync(storePath, true);
        } catch (e) {
            // 忽略删除错误
        }
    }

    transaction(storeNames, mode = 'readonly') {
        if (this._closed) {
            throw new Error('Database is closed');
        }

        if (typeof storeNames === 'string') {
            storeNames = [storeNames];
        }
        const store = new Set()
        storeNames.forEach((v) => {
            store.add(v)
        })
        return new IDBTransaction(store, mode, this);
    }
}

// IDBTransaction 模拟
class IDBTransaction extends EventTarget {
    constructor(storeNames, mode, db) {
        super();
        this.objectStoreNames = storeNames;
        this.mode = mode;
        this.db = db;
        this.error = null;
        this.onabort = null;
        this.oncomplete = null;
        this.onerror = null;
        this._completed = false;
        this._stores = new Map();
    }

    objectStore(name) {
        if (!this.objectStoreNames.has(name)) {
            throw new Error(`Object store '${name}' not found`);
        }

        if (!this._stores.has(name)) {
            const store = this.db._stores.get(name);
            if (store) {
                this._stores.set(name, new IDBObjectStore(name, this.db, this));
            }
        }

        return this._stores.get(name);
    }

    abort() {
        this._completed = true;
        if (this.onabort) {
            this.onabort({ target: this, type: 'abort' });
        }
    }

    _complete() {
        if (!this._completed) {
            this._completed = true;
            if (this.oncomplete) {
                this.oncomplete({ target: this, type: 'complete' });
            }
        }
    }
}

// IDBObjectStore 模拟
class IDBObjectStore {
    constructor(name, db, transaction = null) {
        this.name = name;
        this.indexNames = new Set();
        this.transaction = transaction;
        this._db = db;

        // 加载已存在的索引
        this._loadExistingIndexes();
    }

    _saveIndexes() {
        try {
            const storePath = this._getStorePath();
            const indexFile = `${storePath}/.index`;
            wxFs.access({
                filePath: storePath,
                fail: () => {
                    wxFs.mkdirSync(storePath, true)
                },
                complete: () => {
                    wxFs.writeFileSync(indexFile, this.indexNames.join(","), 'utf8');
                }
            })
        } catch (e) {
            console.warn(`Failed to save indexes for object store ${this.name}:`, e);
        }
    }

    _loadExistingIndexes() {
        const storePath = this._getStorePath();
        const indexesPath = `${storePath}/.index`;
        wx.access({
            filePath: indexesPath,
            success: () => {
                const indexesData = wxFs.readFileSync(indexesPath, 'utf8');
                const indexes = indexesData.split(",");
                this.indexNames = new Set(indexes);
            },
            fail: () => { }
        })
    }

    _getStorePath() {
        return `${DB_ROOT_PATH}/${this._db.name}/${this.name}`;
    }

    _getFilePath(key) {
        key = key.substring(5)
        return `${this._getStorePath()}/${key}`;
    }

    add(value, key) {
        return this._performOperation('add', value, key);
    }

    put(value, key) {
        return this._performOperation('put', value, key);
    }

    get(key) {
        const request = new IDBRequest();

        try {
            const filePath = this._getFilePath(key);
            const stat = wxFs.statSync(filePath)
            let contents = undefined;
            if (stat.isFile()) {
                contents = wxFs.readFileSync(filePath, 'utf8');
            }
            const v = {
                mode: stat.mode,
                timestamp: new Date(stat.lastModifiedTime * 1000)
            }
            if (contents !== undefined) {
                v.contents = contents
            }
            request._success(v);
        } catch (e) {
            request._success(undefined);
        }

        return request;
    }

    delete(key) {
        const request = new IDBRequest();

        try {
            const filePath = this._getFilePath(key);
            wxFs.unlinkSync(filePath);
            request._success();
        } catch (e) {
            request._error(e);
        }

        return request;
    }

    openKeyCursor(range, direction = 'next') {
        const request = new IDBRequest();
        Promise.resolve().then(() => {
            try {
                const storePath = this._getStorePath();
                const files = wxFs.readdirSync(storePath);
                // 过滤掉配置文件和索引文件
                const dataFiles = files.filter(file =>
                    !file.startsWith('.') &&
                    file !== '.index'
                );
                const keyCursor = new IDBKeyCursor(dataFiles, this, direction);
                request._success(keyCursor.hasNext() ? keyCursor : null);
            } catch (e) {
                request._success(null);
            }
        });
        return request;
    }

    _performOperation(operation, value, key) {
        const request = new IDBRequest();
        Promise.resolve().then(() => {
            try {
                if (key === undefined) {
                    throw new Error('No key provided');
                }
                const filePath = this._getFilePath(key);
                wxFs.access({
                    filePath: filePath,
                    success: function () {
                        if (operation === 'add') {
                            throw new Error('Key already exists');
                        }
                        if (!FS.isDir(value.mode)) {
                            wxFs.writeFileSync(filePath, value.contents.toString(), 'utf8');
                            request._success(key);
                        }
                    },
                    fail: function () {
                        if (FS.isDir(value.mode)) {
                            wxFs.mkdirSync(filePath, true)
                        } else {
                            wxFs.writeFileSync(filePath, value.contents.toString(), 'utf8');
                        }
                        request._success(key);
                    },
                    complete: function () {
                        // 完成事务
                        if (this.transaction) {
                            this.transaction._complete();
                        }
                    }
                })
            } catch (e) {
                request._error(e);
            }
        });
        return request;
    }

    index(name) {
        if (!this.indexNames.contains(name)) {
            throw new Error(`Index '${name}' not found`);
        }

        return new IDBIndex(name, this)
    }

    createIndex(name, keyPath, options = {}) {
        if (this.indexNames.contains(name)) {
            throw new Error(`Index '${name}' already exists`);
        }
        this.indexNames.add(name);

        // 保存索引配置到文件系统
        this._saveIndexes();

        return index;
    }
}

// IDBIndex 模拟
class IDBIndex {
    constructor(name, objectStore) {
        this.name = name;
        this.objectStore = objectStore;
    }

    get(key) {
        // 简化实现：直接从对象存储中获取
        return this.objectStore.get(key);
    }

    getKey(key) {
        const request = new IDBRequest();
        request._success(key);
        return request;
    }

    openKeyCursor(range, direction = 'next') {
        return this.objectStore.openKeyCursor(range, direction);
    }
}

// IDBKeyCursor 模拟 - 只包含键信息，不包含值
class IDBKeyCursor {
    constructor(files, store, direction = 'next') {
        this.source = store;
        this.direction = direction;
        this.key = null;
        this.primaryKey = null;
        this._files = files;
        this._index = 0;
        this._loadCurrent();
    }

    _loadCurrent() {
        if (this._index < this._files.length) {
            const fileName = this._files[this._index];
            const filePath = `${this.source._getStorePath()}/${fileName}`;

            try {
                const data = wxFs.readFileSync(filePath, 'utf8');
                const parsed = JSON.parse(data);
                this.key = parsed.key;
                this.primaryKey = parsed.key;
            } catch (e) {
                this.key = null;
                this.primaryKey = null;
            }
        } else {
            this.key = null;
            this.primaryKey = null;
        }
    }

    hasNext() {
        return this._index < this._files.length;
    }

    continue() {
        const request = new IDBRequest();

        this._index++;
        this._loadCurrent();
        request._success(this.hasNext() ? this : null);

        return request;
    }
}

// 全局 indexedDB 对象
const indexedDB = {
    open(name, version = 1) {
        const request = new IDBRequest();
        // 创建数据库目录
        const dbPath = `${DB_ROOT_PATH}/${name}`;
        wxFs.access({
            filePath: dbPath,
            fail: () => {
                wxFs.mkdirSync(dbPath, true);
            },
            complete: () => {
                try {
                    const db = new IDBDatabase(name, version);
                    // 检查是否需要升级
                    let needsUpgrade = false;
                    try {
                        const versionPath = `${dbPath}/.version`;
                        const currentVersion = parseInt(wxFs.readFileSync(versionPath, 'utf8') || '0');
                        if (version > currentVersion) {
                            needsUpgrade = true;
                            wxFs.writeFileSync(versionPath, String(version), 'utf8');
                        }
                    } catch (e) {
                        needsUpgrade = true;
                        const versionPath = `${dbPath}/.version`;
                        wxFs.writeFileSync(versionPath, String(version), 'utf8');
                    }

                    if (needsUpgrade && request.onupgradeneeded) {
                        const upgradeEvent = {
                            target: { result: db, transaction: new IDBTransaction(db.objectStoreNames, 'readwrite', db) },
                            oldVersion: 0,
                            newVersion: version
                        };
                        request.onupgradeneeded(upgradeEvent);
                    }

                    request._success(db);
                } catch (e) {
                    request._error(e);
                }
            }
        })
        return request;
    },
};

export default indexedDB;