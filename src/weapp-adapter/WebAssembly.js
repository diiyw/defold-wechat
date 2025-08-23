
class RuntimeError {
    constructor(e) {
        throw e
    }
}

WXWebAssembly.RuntimeError = RuntimeError

export default WXWebAssembly;