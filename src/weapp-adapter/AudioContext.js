/**
 * 微信小游戏 WebAudioContext 适配器
 * 将标准 Web Audio API 适配到微信小游戏环境
 */
class AudioContext {
    constructor(options = {}) {
        this._wxAudioContext = wx.createWebAudioContext();
    }

    /**
     * 获取采样率
     */
    get sampleRate() {
        return this._wxAudioContext.sampleRate;
    }

    /**
     * 获取当前状态
     */
    get state() {
        return this._wxAudioContext.state;
    }

    /**
     * 获取当前时间
     */
    get currentTime() {
        return this._wxAudioContext.currentTime;
    }

    /**
     * 获取目标节点
     */
    get destination() {
        return this._wxAudioContext.destination;
    }

    /**
     * 设置状态改变事件处理器
     */
    onstatechanged(handler) {
        return this._wxAudioContext.onstatechanged(handler);
    }

    /**
     * 恢复音频上下文
     */
    resume() {
        return this._wxAudioContext.resume();
    }

    /**
     * 暂停音频上下文
     */
    suspend() {
        return this._wxAudioContext.suspend();
    }

    /**
     * 关闭音频上下文
     */
    close() {
        return this._wxAudioContext.close();
    }

    /**
     * 创建音频缓冲区
     */
    createBuffer(numberOfChannels, length, sampleRate) {
        return this._wxAudioContext.createBuffer(numberOfChannels, length, sampleRate);
    }

    /**
     * 创建缓冲区源节点
     */
    createBufferSource() {
        return this._wxAudioContext.createBufferSource();
    }

    /**
     * 创建增益节点
     */
    createGain() {
        return this._wxAudioContext.createGain();
    }
}

export default AudioContext;