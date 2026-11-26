const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join, posix} = require('node:path')
const ts = require('typescript')

test('banner UV variants and sign faces share one batch; portals share their blended batch', async () => {
    const core = await import('@babylonjs/core/index.js')
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    const parent = new core.TransformNode('world', scene)
    const materials = {
        staticSurfaceMaterial: new core.PBRMaterial('surfaces', scene),
        entrancePortalMaterial: new core.PBRMaterial('portals', scene),
    }
    const world = {
        worldParentNode: parent,
        block1: {matrices: [], uvData: []},
        addTerrainContactBlock(matrix, uv) {
            this.block1.matrices.push(matrix)
            this.block1.uvData.push(uv)
        },
        addWeatheredBlock(matrix, uv) {
            this.addTerrainContactBlock(matrix, uv)
        },
    }
    class Prefab {
        matrices = []; uvData = []
        constructor(mesh) { this.mesh = mesh }
        clearMatrices() { this.matrices = []; this.uvData = [] }
        setThinInstanceBuffers() { this.matrixBuffer = updateWorldInstanceBuffers(this.mesh, this.matrices, this.uvData) }
    }
    class BaseStaticObject {
        constructor(type, position, rotation, material, prefab) {
            Object.assign(this, {type, position, renderPosition: position.clone(), material, prefab})
        }
        getSizeX() { return 4 }
        getSizeZ() { return 2 }
    }
    const cache = new Map()
    const entranceRockUv = new core.Vector2(6.5, 4.5)
    const snowUv = new core.Vector2(4.5, 4.5)
    let entranceTerrain = [[{type: 3}]]
    const otherStone = {uv: new core.Vector2(0.5, 4.5)}
    const dependencies = {
        '@babylonjs/core': core,
        '@/babylon/materials': {Materials: materials, BLOCK_TOP_GLOW_U_OFFSET: 16, MaterialEnum1: {
            WOOD_3: {uv: new core.Vector2()}, WOOD_PLANKS: {uv: new core.Vector2()}, TERRAIN_ROCK: {uv: entranceRockUv},
            SNOW: {uv: snowUv},
            ROCK1: otherStone, ROCK1_BEIGE: otherStone, BRICK_RED: otherStone, BRICK_GRAY: otherStone,
            BRICK_BLACK: otherStone, BRICK_DARK_GRAY: otherStone,
        }},
        '@/data/worldDataManager': {WorldDataManager: {getBlockMap: () => entranceTerrain}},
        '@/data/myPlayer': {MyPlayer: {worldId: 1}},
        '@/babylon/scene/lights': {Lights: {addShadowCaster() {}, registerSharedLightMesh() {}, registerStaticLight() {}, unregisterStaticLight() {}}},
        '@/babylon/world/worldRenderer': {WorldRenderer: world, Prefab},
        '@/babylon/world/statics/objects/baseStaticObject': {BaseStaticObject},
        '@/babylon/scene/lighting/lightConfig': {getStaticLightLevel: () => 5, getStaticLightIntensityLevelFactor: () => 1, getStaticLightRangeLevelFactor: () => 1},
    }
    const load = path => {
        if (cache.has(path)) return cache.get(path)
        const source = readFileSync(join(__dirname, '../src', path + '.ts'), 'utf8')
        const exports = {}
        cache.set(path, exports)
        const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText
        new Function('exports', 'require', code)(exports, name => {
            if (dependencies[name]) return dependencies[name]
            const resolved = name.startsWith('.') ? posix.normalize(posix.join(posix.dirname(path), name)) : name.replace(/^@\//, '')
            if (resolved.endsWith('worldRenderer')) return {WorldRenderer: world, Prefab}
            if (resolved.endsWith('baseStaticObject')) return {BaseStaticObject}
            if (resolved.endsWith('taperedBlockBatch')) return {TaperedBlockBatch: {add: (matrix, uv) => world.addTerrainContactBlock(matrix, uv)}}
            if (/staticSurfacePlanes|staticBlockDamage|staticTerrainContact|staticWoodShape|staticVariation|palisadeWoodJoin|terrainRoofShape|objects\/(specimens|woodenSignpost|walls)/.test(resolved)) return load(resolved)
            return {}
        })
        return exports
    }
    const {updateWorldInstanceBuffers} = load('babylon/world/worldInstanceBuffers')
    const {Builder} = load('babylon/builder')
    world.block1.mesh = Builder.createWrappedBlock(scene, parent)
    world.block1.mesh.computeWorldMatrix(true)
    const {StaticSurfacePlanes, StaticSurfaceAtlas} = load('babylon/world/statics/staticSurfacePlanes')
    const {StandingBanner} = load('babylon/world/statics/objects/specimens')
    const {WoodenSignpost} = load('babylon/world/statics/objects/woodenSignpost')
    const {StoneEntrance} = load('babylon/world/statics/objects/walls')
    const {markJoinedStoneEdges} = load('babylon/world/statics/staticBlockDamage')
    try {
        const banners = Array.from({length: 10}, (_, bannerIndex) => new StandingBanner(403, new core.Vector3(bannerIndex, 0, 0), {bannerIndex}))
        banners.forEach(banner => banner.render())
        const signs = new WoodenSignpost(404, core.Vector3.Zero(), {signCount: 4})
        signs.render()
        assert.equal(new Set(banners.map(banner => banner.prefab)).size, 1)
        assert.equal(signs.prefab, banners[0].prefab)
        assert.deepEqual(banners[0].prefab.uvData.slice(0, 10).map(uv => uv.asArray()), Array.from({length: 10}, (_, i) => [i, 3]))
        assert.equal(signs.prefab.matrices.length, 18)
        assert.equal(signs.prefab.uvData.filter(uv => StaticSurfaceAtlas.inscriptions.includes(uv)).length, 8)
        // The two sides have opposite normals, so their lettering is readable from each side.
        const front = core.Vector3.TransformNormal(new core.Vector3(0, 0, -1), signs.prefab.matrices[10])
        const back = core.Vector3.TransformNormal(new core.Vector3(0, 0, -1), signs.prefab.matrices[11])
        assert.ok(core.Vector3.Dot(front, back) < 0)
        // Compare the actual rendered block world transform, including its mesh offset,
        // with each inscription face. This catches planes floating above the boards.
        for (let index = 0; index < 4; index++) {
            const board = world.block1.matrices[31 + index * 2]
                .multiply(world.block1.mesh.getWorldMatrix())
            const inverse = core.Matrix.Invert(board)
            for (let side = 0; side < 2; side++) {
                const face = signs.prefab.matrices[10 + index * 2 + side]
                const centre = core.Vector3.TransformCoordinates(core.Vector3.Zero(), face.multiply(inverse))
                assert.ok(Math.abs(centre.x) < 1e-5)
                assert.ok(Math.abs(centre.y) < 1e-5, 'inscription must be centred vertically on its board')
                assert.ok(Math.abs(Math.abs(centre.z) - 0.037 / 0.07) < 1e-5, 'inscription must sit just outside the board face')
                for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) {
                    const corner = core.Vector3.TransformCoordinates(new core.Vector3(x, y, 0), face.multiply(inverse))
                    assert.ok(Math.abs(corner.x) < 0.5 && Math.abs(corner.y) < 0.5, 'inscription must fit inside the board')
                }
            }
        }
        const originalSignUVs = signs.prefab.uvData.slice(10).map(uv => uv.asArray())
        assert.equal(new Set(originalSignUVs.map(uv => uv[0])).size, 3, 'use all three layouts across four boards')
        for (let index = 0; index < 4; index++) {
            assert.deepEqual(originalSignUVs[index * 2], originalSignUVs[index * 2 + 1], 'same layout on both sides')
        }
        const portals = ['+X', '-X', '+Z', '-Z'].map(facing => new StoneEntrance(281, core.Vector3.Zero(), core.Vector2.Zero(), {facing}))
        const beforePortals = world.block1.matrices.length
        portals.forEach(portal => portal.render())
        assert.equal(world.block1.matrices.length - beforePortals, 4 * 16)
        assert.ok(world.block1.uvData.slice(beforePortals).every(uv => uv === entranceRockUv))
        assert.equal(new Set(portals.map(portal => portal.prefab)).size, 1)
        assert.notEqual(portals[0].prefab, signs.prefab)
        assert.equal(StaticSurfacePlanes.all.size, 2)
        StaticSurfacePlanes.flush()
        assert.equal(signs.prefab.mesh.thinInstanceCount, 18)
        assert.equal(portals[0].prefab.mesh.thinInstanceCount, 4)
        portals[0].dispose()
        assert.equal(portals[1].prefab.mesh.isDisposed(), false)
        StaticSurfacePlanes.clear()
        StaticSurfacePlanes.flush()
        assert.equal(signs.prefab.mesh.isEnabled(), false)
        assert.equal(portals[0].prefab.mesh.isEnabled(), false)
        for (const portal of portals) {
            const sizeX = portal.getSizeX(), sizeZ = portal.getSizeZ()
            entranceTerrain = Array.from({length: sizeX}, () => Array.from({length: sizeZ}, () => ({type: 3})))
            // A single patch at the opposite corner covers the whole roof.
            entranceTerrain[sizeX - 1][sizeZ - 1] = {type: 3, snowed: true}
            const before = world.block1.matrices.length
            const snowyBlocks = new Map()
            world.staticTerrainContact = {addRoofSnow: (index, height) => snowyBlocks.set(index, height)}
            portal.render()
            assert.equal(world.block1.matrices.length - before, 17)
            assert.deepEqual([...snowyBlocks], [[before + 16, 3]])
            const {m} = world.block1.matrices[before + 16]
            assert.equal(m[0], sizeX)
            assert.equal(m[10], sizeZ)
            assert.ok(Math.abs(m[13] + m[5] / 2 - 3.5) < 1e-5)
            assert.equal(world.block1.uvData[before + 16], entranceRockUv)
            const joins = new Map()
            markJoinedStoneEdges(world.block1.matrices, world.block1.uvData, before, (index, mask) => joins.set(index, mask))
            // All four lower roof edges are backed by masonry. The four upper edges remain exposed.
            assert.equal(joins.get(before + 16), (1 << 0) | (1 << 1) | (1 << 8) | (1 << 10))
            world.staticTerrainContact = null
            const beforeLow = world.block1.matrices.length
            portal.render()
            assert.equal(world.block1.matrices.length - beforeLow, 17)
            assert.equal(world.block1.uvData.at(-1), snowUv)
        }
        const joinedWall = new Map()
        markJoinedStoneEdges([core.Matrix.Identity(), core.Matrix.Translation(0, 1, 0),
            core.Matrix.Translation(0, 2.05, 0)], Array(3).fill(entranceRockUv), 0,
            (index, mask) => joinedWall.set(index, mask))
        assert.deepEqual([...joinedWall], [
            [0, (1 << 2) | (1 << 3) | (1 << 9) | (1 << 11)],
            [1, (1 << 0) | (1 << 1) | (1 << 8) | (1 << 10)],
        ])
        StaticSurfacePlanes.clear()
        banners[0].render()
        StaticSurfacePlanes.flush()
        assert.equal(signs.prefab.mesh.thinInstanceCount, 1)
        StaticSurfacePlanes.clear()
        signs.render()
        assert.deepEqual(signs.prefab.uvData.map(uv => uv.asArray()), originalSignUVs, 'rebuild keeps layouts')
        StaticSurfacePlanes.clear()
        new WoodenSignpost(404, core.Vector3.Zero(), {signCount: 4}).render()
        assert.deepEqual(signs.prefab.uvData.map(uv => uv.asArray()), originalSignUVs, 'recreated object keeps layouts')
        const arrangements = new Set()
        for (let x = 0; x < 12; x++) {
            StaticSurfacePlanes.clear()
            new WoodenSignpost(404, new core.Vector3(x, 0, 3), {signCount: 4}).render()
            arrangements.add(signs.prefab.uvData.map(uv => uv.x).join(','))
        }
        assert.ok(arrangements.size > 1, 'different positions vary the arrangement')
    } finally { scene.dispose(); engine.dispose() }
    assert.equal(StaticSurfacePlanes.all.size, 0)
})

