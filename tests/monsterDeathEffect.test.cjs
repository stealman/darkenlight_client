const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')

function load(path, dependencies) {
    const source = readFileSync(join(__dirname, '../src', path), 'utf8')
    const compiled = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText
    const exports = {}
    new Function('exports', 'require', compiled)(exports, name => dependencies[name] || {})
    return exports
}

async function fixture() {
    const core = await import('@babylonjs/core/index.js')
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    const textures = []
    class TestTexture {
        constructor() {
            const texture = core.RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene)
            textures.push(texture)
            return texture
        }
    }
    const {GfxManager: gfx} = load('babylon/gfx/gfxManager.ts', {
        '@babylonjs/core': {...core, Texture: TestTexture},
    })
    const {Settings} = load('settings/settings.ts', {})
    const {MonsterModel} = load('babylon/monsters/monsterModel.ts', {
        '@babylonjs/core': core,
        '@/settings/settings': {Settings},
        '@/babylon/gfx/gfxManager': {GfxManager: gfx},
        '@/data/worldDataManager': {WorldDataManager: {getBlockOnPosition: () => ({type: 1})}},
        '@/babylon/world/terrainManager': {TerrainManager: {setParticleSplashColorByTerrainType(ps) {
            ps.color1.set(0.6, 0.5, 0.4, 1)
            ps.color2.set(0.5, 0.4, 0.3, 1)
            ps.colorDead.set(0.3, 0.3, 0.3, 0.3)
        }}},
        '@/babylon/scene/lights': {Lights: {indoor: false, daylightFactor: 0.5}},
    })
    const model = Object.assign(Object.create(MonsterModel.prototype), {
        parent: {pos: new core.Vector3(1, 2, 3)}, node: {position: new core.Vector3(1, 2, 3)}, modelRotation: 0,
    })
    gfx.initialize(scene)
    function frame(fps) {
        scene._animationRatio = 60 / fps
        scene._frameId++
        for (const system of gfx.deathParticleSystems) {
            // NullEngine cannot compile the WebGL shader. Exercise Babylon's
            // actual emission, lifetime and vertex-buffer updates headlessly.
            system.isReady = () => true
            system.animate()
            if (system.getActiveCount()) system.onBeforeDrawParticlesObservable.notifyObservers(null)
        }
    }
    function finish(fps) {
        for (let i = 0; i < fps * 4 && gfx.deathParticleSystems.some(system => system.isStarted()); i++) frame(fps)
        assert.ok(gfx.deathParticleSystems.every(system => !system.isStarted() && system.getActiveCount() === 0))
    }
    return {core, engine, scene, textures, gfx, Settings, model, frame, finish,
        dispose() {gfx.clear(); scene.dispose(); engine.dispose()}}
}

test('death bursts emit once at slow and fast FPS and reuse buffers, texture and emitter position', async () => {
    const f = await fixture()
    try {
        const firstSystem = f.gfx.deathParticleSystems[0]
        const emitter = firstSystem.emitter
        const buffer = firstSystem._vertexBuffer
        for (const [level, count] of [['LOW', 24], ['MEDIUM', 64], ['HIGH', 200]]) {
            f.Settings.setDetailLevel(level)
            for (const fps of [30, 60, 180]) {
                f.model.createDyingParticleEffect()
                f.frame(fps)
                assert.equal(firstSystem.getActiveCount(), count, `${level} at ${fps} FPS`)
                const sizeRatio = level === 'HIGH' ? 1 : 1.25
                assert.equal(firstSystem.minSize, 0.1 * sizeRatio)
                assert.equal(firstSystem.maxSize, 0.15 * sizeRatio)
                assert.ok(Math.abs(firstSystem.color1.r - 0.39) < 1e-6, 'night tint does not accumulate on reuse')
                f.frame(fps)
                assert.equal(firstSystem.getActiveCount(), count, 'no second batch')
                f.finish(fps)
                assert.equal(f.gfx.deathParticleSystems[0], firstSystem)
                assert.equal(firstSystem._vertexBuffer, buffer)
                assert.equal(firstSystem.emitter, emitter)
                assert.equal(firstSystem.emitter.equals(f.model.node.position), true)
                assert.equal(f.scene.particleSystems.length, 1)
                assert.equal(f.textures.length, 1)
                assert.equal(f.scene.transformNodes.length, 0)
                assert.equal(firstSystem.onBeforeDrawParticlesObservable.observers.filter(o => !o._willBeUnregistered).length, 0)
            }
        }
    } finally {f.dispose()}
})

test('simultaneous deaths have a bounded pool and clearing releases active systems and their shared texture', async () => {
    const f = await fixture()
    try {
        for (let i = 0; i < 20; i++) {
            f.model.node.position.x = i
            f.model.createDyingParticleEffect()
        }
        assert.equal(f.scene.particleSystems.length, 4)
        assert.deepEqual(f.gfx.deathParticleSystems.map(system => system.emitter.x), [0, 1, 2, 3])
        assert.equal(new Set(f.gfx.deathParticleSystems.map(system => system.particleTexture)).size, 1)
        f.finish(60)
        let textureDisposals = 0
        f.textures[0].onDisposeObservable.add(() => textureDisposals++)
        f.model.createDyingParticleEffect()
        f.gfx.clear()
        assert.equal(f.scene.particleSystems.length, 0)
        assert.equal(f.gfx.deathParticleSystems.length, 0)
        assert.equal(textureDisposals, 1)
        f.gfx.initialize(f.scene)
        f.model.createDyingParticleEffect()
        f.frame(60)
        assert.equal(f.gfx.deathParticleSystems[0].getActiveCount(), 64)
        f.finish(60)
    } finally {f.dispose()}
})
