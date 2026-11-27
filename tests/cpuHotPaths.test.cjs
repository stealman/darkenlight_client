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

test('world shaders overlap across materials and warm the depth pre-pass in isolation', async () => {
    const {warmUpWorldInstanceMaterials} = loadModule('babylon/world/worldInstanceBuffers.ts', {})
    const started = []
    const finish = []
    const progress = []
    let colorWrite = true
    const engine = {
        getCaps: () => ({parallelShaderCompile: {}}),
        getColorWrite: () => colorWrite,
        setColorWrite: value => {colorWrite = value},
    }
    const material = (needDepthPrePass = false) => ({
        needDepthPrePass,
        forceCompilationAsync(mesh) {
            started.push([mesh.name, colorWrite])
            return new Promise(resolve => finish.push(resolve))
        },
    })
    const mesh = (name, material) => ({
        name, material, thinInstanceCount: 1, getVertexBuffer: () => ({}), getEngine: () => engine,
    })
    const shared = material()
    const warming = warmUpWorldInstanceMaterials([
        mesh('ground', shared), mesh('edge', shared), mesh('grass', material()), mesh('glass', material(true)),
    ], (completed, total) => progress.push([completed, total]))
    assert.deepEqual(started, [['ground', true], ['grass', true]])
    for (let i = 0; i < 5; i++) {
        assert.ok(finish.length)
        finish.shift()()
        await new Promise(resolve => setImmediate(resolve))
    }
    await warming
    assert.deepEqual(started, [['ground', true], ['grass', true], ['edge', true], ['glass', true], ['glass', false]])
    assert.deepEqual(progress, [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4]])
    assert.equal(colorWrite, true)
})

test('the active mesh list only refreezes after movement stops', () => {
    const {ActiveMeshFreezer: freezer} = loadModule('babylon/scene/activeMeshFreezer.ts', {})
    const calls = []
    freezer.scene = {
        activeCamera: {},
        particleSystems: [],
        set _activeMeshesFrozen(value) {if (value) calls.push('freeze')},
        unfreezeActiveMeshes() {calls.push('unfreeze')},
        getActiveMeshes() {return {length: 1, data: [{}]}},
    }
    freezer.start()
    freezer.lastChangeAt = -Infinity
    freezer.beforeRender()
    freezer.afterRender()
    freezer.updateViewPosition({x: 1, y: 2, z: 3})
    freezer.beforeRender()
    freezer.afterRender()
    freezer.updateViewPosition({x: 1.2, y: 2, z: 3})
    freezer.beforeRender()
    freezer.afterRender()
    assert.deepEqual(calls, ['freeze', 'unfreeze'])
    freezer.lastChangeAt = -Infinity
    freezer.beforeRender()
    freezer.afterRender()
    assert.deepEqual(calls, ['freeze', 'unfreeze', 'freeze'])
})

test('actor preparation processes one job per frame and releases waiters on scene disposal', async () => {
    const visual = loadModule('babylon/scene/actorVisualPreparation.ts', {})
    let dispose
    const scene = {onDisposeObservable: {addOnce: callback => {dispose = callback}}}
    const calls = []
    visual.startActorVisualPreparation(scene)
    assert.ok(visual.enqueueActorVisualPreparation(scene, () => calls.push('monster')))
    const pending = visual.waitForActorVisualPreparation(scene).then(() => calls.push('NPC'))
    visual.enqueueActorVisualPreparation(scene, () => calls.push('removed'))
    visual.flushActorVisualPreparation(scene, performance.now())
    assert.deepEqual(calls, ['monster'])
    dispose()
    await pending
    assert.deepEqual(calls, ['monster', 'NPC'])
    assert.equal(visual.enqueueActorVisualPreparation(scene, () => {}), false)
})

