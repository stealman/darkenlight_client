const assert = require('node:assert/strict')
const {test} = require('node:test')
const {createServer} = require('vite')

test('procedural trees reuse a deterministic pool within each mesh budget', async () => {
    const server = await createServer({configFile: false, server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent'})
    try {
        const {TreeVariants} = await server.ssrLoadModule('/src/babylon/world/trees/treeGenerator.ts')
        const {TREE_SPECIES, TREE_VARIANT_COUNT, TREE_SHAPE_FACES, TREE_FACE_BUDGET} =
            await server.ssrLoadModule('/src/babylon/world/trees/treeSpecies.ts')
        const {createTreeGeometry} = await server.ssrLoadModule('/src/babylon/world/trees/treeGeometry.ts')
        const {Mesh, NullEngine, Scene} = await import('@babylonjs/core')
        const engine = new NullEngine()
        try {
            const scene = new Scene(engine)
            for (const [shape, triangles] of Object.entries(TREE_SHAPE_FACES)) {
                const mesh = new Mesh(shape, scene)
                createTreeGeometry(mesh, shape)
                assert.equal(mesh.getTotalIndices(), triangles * 3)
            }
        } finally { engine.dispose() }

        const pool = new TreeVariants(671439, 1)
        pool.warmUp()
        const expandedPool = new TreeVariants(671439)
        expandedPool.warmUp()
        const smallerPool = new TreeVariants(671439, 0.5)
        const largerPool = new TreeVariants(671439, 4)
        const sameSeed = new TreeVariants(671439, 1)
        const otherSeed = new TreeVariants(42, 1)
        const ranges = {LOW: [500, 1000], MEDIUM: [1000, 2000], HIGH: [2000, 2500], SHADOW: [1, 240]}
        const geometry = ({shapes}) => [...shapes].map(([shape, parts]) => [shape, parts.map(part => part.matrix.m)])
        const trunk = ({shapes}) => [...shapes.values()].flat().find(({matrix}) =>
            matrix.m[12] === 0 && matrix.m[13] < -0.09 && matrix.m[14] === 0).matrix.m
        for (const kind of Object.keys(TREE_SPECIES)) {
            assert.equal(pool.get(kind, 0), pool.get(kind, TREE_VARIANT_COUNT))
            assert.equal(pool.get(kind, 0).yaw, sameSeed.get(kind, 0).yaw)
            assert.notEqual(pool.get(kind, 0).yaw, otherSeed.get(kind, 0).yaw)
            const yaws = new Set()
            for (let i = 0; i < TREE_VARIANT_COUNT; i++) {
                const variant = pool.get(kind, i)
                const expanded = expandedPool.get(kind, i)
                assert.equal(expanded.yaw, variant.yaw)
                assert.equal(expanded.height, variant.height)
                assert.equal(expanded.spread, variant.spread)
                assert.deepEqual(geometry(expanded.models.SHADOW), geometry(variant.models.SHADOW))
                yaws.add(variant.yaw)
                for (const [detail, model] of Object.entries(variant.models)) {
                    const [min, max] = ranges[detail]
                    assert.ok(model.triangles >= min && model.triangles <= max,
                        `${kind} ${detail} variant ${i}: ${model.triangles}`)
                    assert.equal(model.triangles, [...model.shapes].reduce((total, [shape, parts]) =>
                        total + TREE_SHAPE_FACES[shape] * parts.length, 0))
                    assert.ok(model.shapes.size <= (detail === 'SHADOW' ? 3 : 4))
                    for (const parts of model.shapes.values()) {
                        assert.ok(parts.every(part => part.matrix.m.every(Number.isFinite) && part.length > 0))
                    }
                    if (detail === 'SHADOW') continue
                    const upgraded = expanded.models[detail]
                    const budget = TREE_FACE_BUDGET[detail] * 2
                    assert.ok(upgraded.triangles > budget - 28 && upgraded.triangles <= budget,
                        `${kind} ${detail} variant ${i} at 2×: ${upgraded.triangles}`)
                    assert.equal(upgraded.triangles, [...upgraded.shapes].reduce((total, [shape, parts]) =>
                        total + TREE_SHAPE_FACES[shape] * parts.length, 0))
                    assert.ok(upgraded.shapes.size <= 4)
                    assert.deepEqual(trunk(upgraded), trunk(model))
                }
            }
            assert.equal(yaws.size, TREE_VARIANT_COUNT)
            for (const detail of ['LOW', 'MEDIUM', 'HIGH']) {
                const base = TREE_FACE_BUDGET[detail]
                assert.ok(smallerPool.get(kind, 0).models[detail].triangles <= base * 0.5)
                const larger = largerPool.get(kind, 0).models[detail].triangles
                assert.ok(larger > base * 4 - 28 && larger <= base * 4)
            }
        }
    } finally { await server.close() }
})
