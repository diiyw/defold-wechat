class FS {

    wxFs;

    constructor() {
        this.wxFs = wx.getFileSystemManager();
    }

    mkdir(dir) {
        console.log("mkdir", dir);
    }

    write() {
        console.log("write");
    }

    close() {
        this.wxFs.closeSync({
            fd: fd
        });
    }

    chdir() {
        console.log("chdir");
    }

    mount() {
        console.log("mount");
    }

    syncfs() {
        console.log("syncfs");
    }

    stat() {
        console.log("stat");
    }

    open(path, flags) {
        const fd = this.wxFs.openSync({
            filePath: `${wx.env.USER_DATA_PATH}/${path}`,
            flag: flags
        })
        return fd
    }

    mmap() {
        console.log("mmap");
    }

    createPreloadedFile(parent, path, data, canRead, canWrite) {
        this.wxFs.writeFileSync(`${wx.env.USER_DATA_PATH}/${parent}/${path}`, data.buffer, "binary");
    }

    staticInit() {
        console.log("mmap");
    }
}

export default new FS()