test('sea rectangles cover open and submerged tiles without overlapping dry land or higher ponds', () => {
    const {seaRectangles} = loadModule('babylon/world/seaWaterSurface.ts', {
        './terrainRoofShape': {WATER_BLOCK_TYPE: 50},
    })
    const land = {type: 1, height: 5}
    const bed = {type: 1, height: 3}
    const sea = {type: 50, height: 4}
    const pond = {type: 50, height: 6}
    const rectangles = seaRectangles([[land, bed, sea], [land, bed, pond]], 4, {minX: 0, maxX: 1, minZ: -1, maxZ: 2})
    assert.deepEqual(rectangles, [
        {minX: 0, maxX: 1, minZ: -1, maxZ: -1},
        {minX: 0, maxX: 0, minZ: 1, maxZ: 2},
        {minX: 1, maxX: 1, minZ: 1, maxZ: 1},
    ])
    assert.deepEqual(seaRectangles([[land]], 5, {minX: 0, maxX: 0, minZ: 0, maxZ: 0}), [])
    assert.deepEqual(seaRectangles([], 4, {minX: -4, maxX: 4, minZ: -4, maxZ: 4}), [
        {minX: -4, maxX: 4, minZ: -4, maxZ: 4},
    ])
})

test('water reuses the visible shoreline and rebuilds it when nearby terrain changes', () => {
    const uploads = []
    const mesh = {setEnabled() {}, getScene() {}, onDisposeObservable: {addOnce() {}}}
    const {TerrainWaterSurface} = loadModule('babylon/world/terrainWaterSurface.ts', {
        '@babylonjs/core': {
            Matrix: {Translation: (x, y, z) => ({x, y, z})},
            Vector2: class {set() {}},
            Texture: {},
            RawTexture: {CreateRGBATexture: () => ({dispose() {}, update: pixels => uploads.push(pixels.slice())})},
        },
        '@/babylon/builder': {Builder: {createHorizontalPlane: () => mesh}},
        './terrainRoofShape': {WATER_BLOCK_TYPE: 50, TERRAIN_CARDINAL_EDGES: [[1, 0], [-1, 0], [0, 1], [0, -1]]},
        './terrainWaterMaterial': {configureTerrainWater() {}, WATER_FIELD_RESOLUTION: 6, POND_DISTANCE_RANGE: 3},
        './worldInstanceBuffers': {updateWorldInstanceBuffers() {}},
    })
    const surface = new TerrainWaterSurface({})
    const map = Array.from({length: 5}, () => Array.from({length: 5}, () => ({type: 1, height: 0})))
    map[2][2].type = 50
    surface.render([{x: 2, z: 2, height: 0}], map, 0)
    surface.render([{x: 2, z: 2, height: 0}], map, 0)
    assert.equal(uploads.length, 1)
    map[2][3].type = 50
    surface.render([{x: 2, z: 2, height: 0}], map, 1)
    assert.equal(uploads.length, 2)
    assert.notDeepEqual(uploads[0], uploads[1])
})

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
        '../stoneBatch': {StoneBatch: {clear() {}, flush() {}}},
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

