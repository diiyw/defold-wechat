const wxFs = wx.getFileSystemManager();

class DMFS {
  constructor() {
    this.flagsForNodeMap = {
      1024: 'a',    // O_APPEND
      64: 'w',      // O_CREAT
      128: 'wx',    // O_EXCL  
      256: 'r',     // O_NOCTTY (映射为只读)
      0: 'r',       // O_RDONLY
      2: 'r+',      // O_RDWR
      4096: 'w',    // O_SYNC (映射为写入)
      512: 'w',     // O_TRUNC
      1: 'w',       // O_WRONLY
      131072: 'r',  // O_NOFOLLOW (映射为只读)
    };
    this.staticInit()
  }

  staticInit() {
    DMFS.node_ops = {
      getattr(node) {
        var path = DMFS.realPath(node);
        return DMFS.getattr(path, node);
      },
      setattr(node, attr) {
        var path = DMFS.realPath(node);
        if (attr.mode != null && attr.dontFollow) {
          throw new FS.ErrnoError(52);
        }
        this.setattr(path, node, attr);
      },
      lookup(parent, name) {
        var path = DMFS.realPath(parent) + '/' + name;
        var mode = DMFS.getMode(path);
        return DMFS.createNode(parent, name, mode);
      },
      mknod(parent, name, mode, dev) {
        var node = DMFS.createNode(parent, name, mode, dev);
        var path = DMFS.realPath(node);
        DMFS.tryFSOperation(() => {
          if (FS.isDir(node.mode)) {
            // 使用微信小游戏同步API创建目录
            wxFs.mkdirSync(path);
          } else {
            // 使用微信小游戏同步API创建文件
            wxFs.writeFileSync(path, '');
          }
        });
        return node;
      },
      rename(oldNode, newDir, newName) {
        var oldPath = DMFS.realPath(oldNode);
        var newPath = DMFS.realPath(newDir) + '/' + newName;

        // 先删除目标文件（如果存在）
        try {
          FS.unlink(newPath);
        } catch (e) { }

        this.tryFSOperation(() => {
          // 使用微信小游戏同步API：先复制再删除
          wxFs.copyFileSync(oldPath, newPath);
          wxFs.unlinkSync(oldPath);
        });

        oldNode.name = newName;
      },
      unlink(parent, name) {
        var path = DMFS.realPath(parent) + '/' + name;
        this.tryFSOperation(() => {
          // 使用微信小游戏同步API删除文件
          wxFs.unlinkSync(path);
        });
      },
      rmdir(parent, name) {
        var path = DMFS.realPath(parent) + '/' + name;
        this.tryFSOperation(() => {
          // 使用微信小游戏同步API删除目录
          wxFs.rmdirSync(path);
        });
      },
      readdir(node) {
        var path = DMFS.realPath(node);
        return this.tryFSOperation(() => {
          // 使用微信小游戏同步API读取目录
          return wxFs.readdirSync(path);
        });
      },
      symlink(parent, newName, oldPath) {
        // 微信小游戏不支持符号链接
        console.warn('DMFS: 符号链接在微信小游戏中不支持');
        throw new FS.ErrnoError(38); // ENOSYS
      },
      readlink(node) {
        // 微信小游戏不支持符号链接
        console.warn('DMFS: 读取符号链接在微信小游戏中不支持');
        throw new FS.ErrnoError(38); // ENOSYS
      },
      statfs(path) {
        // 微信小游戏中的文件系统统计信息相对简单
        return {
          bsize: 4096,
          frsize: 4096,
          blocks: 1000000, // 模拟的总块数
          bfree: 500000,   // 模拟的空闲块数
          bavail: 500000,  // 模拟的可用块数
          files: 100000,   // 模拟的文件节点数
          ffree: 50000,    // 模拟的空闲文件节点数
          favail: 50000,   // 模拟的可用文件节点数
          fsid: 0,
          flag: 0,
          namemax: 255
        };
      },
    };

    DMFS.stream_ops = {
      getattr(stream) {
        return DMFS.getattr(stream.path, stream.node);
      },
      setattr(stream, attr) {
        this.setattr(stream.path, stream.node, attr);
      },
      open(stream) {
        var path = DMFS.realPath(stream.node);
        stream.path = path;
        this.tryFSOperation(() => {
          stream.shared.refcount = 1;
          // 微信小游戏中不需要显式打开文件描述符
          // 使用文件路径作为标识
          stream.nfd = path;
        });
      },
      close(stream) {
        this.tryFSOperation(() => {
          if (stream.nfd && --stream.shared.refcount === 0) {
            // 微信小游戏中不需要显式关闭文件
            stream.nfd = null;
          }
        });
      },
      dup(stream) {
        stream.shared.refcount++;
      },
      read(stream, buffer, offset, length, position) {
        return this.tryFSOperation(() => {
          // 使用微信小游戏同步API读取文件
          const data = wxFs.readFileSync(stream.nfd);

          // 将读取的数据复制到 buffer 中
          if (data instanceof ArrayBuffer) {
            const uint8Array = new Uint8Array(data);
            const targetArray = new Uint8Array(buffer.buffer, offset, Math.min(length, uint8Array.length));
            targetArray.set(uint8Array.slice(position || 0, (position || 0) + Math.min(length, uint8Array.length)));
            return Math.min(length, uint8Array.length - (position || 0));
          } else if (typeof data === 'string') {
            const encoder = new TextEncoder();
            const encodedData = encoder.encode(data);
            const startPos = position || 0;
            const availableLength = Math.max(0, encodedData.length - startPos);
            const readLength = Math.min(length, availableLength);
            const targetArray = new Uint8Array(buffer.buffer, offset, readLength);
            targetArray.set(encodedData.slice(startPos, startPos + readLength));
            return readLength;
          }
          return 0;
        });
      },
      write(stream, buffer, offset, length, position) {
        return this.tryFSOperation(() => {
          // 将 buffer 数据转换为微信小游戏可识别的格式
          const dataToWrite = buffer.buffer.slice(offset, offset + length);

          // 使用微信小游戏同步API写入文件
          wxFs.writeFileSync(stream.nfd, dataToWrite);

          return length; // 返回写入的字节数
        });
      },
      llseek(stream, offset, whence) {
        var position = offset;
        if (whence === 1) {
          position += stream.position;
        } else if (whence === 2) {
          if (FS.isFile(stream.node.mode)) {
            // 获取文件大小
            const stats = DMFS.getattr(stream.path, stream.node);
            position += stats.size;
          }
        }

        if (position < 0) {
          throw new FS.ErrnoError(28);
        }

        return position;
      },
      mmap(stream, length, position, prot, flags) {
        if (!FS.isFile(stream.node.mode)) {
          throw new FS.ErrnoError(43);
        }

        var ptr = mmapAlloc(length);

        this.stream_ops.read(stream, HEAP8, ptr, length, position);
        return { ptr, allocated: true };
      },
      msync(stream, buffer, offset, length, mmapFlags) {
        this.stream_ops.write(stream, buffer, 0, length, offset, false);
        return 0;
      },
    };
  }

