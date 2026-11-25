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
    const sources = Object.fromEntries(Object.keys(manifest.files).filter(path => !path.endsWith('.dlm') && !path.startsWith('assets/navigation/')).sort().map(path => [path, manifest.files[path]]))
    const hash = require('node:crypto').createHash('sha256').update(JSON.stringify(sources)).digest('hex')
    assert.equal(manifest.contentId, hash)
})

test('baked paving matches live layout across region borders', () => {
    const {compileTerrainRenderData} = require('../build/terrainRenderAssets.ts')
    const {decodeTerrainRenderData, visitBakedPaving} = require('../src/babylon/world/terrainRenderData.ts')
    const {visitPavingStones} = require('../src/babylon/world/stonePathLayout.ts')
    const {stone, beige, snow} = codec.TileFlags
    const width = 26, depth = 15
    const palette = [0, stone, beige | snow].map(flags => ({height: 4, type: 4, flags, ore: 0, originalHeight: 4, originalType: 4}))
    const indices = Uint32Array.from({length: width * depth}, (_, i) => {
        const x = Math.floor(i / depth), z = i % depth
        return x >= 9 && x <= 20 && z >= 10 && z <= 13 ? (x >= 17 ? 2 : 1) : 0
    })
    const tileAt = (x, z) => {
        if (x < 0 || x >= width || z < 0 || z >= depth) return undefined
        const tile = palette[indices[x * depth + z]]
        return {...tile, stonePath: !!(tile.flags & stone), beigeStonePath: !!(tile.flags & beige)}
    }
    const binary = compileTerrainRenderData(codec.encodeCompiledMap({width, depth, palette, indices}))
    const data = decodeTerrainRenderData(binary, width, depth)
    const key = (x, z) => x * depth + z
    const expected = [], actual = []
    visitPavingStones(tileAt, (x, z) => tileAt(x, z)?.height, p => {
        const x = Math.round((p.left + p.right) / 2), z = Math.round((p.front + p.back) / 2)
        for (const field of Object.keys(p)) if (field !== 'beige') p[field] = Math.fround(p[field])
        expected.push({key: key(x, z), stone: p})
    }, {minX: 0, minZ: 0, maxX: width - 1, maxZ: depth - 1})
    for (let x = 0; x < width; x += 12) for (let z = 0; z < depth; z += 12) {
        const bounds = {minX: x, minZ: z, maxX: Math.min(width - 1, x + 11), maxZ: Math.min(depth - 1, z + 11)}
        visitBakedPaving(data, bounds, (p, tx, tz) => actual.push({key: key(tx, tz), stone: p}))
    }
    assert.deepEqual(actual.sort((a, b) => a.key - b.key), expected.sort((a, b) => a.key - b.key))
    assert.ok(actual.some(({stone: p}) => p.beige))
    assert.ok(actual.some(({stone: p}) => p.left < 11.5 && p.right > 11.5))
})

test('baked atlas patches require every rotated cell within the submitted region', () => {
    const {terrainCoverLayout, visitTerrainAtlasPlacements, visitBakedTerrainAtlasPatches} =
        require('../src/babylon/world/terrainAtlasPlacement.ts')
    for (const size of [2, 3]) {
        const turns = new Set()
        const tiles = new Map(Array.from({length: size * size}, (_, tile) => [tile, 4]))
        for (let originX = 0; originX < 16; originX++) {
            const codes = new Uint16Array(tiles.size)
            const expected = []
            visitTerrainAtlasPlacements(new Map(tiles), size, size, originX, 17, terrainCoverLayout, false, false,
                (tile, x, z, height, code) => {
                    codes[tile] = code
                    expected.push([tile, x, z, height, code])
                })
            turns.add(expected[0][4] & 3)
            const readCode = (x, z) => codes[x * size + z]
            const remaining = new Map(tiles)
            const visited = [], patches = []
            visitBakedTerrainAtlasPatches(remaining, size, size, terrainCoverLayout, () => true, readCode,
                (...tile) => visited.push(tile), (...patch) => patches.push(patch))
            assert.equal(remaining.size, 0)
            assert.deepEqual(visited.sort((a, b) => a[0] - b[0]), expected.sort((a, b) => a[0] - b[0]))
            assert.equal(patches.length, 1)
            assert.deepEqual(patches[0].slice(0, 4), [0, 0, 4, size])

            const clipped = new Map(tiles)
            const unexpectedPatch = () => assert.fail('Accepted an incomplete atlas patch')
            visitBakedTerrainAtlasPatches(clipped, size, size, terrainCoverLayout, x => x > 0, readCode,
                unexpectedPatch, unexpectedPatch)
            assert.deepEqual(clipped, tiles)
            codes[0] = 0
            visitBakedTerrainAtlasPatches(clipped, size, size, terrainCoverLayout, () => true, readCode,
                unexpectedPatch, unexpectedPatch)
            assert.deepEqual(clipped, tiles)
        }
        assert.equal(turns.size, 4)
    }
})

test('direct client terrain matches protocol decoding for all terrain variants', async () => {
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
        const direct = new WorldData(1024, compiled)
        const protocol = new WorldData(1024)
        assert.equal(direct.allChunksLoaded, true)
        assert.equal(direct.hasChunkAt(896, 896), true)
        for (const index of first.values()) {
            const x = Math.floor(index / compiled.depth), z = index % compiled.depth
            const blockMap = simulation.getBlockMapChunk(new core.Vector3(x, 0, z), 1)
            protocol.consumeMapChunk({x, z, blockMap})
            assert.deepEqual(direct.blockMap[x][z], protocol.blockMap[x][z], `World ${id}, ${x},${z}`)
            assert.equal(!!direct.planeBlockMap[x][z], !!protocol.planeBlockMap[x][z])
        }
        const untouched = direct.blockMap[1][1]
        direct.consumeMapUpdate([{x: 0, z: 0, data: '12:51:P:S::M'}])
        assert.equal(direct.blockMap[0][0].deepWater, true)
        assert.equal(direct.blockMap[0][0].height, 12)
        assert.equal(direct.blockMap[1][1], untouched)
    }
})
