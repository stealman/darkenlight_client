const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')

function createLoader(core) {
    const cache = new Map()
    const material = new Proxy({}, {get: (_target, key) => key === 'uv' ? new core.Vector2() : material})
    const dependencies = {
        '@babylonjs/core': core,
        '@/babylon/materials': {MaterialEnum1: material, MaterialAlphaEnum1: material,
            MaterialEnumTrans: material, Materials: material},
        '@/babylon/scene/lights': {Lights: new Proxy({}, {get: () => () => {}})},
    }
    const load = (name, extra = '') => {
        if (cache.has(name)) return cache.get(name)
        const source = readFileSync(join(__dirname, '../src', name.slice(2) + '.ts'), 'utf8') + extra
        const compiled = ts.transpileModule(source, {
            compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
        }).outputText
        const exports = {}
        cache.set(name, exports)
        new Function('exports', 'require', compiled)(exports, dependency => dependencies[dependency]
            || (/^@\/babylon\/world\/(collisionGrid|statics\/objects\/|statics\/staticsCodebook)/.test(dependency) ? load(dependency) : {}))
        return exports
    }
    return {load, dependencies}
}

test('grid matches full scans across boundaries and large multi-cell objects, without duplicate tests', async () => {
    const core = await import('@babylonjs/core/index.js')
    const {load} = createLoader(core)
    const {CollisionGrid} = load('@/babylon/world/collisionGrid')
    const grid = new CollisionGrid()
    let seed = 107
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    const objects = Array.from({length: 1000}, () => {
        const minX = random() * 200 - 100, minZ = random() * 200 - 100
        return {minX, minZ, maxX: minX + random() * 20, maxZ: minZ + random() * 20}
    })
    for (const obj of objects) grid.add(obj, obj.minX, obj.minZ, obj.maxX, obj.maxZ)
    for (let i = 0; i < 12000; i++) {
        const x = i < 100 ? (i - 50) * 4 : random() * 250 - 125
        const z = i < 100 ? 0 : random() * 250 - 125
        const size = [.4, .8, 1, 2, 9][i % 5]
        const collides = obj => x - size / 2 < obj.maxX && x + size / 2 > obj.minX
            && z - size / 2 < obj.maxZ && z + size / 2 > obj.minZ
        const tested = new Set()
        assert.equal(grid.findFirst(x, z, size, obj => {
            assert.equal(tested.has(obj), false)
            tested.add(obj)
            return collides(obj)
        }), objects.find(collides) ?? null)
    }
    for (const obj of objects) grid.remove(obj)
    assert.equal(grid.findFirst(0, 0, 1000, () => true), null)
    assert.equal(grid.cells.size, 0)
    const obj = objects[0]
    grid.add(obj, 0, 0, 1, 1)
    grid.clear()
    grid.add(obj, -1, -1, 1, 1)
    assert.equal(grid.findFirst(0, 0, .8, () => true), obj)
})

test('static manager preserves rotated footprints, connected fences and open dungeon entrances', async () => {
    const core = await import('@babylonjs/core/index.js')
    const {load, dependencies} = createLoader(core)
    dependencies['@/babylon/world/statics/staticFireParticleManager'] = {StaticFireParticleManager: {flush() {}}}
    const {StaticsManager: manager} = load('@/babylon/world/statics/staticsManager')
    manager.getBaseHeight = () => 0
    manager.resolveStackedStaticPositions = () => {}
    manager.renderObjects = () => {}
    const {StoneEntrance, PalisadeWall2} = load('@/babylon/world/statics/objects/walls')
    const {CampFence} = load('@/babylon/world/statics/objects/campObjects')
    const {CemeteryStoneWall} = load('@/babylon/world/statics/objects/cemeteryObjects')
    // Bypass portal lighting construction; exercise its real footprint and exact collision method.
    const {StaticObjectsCodebook} = load('@/babylon/world/statics/staticsCodebook')
    for (const facing of ['+Z', '-Z', '+X', '-X']) {
        const entrance = Object.create(StoneEntrance.prototype)
        Object.assign(entrance, {type: 281, objectInfo: StaticObjectsCodebook.get(281),
            status: {facing}, position: new core.Vector3(4, 0, 4), renderPosition: new core.Vector3(4, 0, 4)})
        manager.allStatics.push(entrance)
        manager.collisionGrid.add(entrance, 3.5, 3.5, 4 + entrance.getSizeX() - .5, 4 + entrance.getSizeZ() - .5)
        for (let x = 2; x <= 10; x += .2) for (let z = 2; z <= 10; z += .2) {
            const expected = entrance.isObjectInCollision(x, z, .8)
                ? {x: entrance.renderPosition.x, z: entrance.renderPosition.z} : null
            assert.deepEqual(manager.getPointInStatic(x, z, .8), expected)
        }
        manager.allStatics.length = 0
        manager.collisionGrid.clear()
    }
    for (const [tp, x, z, meta] of [[201, -4, -4], [101, 0, 0], [121, 4, 4],
        [203, 7, 7, {orientation: 'X'}], [207, 8, 8, {orientation: 'Z'}],
        [210, 12, 12, {orientation: 'X'}], [303, 16, 16, {length: 5, facing: '+X'}]]) {
        manager.addObject({tp, x, z, meta})
    }
    for (const obj of manager.allStatics) {
        if (obj instanceof CampFence || obj instanceof PalisadeWall2) obj.setCornerDirections([{x: 1, z: 0}, {x: 0, z: 1}])
    }
    for (let x = -6; x <= 24; x += .23) for (let z = -6; z <= 20; z += .31) {
        for (const size of [.4, .8, 1.2]) {
            const expected = manager.allStatics.find(obj => obj.isObjectInCollision(x, z, size))
            assert.deepEqual(manager.getPointInStatic(x, z, size), expected
                ? {x: expected.renderPosition.x, z: expected.renderPosition.z} : null)
        }
    }
    manager.removeObjectAt(-4, -4, 201)
    assert.equal(manager.getPointInStatic(-4, -4, .8), null)
    manager.clearWorld()
    assert.equal(manager.getPointInStatic(4, 4, .8), null)
    assert.equal(manager.collisionGrid.cells.size, 0)
})

