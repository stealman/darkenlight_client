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
    const world = {worldParentNode: parent, block1: {matrices: [], uvData: []}}
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
    const dependencies = {
        '@babylonjs/core': core,
        '@/babylon/materials': {Materials: materials, MaterialEnum1: {WOOD_3: {uv: new core.Vector2()}, WOOD_PLANKS: {uv: new core.Vector2()}}, TerrainEnum1: {}},
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
            if (/staticSurfacePlanes|objects\/(specimens|woodenSignpost|walls)/.test(resolved)) return load(resolved)
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
        portals.forEach(portal => portal.render())
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