test('static stacking is reused until terrain, floors, or scenery change', () => {
    const world = {blockMap: [[{totalHeight: 2}, {totalHeight: 2}]], renderRevision: 0}
    const floors = {floorTilesRevision: 0, height: 0, getFloorHeightAtTile() {return this.height}}
    const {StaticsManager: manager} = loadModule('babylon/world/statics/staticsManager.ts', {
        vue: {ref: value => ({value})},
        '@/data/myPlayer': {MyPlayer: {worldId: 1}},
        '@/data/worldDataManager': {WorldDataManager: {
            worldDataMap: new Map([[1, world]]), getBlockMap: () => world.blockMap,
        }},
        '@/babylon/world/buildings/buildingManager': {BuildingManager: floors},
        '@/babylon/world/snowCoverMask': {isShrubType: () => false},
        '@/babylon/world/statics/objects/campObjects': {CampBarrel: class {}},
        '@/babylon/world/statics/objects/cemeteryEmberBowl': {CemeteryEmberBowl: class {}},
        '@/babylon/world/statics/objects/cemeteryObjects': {CemeteryPedestal: class {}},
    })
    let reads = 0
    const prop = (type, surface, onStatic) => ({
        type, position: {x: 0, y: 0, z: 0}, renderPosition: {y: 0},
        getPlacementSurfaceHeight() {reads++; return surface},
        shouldPlaceOnStatic: () => onStatic, dispose() {},
    })
    const table = prop(304, 0.4, false), lamp = prop(263, null, true)
    const unrelated = prop(304, null, false)
    unrelated.position.z = 1
    manager.staticsByTile.set('0;0', new Set([table, lamp]))
    manager.staticsByTile.set('0;1', new Set([unrelated]))
    manager.allStatics.push(unrelated)
    manager.allStatics.push(table, lamp)
    for (let i = 0; i < 100; i++) manager.resolveStackedStaticPositions()
    assert.equal(reads, 3)
    assert.equal(lamp.renderPosition.y, 2.4)

    world.blockMap[0][0].totalHeight = 4
    world.renderRevision++
    manager.resolveStackedStaticPositions()
    assert.equal(lamp.renderPosition.y, 4.4)
    assert.equal(reads, 5)
    floors.height = 0.5
    floors.floorTilesRevision++
    manager.resolveStackedStaticPositions()
    assert.equal(lamp.renderPosition.y, 4.9)
    const beforeRemoval = reads
    manager.removeObjectAt(0, 0, 304, false)
    manager.resolveStackedStaticPositions()
    assert.equal(lamp.renderPosition.y, 4.5)
    assert.equal(reads, beforeRemoval + 1)
})

