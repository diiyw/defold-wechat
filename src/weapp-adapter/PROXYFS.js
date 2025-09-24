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
var PROXYFS = {
    mount(mount) {
        return PROXYFS.createNode(null, '/', wxFs.statSync(mount.opts.root, false).mode, 0);
    },
    createNode(parent, name, mode, dev) {
        if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node = FS.createNode(parent, name, mode);
        node.node_ops = PROXYFS.node_ops;
        node.stream_ops = PROXYFS.stream_ops;
        return node;
    },
    realPath(node) {
        var parts = [];
        while (node.parent !== node) {
            parts.push(node.name);
            node = node.parent;
        }
        parts.push(node.mount.opts.root);
        parts.push(wx.env.USER_DATA_PATH);
        parts.reverse();
        return PATH.join(...parts);
    },
    node_ops: {
        getattr(node) {
            var path = PROXYFS.realPath(node);
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
                atime: stat.atime,
                mtime: stat.mtime,
                ctime: stat.ctime,
                blksize: stat.blksize,
                blocks: stat.blocks
            };
        },
        setattr(node, attr) {
            var path = PROXYFS.realPath(node);
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
                var path = PATH.join2(PROXYFS.realPath(parent), name);
                var mode = wxFs.statSync(path).mode;
                var node = PROXYFS.createNode(parent, name, mode);
                return node;
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        mknod(parent, name, mode, dev) {
            var node = PROXYFS.createNode(parent, name, mode, dev);
            // create the backing node for this in the fs root as well
            var path = PROXYFS.realPath(node);
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
            var oldPath = PROXYFS.realPath(oldNode);
            var newPath = PATH.join2(PROXYFS.realPath(newDir), newName);
            try {
                wxFs.renameSync(oldPath, newPath);
                oldNode.name = newName;
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        unlink(parent, name) {
            var path = PATH.join2(PROXYFS.realPath(parent), name);
            try {
                wxFs.unlinkSync(path);
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        rmdir(parent, name) {
            var path = PATH.join2(PROXYFS.realPath(parent), name);
            try {
                wxFs.rmdirSync(path, false);
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        readdir(node) {
            var path = PROXYFS.realPath(node);
            try {
                return wxFs.readdirSync(path);
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        symlink(parent, newName, oldPath) {
            // not supported
            var newPath = PATH.join2(PROXYFS.realPath(parent), newName);
            try {
                wxFs.symlinkSync(oldPath, newPath);
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        readlink(node) {
            // not supported
            var path = PROXYFS.realPath(node);
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
            var path = PROXYFS.realPath(stream.node);
            try {
                stream.nfd = wxFs.openSync({
                    filePath: path,
                    // TODO: convert to wx flag
                    flag: stream.flags
                });
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
        },
        close(stream) {
            try {
                wxFs.closeSync(stream.nfd);
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
};

export default PROXYFS;
