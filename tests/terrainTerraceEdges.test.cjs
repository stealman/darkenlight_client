const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const {test} = require('node:test')
const ts = require('typescript')

function loadTerrainModule(name, dependencies = {}) {
    const source = readFileSync(join(__dirname, '../src/babylon/world', name + '.ts'), 'utf8')
    const {outputText} = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    })
    const exports = {}
    new Function('exports', 'require', outputText)(exports, name => dependencies[name] ?? {})
    return exports
}

const roof = loadTerrainModule('terrainRoofShape')
const {terraceCornerMasks} = loadTerrainModule('terrainTerraceEdges', {'./terrainRoofShape': roof})
const land = height => ({height, type: 4})
// The four tiles meet at the SE, NE, SW and NW corners, respectively.
const sharedCornerMasks = map => [
    (terraceCornerMasks(map, 0, 0) >> 4) & 15,
    (terraceCornerMasks(map, 0, 1) >> 8) & 15,
    terraceCornerMasks(map, 1, 0) & 15,
    (terraceCornerMasks(map, 1, 1) >> 12) & 15,
]

test('the lower terrace stays attached at the foot of a taller wall', () => {
    const map = [[land(3), land(2)], [land(1), land(2)]]
    assert.deepEqual(sharedCornerMasks(map), [1, 0, 0, 0])
})

test('same-height tiles keep the same deformation on a free terrace edge', () => {
    const map = [[land(2), land(2)], [land(1), land(2)]]
    assert.deepEqual(sharedCornerMasks(map), [13, 13, 0, 13])
})

test('shore corners stay attached to the water bed at water level', () => {
    const water = {height: 2, type: roof.WATER_BLOCK_TYPE}
    const map = [[water, land(2)], [land(1), land(2)]]
    assert.deepEqual(sharedCornerMasks(map), [0, 0, 0, 0])
})

test('the paved corner at x991 z918 joins the roof to both exposed walls', async () => {
    const core = await import('@babylonjs/core')
    const {createBeveledTerrainVertexData, TerrainVerticalCorner} = loadTerrainModule('beveledTerrainBlock', {
        '@babylonjs/core': core, './terrainRoofShape': roof,
    })
    // Heights around the paved tile, in rows of increasing Z.
    const heights = [[9, 8, 8], [9, 9, 8], [9, 9, 8]]
    const tile = {...land(9), stonePath: true}
    const shape = roof.terrainRoofShape(1, 1, tile, tile.height, (x, z) => heights[z]?.[x], () => false)
    const {positions, normals, indices} = createBeveledTerrainVertexData(
        (shape & 255) | TerrainVerticalCorner.NorthEast, 0, roof.terrainRoofCornerSteps(shape),
    )
    for (const [axis, side] of [[0, 1], [2, -1]]) {
        const roofEdges = [], wallEdges = new Set()
        for (let i = 0; i < indices.length; i += 3) {
            const triangle = indices.slice(i, i + 3).map(index => index * 3)
            const normal = normals[triangle[0] + axis]
            const isRoof = normals[triangle[0] + 1] > 1e-6
            for (let j = 0; j < 3; j++) {
                const points = [triangle[j], triangle[(j + 1) % 3]].map(index => positions.slice(index, index + 3))
                if (!points.every(point => Math.abs(point[axis] - side * 0.5) < 1e-6)) continue
                const edge = points.map(point => point.map(value => value.toFixed(6)).join(',')).sort().join('|')
                if (isRoof) roofEdges.push(edge)
                else if (normal * side > 0.999) wallEdges.add(edge)
            }
        }
        assert.ok(roofEdges.length > 0)
        for (const edge of roofEdges) assert.ok(wallEdges.has(edge), `Missing wall edge ${edge}`)
    }
})
