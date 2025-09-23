
const wxFs = wx.getFileSystemManager();

var NODEFS = {
    mount(mount) {
        return NODEFS.createNode(null, "/", 16895, 0);
    },
    createNode(parent, name, mode, dev) {
        var node = FS.createNode(parent, name, mode, dev);
        node.atime = node.mtime = node.ctime = Date.now();
        node.node_ops = NODEFS.node_ops;
        node.stream_ops = NODEFS.stream_ops;
        return node;
    },
    getMode(parent, name) {
        const stats = wxFs.statSync(NODEFS.realPath(parent, name));
        var mode = stats.isDirectory() ? 16877 : 33188; // 目录或文件的默认权限
        return mode ?? -1;
    },
    realPath(node, name) {
        var parts = [name];
        while (node.parent !== node) {
            parts.push(node.name);
            node = node.parent;
        }
        parts.push(node.mount.opts.root);
        parts.push(wx.env.USER_DATA_PATH);
        parts.reverse();
        const path = parts.join('/');
        console.log(path);
        return path;
    },
    node_ops: {
        getattr(node) {
            var attr = {};
            attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
            attr.ino = node.id;
            attr.mode = node.mode;
            attr.nlink = 1;
            attr.uid = 0;
            attr.gid = 0;
            attr.rdev = node.rdev;
            if (FS.isDir(node.mode)) {
                attr.size = 4096;
            } else if (FS.isFile(node.mode)) {
                attr.size = node.usedBytes;
            } else if (FS.isLink(node.mode)) {
                attr.size = node.link.length;
            } else {
                attr.size = 0;
            }
            attr.atime = new Date(node.atime);
            attr.mtime = new Date(node.mtime);
            attr.ctime = new Date(node.ctime);
            attr.blksize = 4096;
            attr.blocks = Math.ceil(attr.size / attr.blksize);
            return attr;
        },
        setattr(node, attr) {
            for (
                var _i = 0, _arr = ["mode", "atime", "mtime", "ctime"];
                _i < _arr.length;
                _i++
            ) {
                var key = _arr[_i];
                if (attr[key] != null) {
                    node[key] = attr[key];
                }
            }
        },
        lookup(parent, name) {
            const mode = NODEFS.getMode(parent, name);
            return NODEFS.createNode(parent, name, mode);
        },
        mknod(parent, name, mode, dev) {
            return NODEFS.createNode(parent, name, mode, dev);
        },
        rename(old_node, new_dir, new_name) {
            wxFs.renameSync(NODEFS.realPath(old_node), NODEFS.realPath(new_dir, new_name));
        },
        unlink(parent, name) {
            wxFs.unlinkSync(NODEFS.realPath(parent, name));
        },
        rmdir(parent, name) {
            wxFs.rmdirSync(NODEFS.realPath(parent, name));
        },
        readdir(node) {
            return wxFs.readdir(NODEFS.realPath(node, ''));
        },
        symlink(parent, newname, oldpath) {
            var node = NODEFS.createNode(parent, newname, 511 | 40960, 0);
            node.link = oldpath;
            return node;
        },
        readlink(node) {
            if (!FS.isLink(node.mode)) {
                throw new FS.ErrnoError(28);
            }
            return node.link;
        },
    },
    stream_ops: {
        open(stream) {
            var path = NODEFS.realPath(stream.node, '');
            stream.path = path;
            stream.shared.refcount = 1;
            // 微信小游戏中不需要显式打开文件描述符
            // 使用文件路径作为标识
            stream.fd = path;
        },
        close(stream) {
            if (stream.fd && --stream.shared.refcount === 0) {
                // 微信小游戏中不需要显式关闭文件
                stream.fd = null;
            }
        },
        read(stream, buffer, offset, length, position) {
            var result = wxFs.readSync({
                fd: stream.fd,
                arrayBuffer: buffer.buffer, offset: offset, length: length, position: position
            });
            return result.bytesRead;
        },
        write(stream, buffer, offset, length, position, canOwn) {
            // 使用微信小游戏同步API写入文件
            wxFs.writeSync({
                fd: stream.fd, data: buffer,
                position: position,
                length: length,
                offset: offset
            });

            return length; // 返回写入的字节数
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
    },
};

export default NODEFS;