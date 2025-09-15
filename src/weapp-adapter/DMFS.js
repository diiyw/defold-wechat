// DMFS.js - Emscripten 文件系统后端，对接微信小游戏存储

const wxFS = wx.getFileSystemManager();

export default class DMFS {
  // 文件系统名称
  mount(mount) {
    return {
      root: {
        node: {
          id: 1,
          name: '/',
          mode: 0o755 | 0o040000, // 目录
          parent: null,
          children: {},
        },
        mount: mount,
        ops: this,
      }
    };
  }

  // 创建节点（文件或目录）
  createNode(parent, name, mode, dev) {
    const node = FS.createNode(parent, name, mode, dev);
    node.wxPath = this._resolvePath(parent, name);
    return node;
  }

  // 解析路径
  _resolvePath(parent, name) {
    if (!parent.wxPath) {
      return `${wx.USER_DATA_PATH}/${name}`.replace(/\/\//g, '/');
    }
    return `${parent.wxPath}/${name}`.replace(/\/\//g, '/');
  }

  // 创建目录
  mkdir(parent, name, mode) {
    const wxPath = this._resolvePath(parent, name);
    try {
      wxFS.mkdirSync({ dirPath: wxPath, recursive: true });
    } catch (e) {
      if (e.errMsg && e.errMsg.includes('file already exists')) {
        throw new FS.ErrnoError(20); // EEXIST
      }
      throw e;
    }
    return this.createNode(parent, name, mode | 0o040000, 0);
  }

  // 读目录
  readdir(node) {
    const wxPath = node.wxPath;
    try {
      const files = wxFS.readdirSync({ dirPath: wxPath });
      return ['.', '..'].concat(files);
    } catch (e) {
      throw new FS.ErrnoError(4); // ENOENT
    }
  }

  // 获取文件状态
  getattr(node) {
    const wxPath = node.wxPath;
    try {
      const stat = wxFS.statSync({ path: wxPath });
      node.size = stat.size;
      node.timestamp = stat.lastModifiedTime;
      node.mode = stat.isDirectory ? (0o755 | 0o040000) : (0o644 | 0o100000);
      return node;
    } catch (e) {
      throw new FS.ErrnoError(4); // ENOENT
    }
  }

  // 创建文件
  create(parent, name, mode, dev) {
    const wxPath = this._resolvePath(parent, name);
    try {
      wxFS.writeFileSync({ filePath: wxPath, data: '', encoding: 'binary' });
    } catch (e) {
      throw new FS.ErrnoError(5); // EIO
    }
    return this.createNode(parent, name, mode | 0o100000, dev);
  }

  // 打开文件
  open(node, flags, mode) {
    // 微信不支持文件描述符，我们只记录路径和标志
    node.wxFlags = flags;
    return {};
  }

  // 读取文件
  read(node, buffer, offset, length, position) {
    const wxPath = node.wxPath;
    try {
      const data = wxFS.readFileSync({ filePath: wxPath, position, length, encoding: 'binary' });
      if (typeof data === 'string') {
        for (let i = 0; i < data.length && i < length; i++) {
          buffer[offset + i] = data.charCodeAt(i);
        }
        return data.length;
      } else if (data instanceof ArrayBuffer) {
        const u8 = new Uint8Array(data);
        buffer.set(u8.subarray(0, length), offset);
        return u8.length;
      } else {
        throw new Error('Unsupported data type');
      }
    } catch (e) {
      throw new FS.ErrnoError(5); // EIO
    }
  }

  // 写入文件
  write(node, buffer, offset, length, position) {
    const wxPath = node.wxPath;
    try {
      let data;
      if (buffer instanceof Uint8Array) {
        data = buffer.subarray(offset, offset + length);
      } else {
        // 兼容 array
        data = new Uint8Array(buffer.slice(offset, offset + length));
      }
      wxFS.writeFileSync({
        filePath: wxPath,
        data: data,
        position: position,
        encoding: 'binary'
      });
      return length;
    } catch (e) {
      throw new FS.ErrnoError(5); // EIO
    }
  }

  // 关闭文件（无操作）
  close(fd) {}

  // 删除文件
  unlink(parent, name) {
    const wxPath = this._resolvePath(parent, name);
    try {
      wxFS.unlinkSync({ filePath: wxPath });
    } catch (e) {
      throw new FS.ErrnoError(2); // ENOENT
    }
  }

  // 删除目录
  rmdir(parent, name) {
    const wxPath = this._resolvePath(parent, name);
    try {
      wxFS.rmdirSync({ dirPath: wxPath, recursive: false });
    } catch (e) {
      if (e.errMsg && e.errMsg.includes('directory is not empty')) {
        throw new FS.ErrnoError(39); // ENOTEMPTY
      }
      throw new FS.ErrnoError(2); // ENOENT
    }
  }
}