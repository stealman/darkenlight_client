const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const {test} = require('node:test')
const ts = require('typescript')

function loadModule(path, dependencies = {}) {
    const source = readFileSync(join(__dirname, '../src', path), 'utf8')
    const {outputText} = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    })
    const exports = {}
    new Function('exports', 'require', outputText)(exports, name => dependencies[name] ?? {})
    return exports
}

async function loadWaterBed() {
    const babylon = await import('@babylonjs/core')
    return loadModule('babylon/world/terrainWaterBed.ts', {'@babylonjs/core': babylon})
}

function vertices(triangles) {
    return [...new Set(triangles.flatMap(triangle => triangle.points))]
}

test('shore slopes descend from below the surface to an unchanged floor', async () => {
    const {createWaterBedSlope: createSlope, sampleWaterBedHeight} = await loadWaterBed()
    const heights = (x, z) => z === 0 ? x === -1 ? 0 : -0.5 : undefined
    const triangles = createSlope(0, 0, -0.5, 0, heights)
    const section = vertices(triangles).filter(point => point.z === 0).sort((a, b) => a.x - b.x)
    assert.equal(section[0].y, 0)
    assert.ok(section[1].y > -0.035)
    assert.ok(section.some(point => point.y > -0.5 && point.y < -0.04))
    assert.ok(section.every((point, index) => index === 0 || point.y <= section[index - 1].y))
    assert.ok(triangles.every(triangle => triangle.normal.y > 0))
    for (const point of section) {
        assert.ok(Math.abs(sampleWaterBedHeight(point.x, point.z, -0.5, 0, heights) - point.y) < 1e-9)
    }
    assert.equal(sampleWaterBedHeight(1, 0, -0.5, 0, heights), -0.5)
    assert.notEqual(sampleWaterBedHeight(0, -0.25, -0.5, 0, x => x < 0 ? 0 : -0.5),
        sampleWaterBedHeight(0, 0.25, -0.5, 0, x => x < 0 ? 0 : -0.5))
    assert.equal(createSlope(0, 0, -0.5, -0.04, () => -0.5), undefined)
})

test('the slope meets the neighboring floor along a mixed-depth shoreline', async () => {
    const {createWaterBedSlope: createSlope} = await loadWaterBed()
    const heights = (x, z) => x < 0 ? 0 : z < 1 ? -0.5 : -1
    const edge = (x, z, floor, ox, oz) => vertices(createSlope(x, z, floor, 0,
        (tx, tz) => heights(tx + ox, tz + oz), ox, oz))
        .filter(point => point.z + oz === 0.5).sort((a, b) => a.x - b.x).map(point => point.y)
    assert.deepEqual(edge(0, 0, -0.5, 0, 0), edge(1, 0, -1, -1, 1))
})

test('characters follow the shallow ramp while collision heights and bridge support stay intact', async () => {
    const bed = await loadWaterBed()
    const roofs = loadModule('babylon/world/terrainRoofShape.ts')
    const land = {type: 1, height: 6, walkHeight: 6, totalHeight: 6}
    const shallow = {type: 50, height: 6, walkHeight: 5.5, totalHeight: 5.9, shallowWater: true}
    const map = [[land], [shallow], [shallow], [shallow]]
    let bridge = 0
    const {Utils} = loadModule('utils/utils.ts', {
        '@/data/worldDataManager': {WorldDataManager: {getBlockMap: () => map}},
        '@/babylon/world/statics/staticsManager': {StaticsManager: {getWalkableHeightAtTile: x => x === 1 ? bridge : 0}},
        '@/babylon/world/buildings/buildingManager': {BuildingManager: {getFloorHeightAtTile: () => 0}},
        '@/babylon/world/terrainRoofShape': roofs,
        '@/babylon/world/terrainWaterBed': bed,
    })
    assert.equal(Utils.calculateCharacterYPos(0.5, 0, 0.8), 6)
    assert.ok(Utils.calculateCharacterYPos(1, 0, 0.8) > 5.8)
    assert.equal(Utils.calculateCharacterYPos(2, 0, 0.8), 5.5)
    assert.equal(Utils.calculateWalkYPos(1, 0, 0.8), 5.5)
    bridge = 0.3
    assert.ok(Math.abs(Utils.calculateCharacterYPos(1, 0, 0.8) - 6.2) < 1e-9)
})
