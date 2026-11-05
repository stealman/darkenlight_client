import { Tools } from '@babylonjs/core/Misc/tools'
import { modelAssetUrl } from './modelAssetUrl'

// Babylon loads both explicit textures and glTF dependencies through fileTools.
// Install once for the game and offline previews, before either starts loading.
const preprocessUrl = Tools.PreprocessUrl
const preprocessScript = Tools.ScriptPreprocessUrl
Tools.PreprocessUrl = url => modelAssetUrl(preprocessUrl(url))
Tools.ScriptPreprocessUrl = url => modelAssetUrl(preprocessScript(url))
