import "./src/weapp-adapter/index.js";
import { EngineLoader } from './dmloader';

EngineLoader.load("canvas", "flappybird", function () {
    require("flappybird_wasm.js")
});