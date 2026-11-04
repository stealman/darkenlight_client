const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')

function loadModule(path, dependencies) {
    const source = readFileSync(join(__dirname, '../src', path), 'utf8')
    const compiled = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText
    const exports = {}
    new Function('exports', 'require', compiled)(exports, name => dependencies[name] || {})
    return exports
}

test('medium enables outdoor shadows for local hand models without splitting shared batches', async () => {
    const core = await import('@babylonjs/core/index.js')
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    const {Settings} = loadModule('settings/settings.ts', {})
    const shadowCasters = new Set()
    const {EquipManager, EquipItemType, EquipItem} = loadModule('babylon/item/equipManager.ts', {
        '@babylonjs/core': core,
        '@/settings/settings': {Settings},
        '@/babylon/scene/lights': {Lights: {
            shadow: {
                addShadowCaster(mesh) {shadowCasters.add(mesh)},
                removeShadowCaster(mesh) {shadowCasters.delete(mesh)},
            },
        }},
    })
    const {CharacterModel} = loadModule('babylon/character/characterModel.ts', {
        '@babylonjs/core': core,
        '@/settings/settings': {Settings},
        '@/babylon/item/equipManager': {EquipManager},
    })
    try {
        const source = new EquipItemType({id: 10, matCols: 1, matRows: 1, resolveMaterialAtlasIndex: () => 0})
        source.mesh = core.MeshBuilder.CreateBox('sharedEquipment', {}, scene)
        source.mesh.material = new core.StandardMaterial('sharedMaterial', scene)
        source.mesh.setEnabled(false)
        source.castsShadows = true
        const meshCount = scene.meshes.length
        const equip = (level, mine, slot) => {
            Settings.setDetailLevel(level)
            const model = Object.create(CharacterModel.prototype)
            model.parent = {isMyChar: () => mine}
            model.equipSet = new Map()
            const item = new EquipItem(source, 0, model, null, null, null, null)
            model.addEquippedItem(slot, item)
            return item
        }
        const peer = equip('MEDIUM', false, 'WEAPON')
        EquipManager.onFrame()
        assert.equal(shadowCasters.has(source.mesh), false)
        const mine = equip('MEDIUM', true, 'WEAPON')
        mine.position.x = 5
        EquipManager.onFrame()
        assert.equal(mine.type, source)
        assert.equal(shadowCasters.has(source.mesh), true)
        assert.equal(peer.type, source)
        assert.equal(source.instanceBuffer[12], 0)
        assert.equal(source.instanceBuffer[28], 5)
        assert.equal(source.mesh.thinInstanceCount, 2)
        assert.equal(scene.meshes.length, meshCount)
        const shield = equip('MEDIUM', true, 'SHIELD')
        assert.equal(shield.type, source)
        for (const [level, local, slot] of [
            ['LOW', true, 'WEAPON'], ['HIGH', true, 'WEAPON'],
            ['MEDIUM', false, 'SHIELD'], ['MEDIUM', true, 'BODY'],
        ]) {
            const item = equip(level, local, slot)
            assert.equal(item.type, source)
            EquipManager.removeEquippedItem(item)
        }
        Settings.setDetailLevel('MEDIUM')
        EquipManager.removeEquippedItem(mine)
        assert.equal(shadowCasters.has(source.mesh), true, 'the equipped shield still needs the shared model')
        EquipManager.removeEquippedItem(shield)
        EquipManager.onFrame()
        assert.equal(shadowCasters.has(source.mesh), false)
        assert.equal(source.mesh.isEnabled(), true)
        assert.equal(scene.meshes.length, meshCount)
    } finally {
        scene.dispose()
        engine.dispose()
    }
})
