const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join, resolve} = require('node:path')
const ts = require('typescript')
const server = resolve(__dirname, '../../../server/darkenlight_server')
require(join(server, 'node_modules/ts-node')).register({project: join(server, 'tsconfig.json'), transpileOnly: true})
const codec = require(join(server, 'src/runtime/compiledMap.ts'))
const {MapData} = require(join(server, 'src/world/mapData.ts'))

test('derived terrain does not change the source version used by existing saves', () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, '../public/world/manifest.json'), 'utf8'))
    const sources = Object.fromEntries(Object.keys(manifest.files).filter(path => !path.endsWith('.dlm')).sort().map(path => [path, manifest.files[path]]))
    const hash = require('node:crypto').createHash('sha256').update(JSON.stringify(sources)).digest('hex')
    assert.equal(manifest.contentId, hash)
})

test('direct client terrain matches protocol decoding for all terrain variants and Mining ranks', async () => {
    const core = await import('@babylonjs/core/index.js')
    const source = readFileSync(join(__dirname, '../src/data/worldDataManager.ts'), 'utf8')
    const exports = {}
    const dependencies = {
        '@babylonjs/core': core, '@game/runtime/compiledMap': codec,
        '@/local/worldBundle': {localWorldMaps: new Map()},
        '@/data/myPlayer': {MyPlayer: {}},
        '@/babylon/world/worldRenderer': {WorldRenderer: {renderWorld() {}}},
    }
    new Function('exports', 'require', ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText)(exports, name => dependencies[name] || {})
    const {WorldData} = exports
    for (const id of [1, 2]) {
        const compiled = codec.decodeCompiledMap(readFileSync(join(__dirname, `../public/world/assets/terrain/${id}.dlm`)))
        const simulation = new MapData(compiled)
        const first = new Map()
        compiled.indices.forEach((value, index) => { if (!first.has(value)) first.set(value, index) })
        for (const rank of [0, 1, 5, Infinity]) {
            const direct = new WorldData(1024, compiled, rank)
            const protocol = new WorldData(1024)
            assert.equal(direct.allChunksLoaded, true)
            assert.equal(direct.hasChunkAt(896, 896), true)
            for (const index of first.values()) {
                const x = Math.floor(index / compiled.depth), z = index % compiled.depth
                const blockMap = simulation.getBlockMapChunk(new core.Vector3(x, 0, z), 1, rank)
                protocol.consumeMapChunk({x, z, blockMap})
                assert.deepEqual(direct.blockMap[x][z], protocol.blockMap[x][z], `World ${id}, rank ${rank}, ${x},${z}`)
                assert.equal(!!direct.planeBlockMap[x][z], !!protocol.planeBlockMap[x][z])
            }
            const untouched = direct.blockMap[1][1]
            direct.consumeMapUpdate([{x: 0, z: 0, data: '12:51:P:S::M'}])
            assert.equal(direct.blockMap[0][0].deepWater, true)
            assert.equal(direct.blockMap[0][0].height, 12)
            assert.equal(direct.blockMap[1][1], untouched)
        }
    }
})
