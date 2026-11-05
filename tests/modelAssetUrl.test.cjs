const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { createHash } = require('node:crypto')
const { test } = require('node:test')
const ts = require('typescript')
const { collectModelAssets } = require('../build/modelAssets.cjs')
const root = path.resolve(__dirname, '..')
const assets = collectModelAssets(path.join(root, 'public/models'))
const context = { exports: {}, __MODEL_ASSET_URLS__: assets.urls, location: { origin: 'https://darkenlight.net' } }
const compile = file => ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
vm.runInNewContext(compile('src/babylon/modelAssetUrl.ts'), context)

test('all model resources use content-hashed URLs, replacing manual dates without changing external URLs', () => {
    for (const url of ['/models/monsters/skeleton.gltf', '/models/steve/human_male.glb', '/models/equip/armors/plate_armor.jpg', '/models/draco/draco_decoder_gltf.wasm']) {
        const target = context.exports.modelAssetUrl(url)
        assert.match(target, /^\/model-assets\/.*\.[a-f0-9]{16}\.[a-z0-9]+$/)
        assert.equal(context.exports.modelAssetUrl(url + '?v=old'), target)
        assert.equal(context.exports.modelAssetUrl('https://darkenlight.net' + url), target)
        assert.equal(context.exports.modelAssetUrl(target), target)
        assert.equal(context.exports.modelAssetUrl('https://other.example' + url), 'https://other.example' + url)
    }
    for (const url of ['data:abc', 'blob:abc', '/missing.glb']) assert.equal(context.exports.modelAssetUrl(url), url)
    for (const asset of assets.files) {
        const hash = createHash('sha256').update(asset.source).digest('hex').slice(0, 16)
        assert.ok(asset.fileName.includes(`.${hash}.`))
    }
})

test('only changed files change URLs, and glTF references follow changed textures and buffers', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkenlight-assets-test-'))
    try {
        fs.writeFileSync(path.join(dir, 'mesh.bin'), 'mesh')
        fs.writeFileSync(path.join(dir, 'tex.png'), 'texture-v1')
        fs.writeFileSync(path.join(dir, 'model.gltf'), JSON.stringify({ buffers: [{ uri: 'mesh.bin' }], images: [{ uri: 'tex.png' }, { uri: 'data:abc' }] }))
        const first = collectModelAssets(dir)
        fs.utimesSync(path.join(dir, 'mesh.bin'), new Date(), new Date())
        assert.deepEqual(collectModelAssets(dir).urls, first.urls)
        fs.writeFileSync(path.join(dir, 'tex.png'), 'texture-v2')
        const second = collectModelAssets(dir)
        assert.equal(first.urls['/models/mesh.bin'], second.urls['/models/mesh.bin'])
        assert.notEqual(first.urls['/models/tex.png'], second.urls['/models/tex.png'])
        assert.notEqual(first.urls['/models/model.gltf'], second.urls['/models/model.gltf'])
        const model = JSON.parse(second.files.find(f => f.url === second.urls['/models/model.gltf']).source)
        const modelUrl = 'https://assets.test' + second.urls['/models/model.gltf']
        assert.equal(new URL(model.images[0].uri, modelUrl).pathname, second.urls['/models/tex.png'])
        assert.equal(new URL(model.buffers[0].uri, modelUrl).pathname, second.urls['/models/mesh.bin'])
        assert.ok(!model.images[0].uri.startsWith('/'), 'Babylon concatenates dependency URIs to the model directory')
        assert.equal(model.images[1].uri, 'data:abc')
        fs.unlinkSync(path.join(dir, 'mesh.bin'))
        assert.throws(() => collectModelAssets(dir), /Missing model dependency/)
    } finally { fs.rmSync(dir, { recursive: true }) }
})

test('rewriting GLB references preserves chunk lengths, alignment and binary payload', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkenlight-glb-test-'))
    try {
        const json = Buffer.from(JSON.stringify({ images: [{ uri: 'tex.png' }] }))
        const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20)
        json.copy(padded)
        const header = Buffer.alloc(20)
        header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4)
        header.writeUInt32LE(20 + padded.length + 12, 8)
        header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
        const tail = Buffer.from([4, 0, 0, 0, 0x42, 0x49, 0x4e, 0, 1, 2, 3, 4])
        fs.writeFileSync(path.join(dir, 'model.glb'), Buffer.concat([header, padded, tail]))
        fs.writeFileSync(path.join(dir, 'tex.png'), 'texture')
        const result = collectModelAssets(dir)
        const out = result.files.find(f => f.url === result.urls['/models/model.glb']).source
        assert.equal(out.readUInt32LE(8), out.length)
        const length = out.readUInt32LE(12)
        assert.equal(length % 4, 0)
        assert.deepEqual(out.subarray(20 + length), tail)
        const uri = JSON.parse(out.subarray(20, 20 + length)).images[0].uri
        assert.equal(new URL(uri, 'https://assets.test' + result.urls['/models/model.glb']).pathname, result.urls['/models/tex.png'])
    } finally { fs.rmSync(dir, { recursive: true }) }
})

test('Babylon hooks cover implicitly loaded textures and scripts', () => {
    const Tools = { PreprocessUrl: url => url, ScriptPreprocessUrl: url => url }
    vm.runInNewContext(compile('src/babylon/installModelAssetUrls.ts'), {
        exports: {}, require: name => name.includes('tools') ? { Tools } : context.exports,
    })
    assert.equal(Tools.PreprocessUrl('/models/monsters/skeleton.png'), assets.urls['/models/monsters/skeleton.png'])
    assert.equal(Tools.ScriptPreprocessUrl('/models/draco/draco_decoder_gltf.js'), assets.urls['/models/draco/draco_decoder_gltf.js'])
})