test('tree manager indexes scaled trunks and updates its grid through removal and world reset', async () => {
    const core = await import('@babylonjs/core/index.js')
    const {load, dependencies} = createLoader(core)
    dependencies['@/data/worldDataManager'] = {WorldDataManager: {getBlockMap: () =>
        Array.from({length: 20}, () => Array.from({length: 20}, () => ({height: 0})))}}
    dependencies['@/babylon/materials'].MaterialAlphaEnum1 = {getMaterialByIndex: () => new core.Vector2()}
    const {TreeManager: manager} = load('@/babylon/world/treeManager')
    manager.renderTrees = () => {}
    for (const [type, x, z, size] of [[1, 4, 4, .5], [5, 8, 8, 5], [2, 10, 8, 2]]) manager.addTree({type, x, z, size})
    for (let x = 0; x <= 15; x += .17) for (let z = 0; z <= 15; z += .19) {
        for (const size of [.4, .8, 2]) {
            const expected = manager.allTrees.find(tree => Math.abs(tree.position.x - x) < (tree.scale * .75 + size) / 2
                && Math.abs(tree.position.z - z) < (tree.scale * .75 + size) / 2)
            assert.deepEqual(manager.getPointInTree(x, z, size), expected ? {x: expected.position.x, z: expected.position.z} : null)
        }
    }
    manager.removeTreeAt(8, 8)
    assert.equal(manager.getPointInTree(7, 8, .4), null)
    manager.clearWorld()
    assert.equal(manager.collisionGrid.cells.size, 0)
    manager.addTree({type: 1, x: 4, z: 4, size: 1})
    assert.deepEqual(manager.getPointInTree(4, 4, .8), {x: 4, z: 4})
})

test('existing building index covers rotated houses, large sheds, mausoleums and open doors', async () => {
    const core = await import('@babylonjs/core/index.js')
    const {load, dependencies} = createLoader(core)
    const engine = new core.NullEngine()
    const scene = new core.Scene(engine)
    const parent = new core.TransformNode('world', scene)
    const material = new core.PBRMaterial('shared', scene)
    dependencies['@/babylon/materials'].Materials = {
        blockMat1: material, blockMatTrans: material,
        createBlockMat1: () => new core.PBRMaterial('faded', scene),
    }
    const world = Array.from({length: 100}, () => Array.from({length: 100}, () => ({totalHeight: 0})))
    dependencies['@/data/worldDataManager'] = {WorldDataManager: {getBlockMap: () => world}}
    dependencies['@/babylon/audio/audioManager'] = {AudioManager: new Proxy({}, {get: () => () => {}})}
    const {BuildingManager: manager} = load('@/babylon/world/buildings/buildingManager')
    const {Utils} = load('@/utils/utils')
    let seed = 91
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    try {
        manager.initialize(scene, parent)
        for (const tp of [1, 2, 3, 4]) for (const facing of ['+X', '-X', '+Z', '-Z']) {
            manager.addBuilding({id: 1, tp, x: 10, z: 10, facing, width: 12, depth: 9,
                shedSideFills: {'+X': 'CAMP_FENCE', '-X': 'CAMP_FENCE', '+Z': 'CAMP_FENCE', '-Z': 'CAMP_FENCE'}})
            const building = manager.buildings.get(1)
            assert.ok(building)
            for (const open of [false, true]) {
                building.setDoorOpen(open)
                building.updateDoorAnimation(1)
                for (let i = 0; i < 1500; i++) {
                    const x = 8 + random() * (building.getWidth() + 4)
                    const z = 8 + random() * (building.getDepth() + 4)
                    const size = [.4, .8, 1][i % 3]
                    const expected = building.isPointInCollision(x, z, size) ? building.getCollisionCenter() : null
                    assert.deepEqual(manager.getPointInBuilding(x, z, size, Utils.getCoveredBlocks(x, z, size)), expected,
                        `type=${tp}, facing=${facing}, doorOpen=${open}, x=${x}, z=${z}`)
                }
            }
            manager.removeBuilding(1)
            assert.equal(manager.collisionTiles.size, 0)
        }
    } finally {
        scene.dispose()
        engine.dispose()
    }
})