test('snow contact composes the stone shader without pre-existing fragment definitions', async () => {
    const core = await import('@babylonjs/core/index.js')
    const {PBRCustomMaterial} = await import('@babylonjs/materials/custom/pbrCustomMaterial.js')
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    try {
        const exports = {}
        const source = readFileSync(join(__dirname, '../src/babylon/world/statics/staticTerrainContact.ts'), 'utf8')
        const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText
        const dependencies = {
            '@babylonjs/core': core,
            '@/babylon/world/terrainTextureUrls': {terrainTextureUrls: {snow: '/images/terrain/snow-atlas.png'}},
            '@/babylon/world/terrainSurfaceShader': {
                configureTerrainNoiseTexture() {},
                terrainNoiseShader: '', terrainFringeShader: '', terrainContactSnowShader: '', terrainContactMossShader: '',
            },
        }
        new Function('exports', 'require', code)(exports, name => dependencies[name])
        const material = new PBRCustomMaterial('stoneAtlas', scene)
        material.Vertex_Definitions('attribute vec3 stonePosition1;')
        assert.equal(material.CustomParts.Fragment_Definitions, undefined)
        const contact = new exports.StaticTerrainContact(material, true)
        assert.match(material.CustomParts.Vertex_Definitions, /attribute vec3 stonePosition1;/)
        assert.match(material.CustomParts.Fragment_Definitions, /varying vec3 vStaticSnowContact;/)
        assert.doesNotMatch(material.CustomParts.Fragment_Definitions, /\bundefined\b/)
        contact.addRoofSnow(0, 3)
        contact.markJoinedEdges(0, 1283)
        contact.upload({thinInstanceSetBuffer: (_name, data) => {
            assert.deepEqual(Array.from(data.slice(0, 3)), [3, 0, 1283 * 32 - 1])
        }}, 1)
    } finally { scene.dispose(); engine.dispose() }
})
