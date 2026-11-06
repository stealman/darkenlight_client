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
    new Function('exports', 'require', compiled)(exports, name => dependencies[name]
        || (name === '@/babylon/world/collisionGrid' ? loadModule('babylon/world/collisionGrid.ts', {}) : {}))
    return exports
}

test('actor lighting matches the previous stable sort and retains arrays when lights do not change', async () => {
    const core = await import('@babylonjs/core/index.js')
    const {updateActorLightMesh} = loadModule('babylon/scene/lighting/meshLighting.ts', {
        '@babylonjs/core': core,
        '@/babylon/scene/lighting/staticLighting': {
            getActorStaticLightLimit: host => host.actorLimit,
            getStaticLightLimit: host => host.slotLimit,
        },
    })
    let seed = 37
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    let distanceChecks = 0
    const Vector3 = {...core.Vector3, DistanceSquared: (a, b) => {
        distanceChecks++
        return core.Vector3.DistanceSquared(a, b)
    }}
    const {updateActorLightMesh: countedUpdate} = loadModule('babylon/scene/lighting/meshLighting.ts', {
        '@babylonjs/core': {Vector3},
        '@/babylon/scene/lighting/staticLighting': {
            getActorStaticLightLimit: host => host.actorLimit,
            getStaticLightLimit: host => host.slotLimit,
        },
    })
    const mesh = {position: core.Vector3.Zero(), _lightSources: [], dirty: 0,
        getAbsolutePosition() {return this.position}, get lightSources() {return this._lightSources},
        _markSubMeshesAsLightDirty() {this.dirty++}}
    for (let iteration = 0; iteration < 1000; iteration++) {
        const host = {indoor: random() < .5, sunLight: {}, personalLight: {},
            actorLimit: iteration % 5, slotLimit: iteration % 9,
            localPlayerLightWarmingMeshes: new Set(), staticLightSlots: Array.from({length: 8}, () => ({
                source: random() < .25 ? null : {},
                light: {position: new core.Vector3(Math.floor(random() * 7), 0, 0), range: Math.floor(random() * 8)},
            }))}
        const available = host.staticLightSlots.slice(0, host.slotLimit)
        const nearest = available.filter(slot => slot.source != null)
            .filter(slot => core.Vector3.DistanceSquared(slot.light.position, mesh.position) <= slot.light.range ** 2)
            .sort((a, b) => core.Vector3.DistanceSquared(a.light.position, mesh.position) - core.Vector3.DistanceSquared(b.light.position, mesh.position))
            .slice(0, host.actorLimit)
        const staticLights = [...nearest, ...available.filter(slot => !nearest.includes(slot))]
            .slice(0, host.actorLimit).map(slot => slot.light)
        const expected = host.indoor ? [host.personalLight, ...staticLights] : [host.sunLight, host.personalLight, ...staticLights]
        updateActorLightMesh(host, mesh)
        assert.deepEqual(mesh.lightSources, expected)
        const retained = mesh.lightSources, dirty = mesh.dirty
        distanceChecks = 0
        countedUpdate(host, mesh)
        assert.equal(mesh.lightSources, retained)
        assert.equal(mesh.dirty, dirty)
        assert.ok(distanceChecks <= available.filter(slot => slot.source != null).length)
    }
})

test('type index follows addition, removal and clearing, preserving closest-object tie order', async () => {
    const core = await import('@babylonjs/core/index.js')
    class CampBarrel {
        constructor(type, position) {this.type = type; this.position = position; this.renderPosition = position}
        getSize() {return 1}
        getWalkableHeight() {return null}
        getSizeX() {return 1}
        getSizeZ() {return 1}
        getCollisionTolerance() {return .12}
        clearRenderMatrices() {}
        dispose() {}
    }
    const {StaticsManager: manager} = loadModule('babylon/world/statics/staticsManager.ts', {
        '@babylonjs/core': core,
        '@/babylon/world/statics/objects/campObjects': {CampBarrel},
        '@/babylon/materials': {MaterialEnum1: {WOOD_1: {}, STEEL_1: {}, WOOD_2: {}}},
        '@/babylon/scene/lights': {Lights: {clearStaticLights() {}}},
        '@/babylon/world/statics/staticFireParticleManager': {StaticFireParticleManager: {flush() {}}},
    })
    manager.getBaseHeight = () => 0
    manager.resolveStackedStaticPositions = () => {}
    manager.renderObjects = () => {}
    for (let i = 0; i < 5000; i++) manager.allStatics.push({type: 101, position: {x: 100, z: 100}, dispose() {}})
    for (const x of [-1, 1, 8]) manager.addObject({tp: 305, x, z: 0})
    // Queries must use the type index, never iterate unrelated scenery.
    manager.allStatics[Symbol.iterator] = () => {throw new Error('scanned all statics')}
    const position = core.Vector3.Zero()
    assert.equal(manager.getClosestStaticInDistance(305, position, 2).position.x, 1)
    assert.equal(manager.getClosestStaticInDistance(999, position, 2), null)
    manager.removeObjectAt(1, 0, 305)
    assert.equal(manager.getClosestStaticInDistance(305, position, 2).position.x, -1)
    manager.removeObjectAt(-1, 0, 305)
    assert.equal(manager.getClosestStaticInDistance(305, position, 2), null)
    manager.clearWorld()
    assert.equal(manager.staticsByType.size, 0)
    manager.addObject({tp: 305, x: 0, z: 0})
    assert.equal(manager.getClosestStaticInDistance(305, position, 2).position.x, 0)
})

