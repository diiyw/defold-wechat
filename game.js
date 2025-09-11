import "./src/weapp-adapter/index.js";
import { EngineLoader } from './dmloader';
try {
  // TODO 这里测试indexedDB
  EngineLoader.load("canvas", "File", function () {
    console.log('开始加载Defold引擎...');
    require("File_wasm.js")
  });
} catch (error) {
  console.log(error)
}
