// 基于微信小程序文件系统的 IndexedDB 适配器
import EventTarget from './EventTarget'

const wxFs = wx.getFileSystemManager();

// 数据库版本
const DB_VERSION = 21;
const DB_ROOT_PATH = `${wx.env.USER_DATA_PATH}/indexedDB`;

// 确保根目录存在
try {
    wxFs.mkdirSync(DB_ROOT_PATH, true);
} catch (e) {
    // 目录可能已存在，忽略错误
}

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

        // 读取目录下的子目录来填充 objectStoreNames
        this._loadExistingObjectStores();
    }

    _loadExistingObjectStores() {
        try {
            const dbPath = `${DB_ROOT_PATH}/${this.name}`;

            // 确保数据库目录存在
            try {
                wxFs.mkdirSync(dbPath, true);
            } catch (e) {
                // 目录可能已存在，忽略错误
            }

            // 读取数据库目录下的子目录
            const items = wxFs.readdirSync(dbPath);

            items.forEach(item => {
                try {
                    const itemPath = `${dbPath}/${item}`;
                    const stat = wxFs.statSync(itemPath);

                    // 如果是目录且不是版本文件，则作为 ObjectStore
                    if (stat.isDirectory() && item !== '.version') {
                        this.objectStoreNames.add(item);

                        // 尝试从配置文件加载 ObjectStore 的配置信息
                        const options = { keyPath: null, autoIncrement: false };

                        // 同时为该 ObjectStore 创建对应的实例
                        const store = new IDBObjectStore(item, options, this);
                        this._stores.set(item, store);
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

        const store = new IDBObjectStore(name, options, this);
        this._stores.set(name, store);
        this.objectStoreNames.add(name);

        // 创建存储目录
        const storePath = `${DB_ROOT_PATH}/${this.name}/${name}`;
        try {
            wxFs.mkdirSync(storePath, true);

            // 保存 ObjectStore 的配置信息
            const configPath = `${storePath}/.config.json`;
            const config = {
                keyPath: options.keyPath || null,
                autoIncrement: options.autoIncrement || false
            };
            wxFs.writeFileSync(configPath, JSON.stringify(config), 'utf8');
        } catch (e) {
            // 目录可能已存在
        }

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
                this._stores.set(name, new IDBObjectStore(name, {}, this.db, this));
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
    constructor(name, options = {}, db, transaction = null) {
        this.name = name;
        this.keyPath = options.keyPath || null;
        this.autoIncrement = options.autoIncrement || false;
        this.indexNames = new Set();
        this.transaction = transaction;
        this._db = db;
        this._indexes = new Map();
        this._nextKey = 1;

        // 加载已存在的索引
        this._loadExistingIndexes();
    }

    _saveIndexes() {
        try {
            const storePath = this._getStorePath();
            const indexesPath = `${storePath}/.indexes.json`;

            const indexesConfig = {};
            this._indexes.forEach((index, name) => {
                indexesConfig[name] = {
                    keyPath: index.keyPath,
                    options: {
                        unique: index.unique,
                        multiEntry: index.multiEntry
                    }
                };
            });

            // 确保目录存在
            try {
                wxFs.mkdirSync(storePath, true);
            } catch (e) {
                // 目录可能已存在
            }

            wxFs.writeFileSync(indexesPath, JSON.stringify(indexesConfig), 'utf8');
        } catch (e) {
            console.warn(`Failed to save indexes for object store ${this.name}:`, e);
        }
    }

    _loadExistingIndexes() {
        try {
            const storePath = this._getStorePath();
            const indexesPath = `${storePath}/.indexes.json`;

            try {
                const indexesData = wxFs.readFileSync(indexesPath, 'utf8');
                const indexes = JSON.parse(indexesData);

                Object.keys(indexes).forEach(indexName => {
                    const indexConfig = indexes[indexName];
                    this.indexNames.add(indexName);
                    const index = new IDBIndex(indexName, indexConfig.keyPath, indexConfig.options, this);
                    this._indexes.set(indexName, index);
                });
            } catch (e) {
                // 索引文件不存在或读取失败，忽略错误
            }
        } catch (e) {
            // 存储目录不存在，忽略错误
        }
    }

    _getStorePath() {
        return `${DB_ROOT_PATH}/${this._db.name}/${this.name}`;
    }

    _getFilePath(key) {
        return `${this._getStorePath()}/${encodeURIComponent(String(key))}.json`;
    }

    _generateKey() {
        if (this.autoIncrement) {
            return this._nextKey++;
        }
        return null;
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
            const data = wxFs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(data);
            request._success(parsed.value);
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

    clear() {
        const request = new IDBRequest();

        try {
            const storePath = this._getStorePath();
            const files = wxFs.readdirSync(storePath);
            files.forEach(file => {
                try {
                    wxFs.unlinkSync(`${storePath}/${file}`);
                } catch (e) {
                    // 忽略单个文件删除错误
                }
            });
            request._success();
        } catch (e) {
            request._error(e);
        }

        return request;
    }

    count(key) {
        const request = new IDBRequest();

        try {
            const storePath = this._getStorePath();
            const files = wxFs.readdirSync(storePath);
            let count = 0;

            if (key === undefined) {
                count = files.length;
            } else {
                const filePath = this._getFilePath(key);
                try {
                    wxFs.statSync(filePath);
                    count = 1;
                } catch (e) {
                    count = 0;
                }
            }

            request._success(count);
        } catch (e) {
            request._success(0);
        }

        return request;
    }

    openCursor(range, direction = 'next') {
        const request = new IDBRequest();

        try {
            const storePath = this._getStorePath();
            const files = wxFs.readdirSync(storePath);
            const cursor = new IDBCursor(files, this, direction);
            request._success(cursor.hasNext() ? cursor : null);
        } catch (e) {
            request._success(null);
        }

        return request;
    }

    openKeyCursor(range, direction = 'next') {
        const request = new IDBRequest();

        try {
            const storePath = this._getStorePath();
            const files = wxFs.readdirSync(storePath);
            // 过滤掉配置文件和索引文件
            const dataFiles = files.filter(file =>
                file.endsWith('.json') &&
                !file.startsWith('.') &&
                file !== '.config.json' &&
                file !== '.indexes.json'
            );
            const keyCursor = new IDBKeyCursor(dataFiles, this, direction);
            request._success(keyCursor.hasNext() ? keyCursor : null);
        } catch (e) {
            request._success(null);
        }

        return request;
    }

    _performOperation(operation, value, key) {
        const request = new IDBRequest();

        try {
            // 生成或使用提供的键
            if (key === undefined) {
                if (this.keyPath) {
                    key = value[this.keyPath];
                } else if (this.autoIncrement) {
                    key = this._generateKey();
                }
            }

            if (key === undefined) {
                throw new Error('No key provided and cannot generate key');
            }

            const filePath = this._getFilePath(key);
            const data = {
                key: key,
                value: value,
                timestamp: Date.now()
            };

            // 检查文件是否存在（用于 add 操作）
            if (operation === 'add') {
                try {
                    wxFs.statSync(filePath);
                    throw new Error('Key already exists');
                } catch (e) {
                    if (e.message === 'Key already exists') {
                        throw e;
                    }
                    // 文件不存在，继续操作
                }
            }

            wxFs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
            request._success(key);

            // 完成事务
            if (this.transaction) {
                this.transaction._complete();
            }
        } catch (e) {
            request._error(e);
        }

        return request;
    }

    index(name) {
        if (!this.indexNames.contains(name)) {
            throw new Error(`Index '${name}' not found`);
        }

        // 从已创建的索引映射中获取索引，如果不存在则抛出错误
        if (!this._indexes.has(name)) {
            throw new Error(`Index '${name}' not found`);
        }

        return this._indexes.get(name);
    }

    createIndex(name, keyPath, options = {}) {
        if (this.indexNames.contains(name)) {
            throw new Error(`Index '${name}' already exists`);
        }
        this.indexNames.add(name);
        const index = new IDBIndex(name, keyPath, options, this);
        this._indexes.set(name, index);

        // 保存索引配置到文件系统
        this._saveIndexes();

        return index;
    }

    deleteIndex(name) {
        if (!this.indexNames.contains(name)) {
            throw new Error(`Index '${name}' not found`);
        }

        this.indexNames.delete(name);
        this._indexes.delete(name);

        // 更新索引配置文件
        this._saveIndexes();
    }
}

// IDBIndex 模拟
class IDBIndex {
    constructor(name, keyPath, options = {}, objectStore) {
        this.name = name;
        this.keyPath = keyPath;
        this.unique = options.unique || false;
        this.multiEntry = options.multiEntry || false;
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

    openCursor(range, direction = 'next') {
        return this.objectStore.openCursor(range, direction);
    }

    openKeyCursor(range, direction = 'next') {
        return this.objectStore.openKeyCursor(range, direction);
    }

    count(key) {
        return this.objectStore.count(key);
    }
}

// IDBCursor 模拟
class IDBCursor {
    constructor(files, store, direction = 'next') {
        this.source = store;
        this.direction = direction;
        this.key = null;
        this.primaryKey = null;
        this.value = null;
        this._files = files;
        this._index = 0;
        this._loadCurrent();
    }

    _loadCurrent() {
        if (this._index < this._files.length) {
            const fileName = this._files[this._index];
            const key = decodeURIComponent(fileName.replace('.json', ''));
            const filePath = `${this.source._getStorePath()}/${fileName}`;

            try {
                const data = wxFs.readFileSync(filePath, 'utf8');
                const parsed = JSON.parse(data);
                this.key = parsed.key;
                this.primaryKey = parsed.key;
                this.value = parsed.value;
            } catch (e) {
                this.key = null;
                this.primaryKey = null;
                this.value = null;
            }
        } else {
            this.key = null;
            this.primaryKey = null;
            this.value = null;
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

    delete() {
        const request = new IDBRequest();

        try {
            const fileName = this._files[this._index];
            const filePath = `${this.source._getStorePath()}/${fileName}`;
            wxFs.unlinkSync(filePath);
            request._success();
        } catch (e) {
            request._error(e);
        }

        return request;
    }

    update(value) {
        const request = new IDBRequest();

        try {
            const fileName = this._files[this._index];
            const filePath = `${this.source._getStorePath()}/${fileName}`;
            const data = {
                key: this.key,
                value: value,
                timestamp: Date.now()
            };
            wxFs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
            request._success(this.key);
        } catch (e) {
            request._error(e);
        }

        return request;
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
            const key = decodeURIComponent(fileName.replace('.json', ''));
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

    // KeyCursor 不支持 delete 和 update 操作
    // 这些方法在标准的 IDBKeyCursor 中也不存在
}

// 全局 indexedDB 对象
const indexedDB = {
    open(name, version = 1) {
        const request = new IDBRequest();
        Promise.resolve().then(() => {
            try {
                // 创建数据库目录
                const dbPath = `${DB_ROOT_PATH}/${name}`;
                try {
                    wxFs.mkdirSync(dbPath, true);
                } catch (e) {
                    // 目录可能已存在
                }

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
        });
        return request;
    },

    deleteDatabase(name) {
        const request = new IDBRequest();

        try {
            const dbPath = `${DB_ROOT_PATH}/${name}`;
            wxFs.rmdirSync(dbPath, true);
            request._success();
        } catch (e) {
            request._error(e);
        }

        return request;
    },

    databases() {
        const request = new IDBRequest();

        try {
            const databases = [];
            const dbNames = wxFs.readdirSync(DB_ROOT_PATH);

            dbNames.forEach(name => {
                try {
                    const versionPath = `${DB_ROOT_PATH}/${name}/.version`;
                    const version = parseInt(wxFs.readFileSync(versionPath, 'utf8') || '1');
                    databases.push({ name, version });
                } catch (e) {
                    // 忽略无效的数据库目录
                }
            });

            request._success(databases);
        } catch (e) {
            request._success([]);
        }

        return request;
    }
};

export default indexedDB;