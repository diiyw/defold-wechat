function GetUserPersistentDataRoot() {
    return wx.env.USER_DATA_PATH;
}

export {
    GetUserPersistentDataRoot
}