test('unchanged static lights do not reschedule assignment or invalidate a shadow map', async () => {
    const core = await import('@babylonjs/core/index.js')
    const {registerStaticLight, unregisterStaticLight} = loadModule('babylon/scene/lighting/staticLighting.ts', {
        '@babylonjs/core': core,
    })
    const host = {staticLights: new Map(), staticLightSlots: [], staticLightAssignmentsDirty: false}
    const id = 'torch'
    const position = new core.Vector3(1, 2, 3)
    const profile = {color: core.Color3.White(), height: 1, intensity: 2, range: 4}
    registerStaticLight(host, id, position, profile)
    let invalidations = 0
    host.staticLightSlots.push({source: host.staticLights.get(id), shadow: {
        getDarkness: () => 0, getShadowMap: () => ({resetRefreshCounter() {invalidations++}}),
    }})
    host.staticLightAssignmentsDirty = false
    for (let i = 0; i < 100; i++) registerStaticLight(host, id, position, {...profile})
    assert.equal(host.staticLightAssignmentsDirty, false)
    assert.equal(invalidations, 0)

    position.y++
    assert.equal(host.staticLights.get(id).position.y, position.y)
    registerStaticLight(host, id, position, profile)
    assert.equal(host.staticLightAssignmentsDirty, true)
    assert.equal(invalidations, 1)
    unregisterStaticLight(host, id)
    host.staticLightAssignmentsDirty = false
    unregisterStaticLight(host, id)
    assert.equal(host.staticLightAssignmentsDirty, false)
    registerStaticLight(host, id, position, profile)
    assert.equal(host.staticLightAssignmentsDirty, true)
    assert.equal(invalidations, 2)
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

test('tree camera culling skips offscreen trees and keeps a margin at the edge', async () => {
    const core = await import('@babylonjs/core/index.js')
    const species = loadModule('babylon/world/trees/treeSpecies.ts', {})
    const {TreeVariants} = loadModule('babylon/world/trees/treeGenerator.ts', {'@babylonjs/core': core, './treeSpecies': species})
    const {TreeCameraFrustum, getTreeModelBounds} = loadModule('babylon/world/trees/treeRevealBounds.ts', {'@babylonjs/core': core})
    const model = new TreeVariants(671439, 1).get('spruce', 0).models.HIGH
    const radius = getTreeModelBounds(model).radius
    const projection = core.Matrix.PerspectiveFovLH(Math.PI / 2, 1, .1, 100)
    const frustum = new TreeCameraFrustum()
    const position = new core.Vector3(0, 0, 20)
    frustum.update(projection, 0)
    assert.ok(frustum.intersects(model, position, 1))
    // At a 90-degree field of view the right plane is x = z.
    position.x = 20 + radius * Math.SQRT2 + .5
    assert.equal(frustum.intersects(model, position, 1), false)
    frustum.update(projection, 2)
    assert.ok(frustum.intersects(model, position, 1))
    position.x += 10
    assert.equal(frustum.intersects(model, position, 1), false)
})

test('sun shadow boxes share one mesh and gables stay out of the camera pass', async () => {
    const core = await import('@babylonjs/core/index.js')
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    try {
        new core.FreeCamera('camera', new core.Vector3(0, 2, -6), scene).setTarget(core.Vector3.Zero())
        const sun = new core.DirectionalLight('sun', new core.Vector3(-1, -1, 0), scene)
        const shadow = new core.ShadowGenerator(128, sun)
        const {StaticSunShadowBoxes: boxes, createSunShadowGable} = loadModule('babylon/world/sunShadowProxyBatch.ts', {
            '@babylonjs/core': core,
            '@/babylon/scene/lights': {Lights: {addShadowCaster(mesh, personal) {
                assert.equal(personal, false)
                shadow.addShadowCaster(mesh)
            }}},
        })
        const parent = new core.TransformNode('world', scene)
        boxes.initialize(scene, parent)
        const gables = createSunShadowGable(scene, parent)
        boxes.walls.push(core.Matrix.Translation(-2, 0, 0))
        boxes.buildings.push(core.Matrix.Translation(2, 0, 0))
        boxes.flush()
        gables.add(core.Matrix.Translation(2, 1, 0))
        gables.flush()
        const [box, roof] = shadow.getShadowMap().renderList
        assert.equal(box.thinInstanceCount, 2)
        assert.equal(roof.thinInstanceCount, 1)
        assert.equal(box.getTotalIndices() / 3, 12)
        assert.equal(roof.getTotalIndices() / 3, 8)
        scene.render()
        assert.equal(scene.getActiveMeshes().length, 0)
        boxes.walls.length = 0
        boxes.buildings.length = 0
        boxes.flush()
        assert.equal(box.thinInstanceCount, 0)
        assert.equal(box.isEnabled(), false)
    } finally {
        engine.dispose()
    }
})

test('tree visibility is reused within a camera tile and refreshed after a viewport change', async () => {
    const core = await import('@babylonjs/core/index.js')
    const species = loadModule('babylon/world/trees/treeSpecies.ts', {})
    const playerPosition = new core.Vector3(0, 0, 0)
    const viewport = {viewPortInitialized: true, visibilityMatrix: [], isPointInVisibleMatrix: () => true}
    const camera = {getViewMatrix() {}, getProjectionMatrix() {}, getTransformationMatrix() {}}
    let updates = 0, tests = 0
    const {TreeManager: trees} = loadModule('babylon/world/treeManager.ts', {
        '@babylonjs/core': core,
        '@/babylon/scene/renderer': {Renderer: {camera}},
        '@/data/myPlayer': {MyPlayer: {myChar: {pos: playerPosition}}},
        '@/data/worldDataManager': {WorldDataManager: {getBlockMap: () => [[{height: 0, totalHeight: 0}]]}},
        '@/settings/settings': {Settings: {treesEnabled: true, isPhoneOrTablet: () => false, detailLevel: {name: 'LOW'}}},
        '@/utils/viewport': {ViewportManager: viewport},
        './collisionGrid': loadModule('babylon/world/collisionGrid.ts', {}),
        './statics/staticVariation': {createStaticVariation: () => ({unit: () => 0})},
        './trees/treeSpecies': species,
        './trees/treeGenerator': {TreeVariants: class {
            warmUp() {}
            get() {return {height: 3, models: {LOW: {}}}}
        }},
        './trees/treeGroundSurface': {createTreeSnowFootprint: () => ({})},
        './trees/treeRevealBounds': {TreeCameraFrustum: class {
            update() {updates++}
            intersects() {tests++; return true}
        }},
        './trees/treeRenderer': {TreeRenderer: class {
            setSurfaceDetail() {}
            setShadowCasting() {}
            rebuild() {}
        }},
    })
    await trees.initialize({onDisposeObservable: {addOnce() {}}}, null)
    trees.addTree({x: 0, z: 0, type: species.WORLD_TREE_TYPES.spruce.ids[0], size: 1})
    trees.renderTrees(false)
    playerPosition.x = .2
    trees.renderTrees(false)
    assert.deepEqual([updates, tests], [1, 1])
    playerPosition.x = 1
    trees.renderTrees(false)
    assert.deepEqual([updates, tests], [2, 2])
    viewport.visibilityMatrix = []
    trees.renderTrees(false)
    assert.deepEqual([updates, tests], [3, 3])
})

test('tree reveal and night lighting update without rebuilding geometry', async () => {
    const core = await import('@babylonjs/core/index.js')
    const player = {getModelHeight: () => 2}
    const target = {getModelHeight: () => 3, pos: new core.Vector3(8, 1, 9)}
    const myPlayer = {myChar: player, myModel: {node: {getAbsolutePosition: () => new core.Vector3(2, 0, 3)}}}
    const targeting = {selectedTarget: target}
    const species = loadModule('babylon/world/trees/treeSpecies.ts', {})
    const casters = []
    const lights = {indoor: false, daylightFactor: 1, addShadowCaster(_mesh, personal, local) {casters.push([personal, local])}}
    let rebuilds = 0
    let reveals, nightFill
    const {TreeManager: trees} = loadModule('babylon/world/treeManager.ts', {
        '@babylonjs/core': core,
        './collisionGrid': loadModule('babylon/world/collisionGrid.ts', {}),
        './trees/treeSpecies': species,
        './trees/treeGenerator': {TreeVariants: class { warmUp() {} }},
        './trees/treeRevealBounds': loadModule('babylon/world/trees/treeRevealBounds.ts', {'@babylonjs/core': core}),
        './trees/treeRenderer': {TreeRenderer: class {
            constructor(_scene, _parent, addCaster, _removeCaster, _setLighting, fill) {
                nightFill = fill
                addCaster({}, 'wood3', true)
                addCaster({}, 'wood6', true)
                addCaster({}, 'needlesShadow', true)
                addCaster({}, 'foliageCard', false)
            }
            setRevealTargets(...args) {reveals = args}
            rebuild() {rebuilds++}
        }},
        '@/data/myPlayer': {MyPlayer: myPlayer},
        '@/babylon/scene/lights': {Lights: lights},
        '@/gui/targettingManager': {TargetingManager: targeting},
        '@/settings/settings': {Settings: {treesEnabled: true, treeShaderFeatures: species.TREE_SHADER.reveal, detailLevel: {name: 'LOW'}}},
    })
    await trees.initialize({onDisposeObservable: {addOnce() {}}}, null)
    trees.onFrame()
    assert.deepEqual(casters, [[false, false], [true, true], [true, true]])
    assert.deepEqual(nightFill.asArray(), [0, .1])
    assert.deepEqual(reveals[0].asArray(), [2, 1.1, 3])
    assert.deepEqual(reveals[1].asArray(), [8, 1 + 3 * .55, 9])
    assert.equal(reveals[4], 3 * .60)
    targeting.selectedTarget = player
    lights.daylightFactor = 0
    trees.onFrame()
    assert.deepEqual(nightFill.asArray(), [1, .1])
    assert.equal(reveals.length, 1)
    myPlayer.myModel = null
    lights.indoor = true
    trees.onFrame()
    assert.deepEqual(nightFill.asArray(), [0, .1])
    assert.deepEqual(reveals, [null])
    assert.equal(rebuilds, 0)
})