test('name overlay uses visible IDs and tolerates IDs removed before the next visibility pass', async () => {
    const core = await import('@babylonjs/core/index.js')
    const position = {x: 1, y: 1}
    const entity = {nameDisplayTime: 100, getNameTextNodeScreenPosition: () => position,
        mobType: {name: 'monster'}, name: 'npc', getRelationToMyPlayer: () => 'NEUTRAL',
        getName: () => 'guard', getTitle: () => 'title'}
    const makeManager = (mapKey, setKey) => {
        const map = new Map([[1, entity]])
        map.forEach = () => {throw new Error('scanned all loaded entities')}
        return {[mapKey]: map, [setKey]: new Set([1, 999])}
    }
    const MonsterManager = makeManager('monsters', 'visibleMonsters')
    const CharacterManager = makeManager('characters', 'visibleCharacters')
    const NpcManager = {...makeManager('npcs', 'visibleNpcs'), ...makeManager('guards', 'visibleGuards')}
    const {OverlayLabels} = loadModule('gui/overlay/overlayLabels.ts', {
        '@babylonjs/core': core,
        '@/babylon/monsters/monsterManager': {MonsterManager},
        '@/babylon/character/characterManager': {CharacterManager},
        '@/babylon/npc/npcManager': {NpcManager},
        '@/data/myPlayer': {MyPlayer: {myChar: {nameDisplayTime: 0}}},
        '@/babylon/world/groundItemsManager': {GroundItemsManager: {}},
        '@/gui/overlay/targetSelector': {TargetSelector: {}},
    })
    const overlay = new OverlayLabels({})
    const rendered = []
    overlay.getTemporaryNameAlpha = () => 1
    overlay.renderName = () => rendered.push('monster')
    overlay.renderCharacterLabel = () => rendered.push('character')
    overlay.renderNpcLabel = (_position, name) => rendered.push(name)
    overlay.renderNames(1, false)
    assert.deepEqual(rendered, ['monster', 'character', 'npc', 'guard'])
})

test('effect synchronization visits visible entities and ends effects when entities leave view', () => {
    const char = {id: 1, publiclyVisibleAffects: new Map([[6, 1]]), isEffectVisible: () => true}
    const monster = {id: 2, killedTime: 0, publiclyVisibleAffects: new Map([[5, 1]]), isEffectVisible: () => true}
    const CharacterManager = {characters: new Map([[1, char]]), visibleCharacters: new Set([1])}
    const MonsterManager = {monsters: new Map([[2, monster]]), visibleMonsters: new Set([2])}
    for (const manager of [CharacterManager.characters, MonsterManager.monsters]) {
        manager.forEach = () => {throw new Error('scanned all loaded entities')}
    }
    const {GfxManager: gfx} = loadModule('babylon/gfx/gfxManager.ts', {
        '@/babylon/character/characterManager': {CharacterManager},
        '@/babylon/monsters/monsterManager': {MonsterManager},
        '@/data/myPlayer': {MyPlayer: {myChar: null}},
    })
    let starts = 0, updates = 0, ends = 0
    const effect = target => ({target, onStart() {starts++}, onUpdate() {updates++}, onEnd() {ends++}})
    gfx.createCharacterAffectEffect = effect
    gfx.createMonsterAffectEffect = effect
    const keys = [gfx.characterAffectKeys, gfx.monsterAffectKeys]
    gfx.syncCharacterAffects(0); gfx.syncMonsterAffects(0); gfx.syncMonsterPersistentEffects(0)
    assert.equal(starts, 2); assert.equal(updates, 2)
    CharacterManager.visibleCharacters.clear(); MonsterManager.visibleMonsters.clear()
    gfx.syncCharacterAffects(1); gfx.syncMonsterAffects(1)
    assert.equal(ends, 2)
    assert.equal(gfx.activeCharacterAffects.size + gfx.activeMonsterAffects.size, 0)
    assert.equal(gfx.characterAffectKeys, keys[0]); assert.equal(gfx.monsterAffectKeys, keys[1])
})

test('tree fade updates only visible trees and still completes the return to opaque rendering', () => {
    let rebuilds = 0
    const {TreeManager: trees} = loadModule('babylon/world/treeManager.ts', {
        '@/babylon/world/worldRenderer': {WorldRenderer: {renderWorld() {rebuilds++}}},
        '@/babylon/scene/lights': {Lights: {removeShadowCaster() {}}},
    })
    trees.allTrees.forEach = () => {throw new Error('scanned every loaded tree')}
    const mesh = {visibility: .5, dispose() {}}
    const tree = {fadeVisibility: .5, fadeTarget: 1, fadedMeshes: [mesh]}
    trees.visibleTrees.push(tree)
    trees.occlusionCheckFrame = 0
    trees.onFrame(.1, null)
    assert.ok(tree.fadeVisibility > .5 && tree.fadeVisibility < 1)
    assert.equal(mesh.visibility, tree.fadeVisibility)
    assert.equal(rebuilds, 0)
    trees.visibleTrees.length = 0
    trees.onFrame(.1, null)
    assert.equal(rebuilds, 0)
    trees.visibleTrees.push(tree)
    trees.onFrame(1, null)
    assert.equal(tree.fadeVisibility, 1)
    assert.equal(tree.fadedMeshes.length, 0)
    assert.equal(rebuilds, 1)
})
