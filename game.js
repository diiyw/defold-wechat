import "./src/weapp-adapter/index.js";
import { EngineLoader } from './dmloader';

try {
  EngineLoader.load("canvas", "Colorslide", function () {
    require("Colorslide_wasm.js")
  });
} catch (error) {
  console.log(error)
}
