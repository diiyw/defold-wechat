const wxFs = wx.getFileSystemManager();

var ERRNO_CODES = {
  'EPERM': 63,
  'ENOENT': 44,
  'ESRCH': 71,
  'EINTR': 27,
  'EIO': 29,
  'ENXIO': 60,
  'E2BIG': 1,
  'ENOEXEC': 45,
  'EBADF': 8,
  'ECHILD': 12,
  'EAGAIN': 6,
  'EWOULDBLOCK': 6,
  'ENOMEM': 48,
  'EACCES': 2,
  'EFAULT': 21,
  'ENOTBLK': 105,
  'EBUSY': 10,
  'EEXIST': 20,
  'EXDEV': 75,
  'ENODEV': 43,
  'ENOTDIR': 54,
  'EISDIR': 31,
  'EINVAL': 28,
  'ENFILE': 41,
  'EMFILE': 33,
  'ENOTTY': 59,
  'ETXTBSY': 74,
  'EFBIG': 22,
  'ENOSPC': 51,
  'ESPIPE': 70,
  'EROFS': 69,
  'EMLINK': 34,
  'EPIPE': 64,
  'EDOM': 18,
  'ERANGE': 68,
  'ENOMSG': 49,
  'EIDRM': 24,
  'ECHRNG': 106,
  'EL2NSYNC': 156,
  'EL3HLT': 107,
  'EL3RST': 108,
  'ELNRNG': 109,
  'EUNATCH': 110,
  'ENOCSI': 111,
  'EL2HLT': 112,
  'EDEADLK': 16,
  'ENOLCK': 46,
  'EBADE': 113,
  'EBADR': 114,
  'EXFULL': 115,
  'ENOANO': 104,
  'EBADRQC': 103,
  'EBADSLT': 102,
  'EDEADLOCK': 16,
  'EBFONT': 101,
  'ENOSTR': 100,
  'ENODATA': 116,
  'ETIME': 117,
  'ENOSR': 118,
  'ENONET': 119,
  'ENOPKG': 120,
  'EREMOTE': 121,
  'ENOLINK': 47,
  'EADV': 122,
  'ESRMNT': 123,
  'ECOMM': 124,
  'EPROTO': 65,
  'EMULTIHOP': 36,
  'EDOTDOT': 125,
  'EBADMSG': 9,
  'ENOTUNIQ': 126,
  'EBADFD': 127,
  'EREMCHG': 128,
  'ELIBACC': 129,
  'ELIBBAD': 130,
  'ELIBSCN': 131,
  'ELIBMAX': 132,
  'ELIBEXEC': 133,
  'ENOSYS': 52,
  'ENOTEMPTY': 55,
  'ENAMETOOLONG': 37,
  'ELOOP': 32,
  'EOPNOTSUPP': 138,
  'EPFNOSUPPORT': 139,
  'ECONNRESET': 15,
  'ENOBUFS': 42,
  'EAFNOSUPPORT': 5,
  'EPROTOTYPE': 67,
  'ENOTSOCK': 57,
  'ENOPROTOOPT': 50,
  'ESHUTDOWN': 140,
  'ECONNREFUSED': 14,
  'EADDRINUSE': 3,
  'ECONNABORTED': 13,
  'ENETUNREACH': 40,
  'ENETDOWN': 38,
  'ETIMEDOUT': 73,
  'EHOSTDOWN': 142,
  'EHOSTUNREACH': 23,
  'EINPROGRESS': 26,
  'EALREADY': 7,
  'EDESTADDRREQ': 17,
  'EMSGSIZE': 35,
  'EPROTONOSUPPORT': 66,
  'ESOCKTNOSUPPORT': 137,
  'EADDRNOTAVAIL': 4,
  'ENETRESET': 39,
  'EISCONN': 30,
  'ENOTCONN': 53,
  'ETOOMANYREFS': 141,
  'EUSERS': 136,
  'EDQUOT': 19,
  'ESTALE': 72,
  'ENOTSUP': 138,
  'ENOMEDIUM': 148,
  'EILSEQ': 25,
  'EOVERFLOW': 61,
  'ECANCELED': 11,
  'ENOTRECOVERABLE': 56,
  'EOWNERDEAD': 62,
  'ESTRPIPE': 135,
};
var DMFS = {
  mount(mount) {
    try {
      wxFs.mkdirSync(`${wx.env.USER_DATA_PATH}${DMSYS.GetUserPersistentDataRoot()}`, true);
    } catch (error) {

    }
    return DMFS.createNode(null, '/', 16895, 0);
  },
  createNode(parent, name, mode, dev) {
    if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
      throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
    }
    var node = FS.createNode(parent, name, mode);
    node.node_ops = DMFS.node_ops;
    node.stream_ops = DMFS.stream_ops;
    return node;
  },
  realPath(node) {
    var parts = [];
    while (node.parent !== node) {
      parts.push(node.name);
      node = node.parent;
    }
    parts.push(node.mount.opts.root);
    parts.reverse();
    return `${wx.env.USER_DATA_PATH}/data${parts.join('/')}`;
  },
  realPathJoin(parent, name) {
    return `${this.realPath(parent)}/${name}`
  },
  node_ops: {
    getattr(node) {
      var path = DMFS.realPath(node);
      var stat;
      try {
        stat = wxFs.statSync(path);
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
      return {
        dev: stat.dev,
        ino: stat.ino,
        mode: stat.mode,
        nlink: stat.nlink,
        uid: stat.uid,
        gid: stat.gid,
        rdev: stat.rdev,
        size: stat.size,
        atime: new Date(stat.lastAccessedTime * 1000),
        mtime: new Date(stat.lastModifiedTime * 1000),
        ctime: new Date(stat.lastModifiedTime * 1000),
        blksize: stat.blksize,
        blocks: stat.blocks
      };
    },
    setattr(node, attr) {
      var path = DMFS.realPath(node);
      try {
        if (attr.mode !== undefined) {
          wxFs.chmodSync(path, attr.mode);
          // update the common node structure mode as well
          node.mode = attr.mode;
        }
        if (attr.atime || attr.mtime) {
          var atime = new Date(attr.atime || attr.mtime);
          var mtime = new Date(attr.mtime || attr.atime);
          wxFs.utime(path, atime, mtime);
        }
        if (attr.size !== undefined) {
          wxFs.truncate(path, attr.size);
        }
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    lookup(parent, name) {
      try {
        var path = DMFS.realPathJoin(parent, name);
        var mode = wxFs.statSync(path).mode;
        var node = DMFS.createNode(parent, name, mode);
        return node;
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    mknod(parent, name, mode, dev) {
      var node = DMFS.createNode(parent, name, mode, dev);
      // create the backing node for this in the fs root as well
      var path = DMFS.realPath(node);
      try {
        if (FS.isDir(node.mode)) {
          wxFs.mkdirSync(path, true);
        } else {
          wxFs.writeFileSync(path, '', 'utf8');
        }
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
      return node;
    },
    rename(oldNode, newDir, newName) {
      var oldPath = DMFS.realPath(oldNode);
      var newPath = DMFS.realPathJoin(newDir, newName);
      try {
        wxFs.renameSync(oldPath, newPath);
        oldNode.name = newName;
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    unlink(parent, name) {
      var path = DMFS.realPathJoin(parent, name);
      try {
        wxFs.unlinkSync(path);
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    rmdir(parent, name) {
      var path = DMFS.realPathJoin(parent, name);;
      try {
        wxFs.rmdirSync(path, false);
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    readdir(node) {
      var path = DMFS.realPath(node);
      try {
        return wxFs.readdirSync(path);
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    symlink(parent, newName, oldPath) {
      // not supported
      var newPath = DMFS.realPathJoin(parent, name);;
      try {
        wxFs.symlinkSync(oldPath, newPath);
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    readlink(node) {
      // not supported
      var path = DMFS.realPath(node);
      try {
        return wxFs.readlink(path);
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
  },
  stream_ops: {
    open(stream) {
      var path = DMFS.realPath(stream.node);
      try {
        stream.nfd = wxFs.openSync({
          filePath: path,
          flag: DMFS.convertPosixFlagsToWxFlag(stream.flags)
        });
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    close(stream) {
      try {
        wxFs.closeSync({ fd: stream.nfd });
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    read(stream, buffer, offset, length, position) {
      try {
        return wxFs.readSync({
          fd: stream.nfd,
          arrayBuffer: buffer,
          offset: offset,
          length: length,
          position: position
        });
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    write(stream, buffer, offset, length, position) {
      try {
        return wxFs.writeSync({
          fd: stream.nfd,
          data: buffer,
          offset: offset,
          length: length,
          position: position,
          encoding: 'binary'
        });
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
    },
    llseek(stream, offset, whence) {
      var position = offset;
      if (whence === 1) {
        position += stream.position;
      } else if (whence === 2) {
        if (FS.isFile(stream.node.mode)) {
          try {
            var stat = stream.node.node_ops.getattr(stream.node);
            position += stat.size;
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        }
      }

      if (position < 0) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }

      return position;
    },
  },

  // 将POSIX flags转换为微信小游戏文件系统字符串flag
  convertPosixFlagsToWxFlag(flags) {
    // POSIX flags常量
    const O_RDONLY = 0;    // 只读
    const O_WRONLY = 1;    // 只写  
    const O_RDWR = 2;      // 读写
    const O_CREAT = 64;    // 创建文件
    const O_EXCL = 128;    // 排他性创建
    const O_TRUNC = 512;   // 截断
    const O_APPEND = 1024; // 追加
    const O_SYNC = 1052672; // 同步模式 (as/as+的标识)

    // 获取访问模式（最低2位）
    const accessMode = flags & 3;
    const hasCreat = flags & O_CREAT;
    const hasExcl = flags & O_EXCL;
    const hasTrunc = flags & O_TRUNC;
    const hasAppend = flags & O_APPEND;
    const hasSync = flags & O_SYNC;

    if (hasAppend) {
      // 追加模式
      if (hasExcl) {
        // ax 或 ax+
        return accessMode === O_RDWR ? 'ax+' : 'ax';
      } else if (hasSync) {
        // as 或 as+  
        return accessMode === O_RDWR ? 'as+' : 'as';
      } else {
        // a 或 a+
        return accessMode === O_RDWR ? 'a+' : 'a';
      }
    } else if (hasTrunc || hasCreat) {
      // 写入模式（截断或创建）
      if (hasExcl) {
        // wx 或 wx+
        return accessMode === O_RDWR ? 'wx+' : 'wx';
      } else {
        // w 或 w+
        return accessMode === O_RDWR ? 'w+' : 'w';
      }
    } else {
      // 读取模式
      return accessMode === O_RDWR ? 'r+' : 'r';
    }
  },
};

export default DMFS;
