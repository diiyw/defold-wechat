/**
 * IndexedDB 适配器
 * 使用微信小游戏的存储 API 模拟 IndexedDB 功能
 * 支持 IDBFS 文件系统所需的核心功能
 */

class IDBRequest {
    constructor() {
        this.result = null;
        this.error = null;
        this.readyState = 'pending'; // pending, done
        this.source = null;
        this.transaction = null;

        this.onsuccess = null;
        this.onerror = null;
        this.onblocked = null;
        this.onupgradeneeded = null;
    }

    _triggerSuccess(result) {
        this.result = result;
        this.readyState = 'done';
        if (this.onsuccess) {
            const event = { target: this, type: 'success' };
            this.onsuccess(event);
        }
    }

    _triggerError(error) {
        this.error = error;
        this.readyState = 'done';
        if (this.onerror) {
            const event = {
                target: this,
                type: 'error',
                preventDefault: () => { }
            };
            this.onerror(event);
        }
    }
}

// 主 indexedDB 接口
class IndexedDBFactory {
    constructor() {
        this._databases = {};
    }

    open(name, version) {
        const request = new IDBRequest();

        setTimeout(() => {
            try {
                // 检查是否需要升级
                const metaKey = `__idb_db_${name}_meta`;
                let currentVersion = 1;
                let needUpgrade = false;

                try {
                    const metadata = wx.getStorageSync(metaKey);
                    if (metadata) {
                        const meta = JSON.parse(metadata);
                        currentVersion = meta.version || 1;
                    }
                } catch (error) {
                    // 如果无法读取版本，则认为是新数据库
                }

                if (version && version > currentVersion) {
                    needUpgrade = true;
                }

                const db = new IDBDatabase(name, version || currentVersion);
                this._databases[name] = db;

                if (needUpgrade && request.onupgradeneeded) {
                    const event = {
                        target: request,
                        oldVersion: currentVersion,
                        newVersion: version || currentVersion
                    };
                    request.result = db;
                    request.onupgradeneeded(event);
                }

                request._triggerSuccess(db);
            } catch (error) {
                request._triggerError(error);
            }
        }, 0);

        return request;
    }

    deleteDatabase(name) {
        const request = new IDBRequest();

        setTimeout(() => {
            try {
                // 清理所有相关的存储数据
                const metaKey = `__idb_db_${name}_meta`;
                let objectStoreNames = [];

                try {
                    const metadata = wx.getStorageSync(metaKey);
                    if (metadata) {
                        const meta = JSON.parse(metadata);
                        objectStoreNames = meta.objectStoreNames || [];
                    }
                } catch (error) {
                    // 忽略错误
                }

                // 删除所有对象存储的数据
                for (const storeName of objectStoreNames) {
                    const store = new IDBObjectStore(storeName);
                    const keys = store._getAllKeys();
                    for (const key of keys) {
                        store._deleteData(key);
                    }
                    wx.removeStorageSync(store._metaStorageKey);
                    wx.removeStorageSync(store._indexStorageKey);
                }

                // 删除数据库元数据
                wx.removeStorageSync(metaKey);

                delete this._databases[name];
                request._triggerSuccess(undefined);
            } catch (error) {
                request._triggerError(error);
            }
        }, 0);

        return request;
    }

    cmp(first, second) {
        if (first < second) return -1;
        if (first > second) return 1;
        return 0;
    }
}

// 创建全局实例
const indexedDB = new IndexedDBFactory();

// 导出所有必要的类和接口
export default indexedDB;