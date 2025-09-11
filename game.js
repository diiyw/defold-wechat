import "./src/weapp-adapter/index.js";
import { EngineLoader } from './dmloader';
try {
  EngineLoader.load("canvas", "Music", function () {
    console.log('开始加载Defold引擎...');
    require("File_wasm.js")
  });
} catch (error) {
  console.log(error)
}
