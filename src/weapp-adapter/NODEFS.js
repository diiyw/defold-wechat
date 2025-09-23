var fs = wx.getFileSystemManager()

class NODEFS {
    static flagsForNodeMap = {};

    static staticInit() {
        var flags = process.binding("constants")["fs"];
        NODEFS.flagsForNodeMap = {
            "1024": flags["O_APPEND"],
            "64": flags["O_CREAT"],
            "128": flags["O_EXCL"],
            "256": flags["O_NOCTTY"],
            "0": flags["O_RDONLY"],
            "2": flags["O_RDWR"],
            "4096": flags["O_SYNC"],
            "512": flags["O_TRUNC"],
            "1": flags["O_WRONLY"],
            "131072": flags["O_NOFOLLOW"],
        };
        // The 0 define must match on both sides, as otherwise we would not
        // know to add it.
        assert(NODEFS.flagsForNodeMap["0"] === 0);
    }
    static convertNodeCode(e) {
        var code = e.code;
        assert(code in ERRNO_CODES, `unexpected wx error code: ${code} (${e})`);
        return ERRNO_CODES[code];
    }
    static tryFSOperation(f) {
        try {
            return f();
        } catch (e) {
            if (!e.code) throw e;
            // node under windows can return code 'UNKNOWN' here:
            // https://github.com/emscripten-core/emscripten/issues/15468
            if (e.code === 'UNKNOWN') throw new FS.ErrnoError(28);
            throw new FS.ErrnoError(NODEFS.convertNodeCode(e));
        }
    }
    static mount(mount) {
        return NODEFS.createNode(null, '/', NODEFS.getMode(mount.opts.root), 0);
    }
    static createNode(parent, name, mode, dev) {
        if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
            throw new FS.ErrnoError(28);
        }
        var node = FS.createNode(parent, name, mode);
        node.node_ops = NODEFS.node_ops;
        node.stream_ops = NODEFS.stream_ops;
        return node;
    }
    static getMode(path) {
        return NODEFS.tryFSOperation(() => {
            var mode = fs.statSync(path, false).mode;
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
        return PATH.join(...parts);
    }
    static flagsForNode(flags) {
        flags &= ~2097152; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~2048; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~32768; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~524288; // Some applications may pass it; it makes no sense for a single process.
        flags &= ~65536; // Node.js doesn't need this passed in, it errors.
        var newFlags = 0;
        for (var k in NODEFS.flagsForNodeMap) {
            if (flags & k) {
                newFlags |= NODEFS.flagsForNodeMap[k];
                flags ^= k;
            }
        }
        if (flags) {
            throw new FS.ErrnoError(28);
        }
        return newFlags;
    }
    static getattr(func, node) {
        var stat = NODEFS.tryFSOperation(func);
        return {
            dev: stat.dev,
            ino: node.id,
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
    }
    static setattr(arg, node, attr, chmod, utimes, truncate, stat) {
        NODEFS.tryFSOperation(() => {
            if (attr.mode !== undefined) {
                var mode = attr.mode;
                chmod(arg, mode);
                // update the common node structure mode as well
                node.mode = attr.mode;
            }
            if (typeof (attr.atime ?? attr.mtime) === "number") {
                // Unfortunately, we have to stat the current value if we don't want
                // to change it. On top of that, since the times don't round trip
                // this will only keep the value nearly unchanged not exactly
                // unchanged. See:
                // https://github.com/nodejs/node/issues/56492
                var atime = new Date(attr.atime ?? stat(arg).atime);
                var mtime = new Date(attr.mtime ?? stat(arg).mtime);
                utimes(arg, atime, mtime);
            }
            if (attr.size !== undefined) {
                truncate(arg, attr.size);
            }
        });
    }
    static node_ops = {
        getattr(node) {
            var path = NODEFS.realPath(node);
            return NODEFS.getattr(() => fs.statSync(path,false), node);
        },
        setattr(node, attr) {
            var path = NODEFS.realPath(node);
            if (attr.mode != null && attr.dontFollow) {
                throw new FS.ErrnoError(52);
            }
            NODEFS.setattr(path, node, attr, fs.chmodSync, fs.utimesSync, fs.truncateSync, fs.lstatSync);
        },
        lookup(parent, name) {
            var path = PATH.join2(NODEFS.realPath(parent), name);
            var mode = NODEFS.getMode(path);
            return NODEFS.createNode(parent, name, mode);
        },
        mknod(parent, name, mode, dev) {
            var node = NODEFS.createNode(parent, name, mode, dev);
            // create the backing node for this in the fs root as well
            var path = NODEFS.realPath(node);
            NODEFS.tryFSOperation(() => {
                if (FS.isDir(node.mode)) {
                    fs.mkdirSync(path, node.mode);
                } else {
                    fs.writeFileSync(path, '', { mode: node.mode });
                }
            });
            return node;
        },
        rename(oldNode, newDir, newName) {
            var oldPath = NODEFS.realPath(oldNode);
            var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
            try {
                FS.unlink(newPath);
            } catch (e) { }
            NODEFS.tryFSOperation(() => fs.renameSync(oldPath, newPath));
            oldNode.name = newName;
        },
        unlink(parent, name) {
            var path = PATH.join2(NODEFS.realPath(parent), name);
            NODEFS.tryFSOperation(() => fs.unlinkSync(path));
        },
        rmdir(parent, name) {
            var path = PATH.join2(NODEFS.realPath(parent), name);
            NODEFS.tryFSOperation(() => fs.rmdirSync(path));
        },
        readdir(node) {
            var path = NODEFS.realPath(node);
            return NODEFS.tryFSOperation(() => fs.readdirSync(path));
        },
        symlink(parent, newName, oldPath) {
            var newPath = PATH.join2(NODEFS.realPath(parent), newName);
            NODEFS.tryFSOperation(() => fs.symlinkSync(oldPath, newPath));
        },
        readlink(node) {
            var path = NODEFS.realPath(node);
            return NODEFS.tryFSOperation(() => fs.readlinkSync(path));
        },
        statfs(path) {
            var stats = NODEFS.tryFSOperation(() => fs.statfsSync(path));
            // Node.js doesn't provide frsize (fragment size). Set it to bsize (block size)
            // as they're often the same in many file systems. May not be accurate for all.
            stats.frsize = stats.bsize;
            return stats;
        },
    };
    static stream_ops = {
        getattr(stream) {
            return NODEFS.getattr(() => fs.fstatSync(stream.nfd), stream.node);
        },
        setattr(stream, attr) {
            NODEFS.setattr(stream.nfd, stream.node, attr, fs.fchmodSync, fs.futimesSync, fs.ftruncateSync, fs.fstatSync);
        },
        open(stream) {
            var path = NODEFS.realPath(stream.node);
            NODEFS.tryFSOperation(() => {
                stream.shared.refcount = 1;
                stream.nfd = fs.openSync(path, NODEFS.flagsForNode(stream.flags));
            });
        },
        close(stream) {
            NODEFS.tryFSOperation(() => {
                if (stream.nfd && --stream.shared.refcount === 0) {
                    fs.closeSync(stream.nfd);
                }
            });
        },
        dup(stream) {
            stream.shared.refcount++;
        },
        read(stream, buffer, offset, length, position) {
            return NODEFS.tryFSOperation(() =>
                fs.readSync(stream.nfd, new Int8Array(buffer.buffer, offset, length), 0, length, position)
            );
        },
        write(stream, buffer, offset, length, position) {
            return NODEFS.tryFSOperation(() =>
                fs.writeSync(stream.nfd, new Int8Array(buffer.buffer, offset, length), 0, length, position)
            );
        },
        llseek(stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position;
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    NODEFS.tryFSOperation(() => {
                        var stat = fs.fstatSync(stream.nfd);
                        position += stat.size;
                    });
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

            NODEFS.stream_ops.read(stream, HEAP8, ptr, length, position);
            return { ptr, allocated: true };
        },
        msync(stream, buffer, offset, length, mmapFlags) {
            NODEFS.stream_ops.write(stream, buffer, 0, length, offset, false);
            // should we check if bytesWritten and length are the same?
            return 0;
        }
    };
}

export default NODEFS;