  static convertWxCode(e) {
    // 微信小游戏错误码转换
    var code = e.errMsg || e.message || 'unknown';
    // 常见的微信错误码映射
    if (code.includes('no such file')) return 2;  // ENOENT
    if (code.includes('permission denied')) return 13; // EACCES
    if (code.includes('file exists')) return 17; // EEXIST
    if (code.includes('not a directory')) return 20; // ENOTDIR
    if (code.includes('is a directory')) return 21; // EISDIR
    if (code.includes('invalid argument')) return 22; // EINVAL
    return 28; // ENOSYS - 默认系统错误
  }

  static tryFSOperation(f) {
    try {
      return f();
    } catch (e) {
      console.warn('DMFS 操作失败:', e);
      throw new FS.ErrnoError(DMFS.convertWxCode(e));
    }
  }

  // 微信小游戏支持同步文件操作，移除异步转同步的辅助函数
  mount(mount) {
    // 微信小游戏环境检查
    if (typeof wx === 'undefined') {
      throw new Error('微信小游戏环境未检测到');
    }
    return DMFS.createNode(null, "/", DMFS.getMode(`${wx.env.USER_DATA_PATH}${mount.mountpoint}`), 0);
  }

  static createNode(parent, name, mode, dev) {
    if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
      throw new FS.ErrnoError(28);
    }
    var node = FS.createNode(parent, name, mode);
    node.node_ops = DMFS.node_ops;
    node.stream_ops = DMFS.stream_ops;
    return node;
  }

  static getMode(path) {
    return this.tryFSOperation(() => {
      // 使用微信小游戏同步API获取文件状态
      const stats = wxFs.statSync(path);

      // 默认文件模式（微信小游戏中简化处理）
      var mode = stats.isDirectory() ? 16877 : 33188; // 目录或文件的默认权限
      return mode;
    });
  }

  static realPath(node) {
    var parts = [];
    while (node.parent !== node) {
      parts.push(node.name);
      node = node.parent;
    }
    parts.push(node.mount.opts.root);
    parts.reverse();
    // 微信小游戏中使用简单的路径拼接
    return parts.join('/');
  }

  flagsForNode(flags) {
    flags &= ~2097152; // Ignore this flag from musl
    flags &= ~2048; // Ignore this flag from musl
    flags &= ~32768; // Ignore this flag from musl
    flags &= ~524288; // Some applications may pass it
    flags &= ~65536; // Node.js doesn't need this passed in

    // 微信小游戏中的文件模式转换
    var mode = 'r'; // 默认只读

    if (flags & 1) mode = 'w';      // O_WRONLY
    else if (flags & 2) mode = 'r+'; // O_RDWR
    else if (flags & 64) mode = 'w'; // O_CREAT
    else if (flags & 1024) mode = 'a'; // O_APPEND

    return mode;
  }

  static getattr(path, node) {
    return this.tryFSOperation(() => {
      // 使用微信小游戏同步API获取文件状态
      const stats = wxFs.statSync(path);

      // 转换为 FS 需要的格式
      return {
        dev: 1,
        ino: node.id,
        mode: stats.isDirectory() ? 16877 : 33188,
        nlink: 1,
        uid: 0,
        gid: 0,
        rdev: 0,
        size: stats.size || 0,
        atime: stats.lastAccessedTime || Date.now(),
        mtime: stats.lastModifiedTime || Date.now(),
        ctime: stats.lastModifiedTime || Date.now(),
        blksize: 4096,
        blocks: Math.ceil((stats.size || 0) / 4096),
      };
    });
  }

  static setattr(path, node, attr) {
    this.tryFSOperation(() => {
      // 微信小游戏中的文件属性设置相对有限
      // 大部分属性修改在微信小游戏中不支持，这里作为空操作处理
      if (attr.size !== undefined) {
        // 只支持文件大小的修改（通过重写文件实现截断）
        console.warn('DMFS: 文件截断操作在微信小游戏中不支持');
      }
      if (attr.mode !== undefined) {
        // 权限修改在微信小游戏中不支持
        console.warn('DMFS: 文件权限修改在微信小游戏中不支持');
        node.mode = attr.mode;
      }
      if (typeof (attr.atime ?? attr.mtime) === "number") {
        // 时间修改在微信小游戏中不支持
        console.warn('DMFS: 文件时间修改在微信小游戏中不支持');
      }
    });
  }
}

export default DMFS;
