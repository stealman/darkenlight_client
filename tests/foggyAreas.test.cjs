const assert = require('node:assert/strict')
const {test} = require('node:test')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

test('fog uses camera bounds and preserves unchanged systems across visibility and GM changes', async () => {
    const b = await import('@babylonjs/core/index.js')
    const map = Array.from({length: 1024}, () => Array(1024).fill({totalHeight: 0}))
    const settings = {isDetalLevelHigh: () => true}
    const mocks = {
        '@babylonjs/core': b,
        '@/data/worldDataManager': {WorldDataManager: {getBlockMap: () => map}},
        '@/utils/viewport': {ViewportManager: {viewPortInitialized: true}},
        '@/settings/settings': {Settings: settings},
        '@/babylon/scene/lights': {Lights: {indoor: false, daylightFactor: 1}},
        vue: {reactive: value => value},
    }
    const context = {exports: {}, require: name => {
        assert.ok(name in mocks, `unexpected dependency ${name}`)
        return mocks[name]
    }}
    const source = fs.readFileSync('src/babylon/world/foggyAreaManager.ts', 'utf8')
        .replace(/if \(import\.meta\.hot\) \{[\s\S]*$/, '')
    vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    }}).outputText, context)
    const manager = context.exports.FoggyAreaManager
    const engine = new b.NullEngine({renderWidth: 1920, renderHeight: 1080})
    const scene = new b.Scene(engine)
    scene.fogMode = b.Scene.FOGMODE_LINEAR
    scene.fogEnd = 50
    try {
        const player = new b.TransformNode('player', scene)
        player.position.set(911, 0, 934)
        const camera = new b.FreeCamera('camera', new b.Vector3(-12, 12, -12), scene)
        camera.setTarget(new b.Vector3(0, -2, 0))
        camera.parent = player
        scene.activeCamera = camera
        manager.scene = scene
        const created = []
        manager.createSystem = area => {
            const system = {area, disposed: false, dispose() {this.disposed = true},
                color1: new b.Color4(), color2: new b.Color4(), colorDead: new b.Color4()}
            created.push(system)
            return system
        }
        const local = {id: 2, x: 917, z: 934, width: 35, depth: 20, rotation: 0, intensity: 10}
        const distant = {id: 1, x: 996, z: 918, width: 50, depth: 50, rotation: 0, intensity: 3}
        manager.setAreas([distant, local])
        assert.equal(manager.systems.has(1), false, 'distant fog is outside actual camera bounds')
        const original = manager.systems.get(2).particles
        for (const x of [912, 913, 914, 913, 912, 911]) {
            player.position.x = x
            player.computeWorldMatrix(true)
            camera.getViewMatrix(true)
            manager.refreshVisibleAreas()
            assert.equal(manager.systems.has(1), false)
            assert.equal(manager.systems.get(2).particles, original)
        }
        // With a longer night-time range, crossing a visibility boundary
        // may add another area, but the existing clouds must retain identity.
        scene.fogEnd = 60
        player.position.x = 920
        player.computeWorldMatrix(true)
        camera.getViewMatrix(true)
        manager.refreshVisibleAreas()
        assert.equal(manager.systems.has(1), true)
        const distantSystem = manager.systems.get(1).particles
        assert.equal(manager.systems.get(2).particles, original)
        player.position.x = 911
        player.computeWorldMatrix(true)
        camera.getViewMatrix(true)
        manager.refreshVisibleAreas()
        assert.equal(distantSystem.disposed, true)
        assert.equal(manager.systems.get(2).particles, original)
        scene.fogEnd = 50
        // A neighbouring visible area can enter, change and leave independently.
        const neighbour = {...local, id: 3, x: 925}
        manager.applyChange(neighbour, false)
        const neighbourSystem = manager.systems.get(3).particles
        assert.equal(manager.systems.get(2).particles, original)
        manager.applyChange({...neighbour, intensity: 4}, false)
        assert.equal(neighbourSystem.disposed, true)
        assert.equal(original.disposed, false)
        manager.applyChange(neighbour, true)
        assert.equal(manager.systems.has(3), false)
        assert.equal(manager.systems.get(2).particles, original)
        manager.setAreas([local, distant])
        assert.equal(manager.systems.get(2).particles, original, 'list reordering preserves particles')
        const planes = b.Frustum.GetPlanes(camera.getTransformationMatrix())
        assert.equal(manager.isAreaVisible({...local, x: 850, z: 850}, planes), false, 'behind camera')
        assert.equal(manager.isAreaVisible({...local, width: 5, depth: 60, rotation: 90}, planes), true)
        settings.isDetalLevelHigh = () => false
        manager.refreshVisibleAreas()
        assert.equal(original.disposed, true)
        assert.equal(manager.systems.size, 0)
        settings.isDetalLevelHigh = () => true
        manager.refreshVisibleAreas()
        assert.ok(manager.systems.size > 0)
        manager.clearWorld()
        assert.equal(manager.systems.size, 0)
        assert.equal(manager.areas.length, 0)
        assert.ok(created.every(system => system.disposed))
    } finally {
        engine.dispose()
    }
})

