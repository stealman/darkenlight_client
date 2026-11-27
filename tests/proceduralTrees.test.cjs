const assert = require('node:assert/strict')
const {test} = require('node:test')
const {createServer} = require('vite')

test('procedural trees reuse a deterministic pool within each mesh budget', async () => {
    const server = await createServer({configFile: false, server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent'})
    try {
        const {TreeVariants} = await server.ssrLoadModule('/src/babylon/world/trees/treeGenerator.ts')
        const {TREE_SPECIES, TREE_VARIANT_COUNT, TREE_SHAPE_FACES, TREE_FACE_BUDGET, TREE_BUDGET_MULTIPLIER,
            TREE_PROTOTYPE_FACE_BUDGET} =
            await server.ssrLoadModule('/src/babylon/world/trees/treeSpecies.ts')
        const {createTreeGeometry} = await server.ssrLoadModule('/src/babylon/world/trees/treeGeometry.ts')
        const {getTreeInstanceTemplates, placeTreeShape} =
            await server.ssrLoadModule('/src/babylon/world/trees/treeInstanceTemplates.ts')
        const {createTreeSnowFootprint, treeSnowDistance, newTreeSnowBands} =
            await server.ssrLoadModule('/src/babylon/world/trees/treeGroundSurface.ts')
        const previousRegion = {left: 16.5, top: 22.5, width: 12, depth: 10}
        for (const dx of [-12, -4, 0, 4, 12]) for (const dz of [-10, -3, 0, 3, 10]) {
            const next = {...previousRegion, left: previousRegion.left + dx, top: previousRegion.top + dz}
            const contains = (region, x, z) => x >= region.left && x < region.left + region.width
                && z >= region.top && z < region.top + region.depth
            const bands = newTreeSnowBands(next, previousRegion)
            for (let x = next.left + .5; x < next.left + next.width; x++) {
                for (let z = next.top + .5; z < next.top + next.depth; z++) {
                    assert.equal(bands.filter(band => contains(band, x, z)).length, contains(previousRegion, x, z) ? 0 : 1)
                }
            }
        }
        for (const phase of [0, .16, .32, .72, .88]) {
            const near = createTreeSnowFootprint('spruce', 9, 7, 0, .5, .2, .2, phase)
            const wide = createTreeSnowFootprint('spruce', 9, 7, 0, .5, .9, .8, phase)
            const fir = createTreeSnowFootprint('fir', 9, 7, 0, .5, .9, .8, phase)
            assert.ok(wide.radius > near.radius && wide.strength > near.strength)
            assert.ok(treeSnowDistance(0, 0, wide) < -1.75)
            assert.ok(treeSnowDistance(.45, 0, wide) < -1.75)
            assert.ok(treeSnowDistance(.72 * wide.radius, 0, wide) < treeSnowDistance(-.72 * wide.radius, 0, wide))
            assert.ok(fir.radius > wide.radius)
            assert.ok(treeSnowDistance(-.45, 0, fir) < -1.75)
            assert.ok(treeSnowDistance(-.43 * wide.radius, 0, wide) > 0)
            assert.ok(treeSnowDistance(-.43 * near.radius, 0, near) < 0)
            assert.ok(treeSnowDistance(wide.reach, 0, wide) >= 1.8)
            for (const species of ['autumn', 'twisted']) {
                const bare = createTreeSnowFootprint(species, 9, 7, 0, .5, .9, .8, phase)
                assert.equal(treeSnowDistance(0, 0, bare), 1.8)
                assert.equal(bare.rootSnow, 1)
            }
        }
        const {buildTreeRevealIndex, collectTreeRevealCandidates, overlapsTreeReveal, projectTreeBounds, TreeRevealFrustum} =
            await server.ssrLoadModule('/src/babylon/world/trees/treeRevealBounds.ts')
        const {Matrix, Mesh, NullEngine, Quaternion, Scene, Vector3, Vector4} = await import('@babylonjs/core')
        const projected = {min: Vector3.Zero(), max: Vector3.Zero()}
        const bounds = {min: new Vector3(-.2, -.2, .2), max: new Vector3(.2, .2, .4)}
        const reveal = new Vector4(0, 0, 1, .5)
        assert.ok(projectTreeBounds(bounds, Matrix.Identity(), Vector3.Zero(), projected))
        assert.ok(overlapsTreeReveal(projected, reveal, .2, .2, false))
        assert.equal(overlapsTreeReveal(projected, reveal, .2, .2, true), false)
        reveal.x = .8
        assert.equal(overlapsTreeReveal(projected, reveal, .2, .2, false), false)
        const playerFrustum = new TreeRevealFrustum(), targetFrustum = new TreeRevealFrustum()
        const perspective = Matrix.PerspectiveFovLH(Math.PI / 2, 1, .1, 100)
        const target = Vector3.TransformCoordinates(new Vector3(0, 0, 8), perspective)
        const entry = (id, x, z) => ({placement: {id}, bounds: {min: new Vector3(x - .2, -.2, z - .2),
            max: new Vector3(x + .2, .2, z + .2)}})
        const index = buildTreeRevealIndex([entry(1, 0, 4), entry(2, 3, 4), entry(3, 0, 9), entry(4, -3, 4)])
        const candidates = []
        playerFrustum.update(perspective, new Vector4(0, 0, 1, target.z), .15, .15, false)
        targetFrustum.update(perspective, new Vector4(.75, 0, 1, target.z), .15, .15, false)
        collectTreeRevealCandidates(index, playerFrustum, targetFrustum, candidates)
        assert.deepEqual(candidates.map(({placement}) => placement.id).sort(), [1, 2])
        candidates.length = 0
        playerFrustum.update(perspective, new Vector4(-.4, 0, 1, target.z), .05, .05, false)
        targetFrustum.update(perspective, Vector4.Zero(), 0, 0, false)
        collectTreeRevealCandidates(index, playerFrustum, targetFrustum, candidates)
        assert.deepEqual(candidates, [])
        const engine = new NullEngine()
        try {
            const scene = new Scene(engine)
            for (const [shape, triangles] of Object.entries(TREE_SHAPE_FACES)) {
                const mesh = new Mesh(shape, scene)
                createTreeGeometry(mesh, shape)
                assert.equal(mesh.getTotalIndices(), triangles * 3)
                if (shape === 'foliageCard' || shape === 'birchCard') assert.equal(mesh.getTotalVertices(), 9)
                if (!['leaf', 'needles', 'foliageCard', 'birchCard'].includes(shape)) continue
                const positions = mesh.getVerticesData('position')
                const surface = mesh.getVerticesData('treeSurface')
                for (let i = 0; i < positions.length; i += 3) {
                    assert.equal(surface[i], positions[i])
                    assert.equal(surface[i + 1], positions[i + 2])
                }
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
        const prototypePool = new TreeVariants(671439, 2, true)
        for (const kind of Object.keys(TREE_SPECIES)) {
            const variant = prototypePool.get(kind, 3)
            const position = new Vector3(957, 14.45, 917)
            const size = .73
            const style = 4.365
            const transform = Matrix.Compose(new Vector3(size, size, size), Quaternion.RotationYawPitchRoll(variant.yaw, 0, 0), position)
            for (const detail of ['LOW', 'MEDIUM', 'HIGH', 'SHADOW']) {
                const shapes = getTreeInstanceTemplates(variant, detail)
                assert.equal(getTreeInstanceTemplates(variant, detail), shapes)
                for (const [shape, template] of shapes) {
                    const packed = placeTreeShape(template, position, size, style, false, 1.5)
                    assert.equal(packed.buffers.treeShape, template.treeShape)
                    assert.equal(packed.buffers.treeJointA, template.treeJointA)
                    assert.equal(packed.buffers.treeJointB, template.treeJointB)
                    variant.models[detail].shapes.get(shape).forEach((piece, i) => {
                        const expected = piece.matrix.multiply(transform).m
                        for (let j = 0; j < 16; j++) assert.ok(Math.abs(packed.buffers.matrix[i * 16 + j] - expected[j]) < .00013)
                        assert.equal(packed.buffers.treeStyle[i * 4 + 2], Math.fround(style))
                        assert.equal(packed.buffers.treeStyle[i * 4 + 3], Math.fround(position.y))
                        assert.equal(packed.buffers.treeBarkLimit[i], piece.trunk ? 1.5 : 0)
                    })
                }
            }
        }
        const largestPiece = Math.max(...Object.values(TREE_SHAPE_FACES))
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
                    const max = TREE_FACE_BUDGET[detail]
                    const min = detail === 'SHADOW' ? 1 : max - largestPiece + 1
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
                    const budget = TREE_FACE_BUDGET[detail] * TREE_BUDGET_MULTIPLIER.default
                    assert.ok(upgraded.triangles > budget - largestPiece && upgraded.triangles <= budget,
                        `${kind} ${detail} variant ${i} at ${TREE_BUDGET_MULTIPLIER.default}×: ${upgraded.triangles}`)
                    assert.equal(upgraded.triangles, [...upgraded.shapes].reduce((total, [shape, parts]) =>
                        total + TREE_SHAPE_FACES[shape] * parts.length, 0))
                    assert.ok(upgraded.shapes.size <= 4)
                    assert.deepEqual(trunk(upgraded), trunk(model))
                }
            }
            assert.equal(yaws.size, TREE_VARIANT_COUNT)
            for (let i = 0; i < TREE_VARIANT_COUNT; i++) {
                const prototype = prototypePool.get(kind, i)
                const legacy = expandedPool.get(kind, i)
                const cardShape = kind === 'birch' ? 'birchCard' : 'foliageCard'
                for (const [detail, budget] of Object.entries(TREE_PROTOTYPE_FACE_BUDGET)) {
                    const model = prototype.models[detail]
                    assert.ok(model.triangles <= budget && model.triangles > budget - largestPiece, `${kind} ${detail}: ${model.triangles}`)
                    assert.equal(model.shapes.has(cardShape), kind !== 'twisted')
                    assert.ok(!model.shapes.has('needles') && !model.shapes.has('leaf'))
                    assert.equal(model.triangles, [...model.shapes].reduce((total, [shape, parts]) =>
                        total + TREE_SHAPE_FACES[shape] * parts.length, 0))
                    assert.deepEqual(trunk(model), trunk(legacy.models[detail]))
                }
                const shadow = prototype.models.SHADOW
                assert.ok(shadow.triangles <= TREE_FACE_BUDGET.SHADOW)
                assert.ok(!shadow.shapes.has('foliageCard') && !shadow.shapes.has('birchCard'))
                if (kind === 'birch') assert.ok(shadow.shapes.has('needlesShadow'))
                else assert.deepEqual(geometry(shadow), geometry(legacy.models.SHADOW))
            }
            for (const detail of ['LOW', 'MEDIUM', 'HIGH']) {
                const base = TREE_FACE_BUDGET[detail]
                assert.ok(smallerPool.get(kind, 0).models[detail].triangles <= base * 0.5)
                const larger = largerPool.get(kind, 0).models[detail].triangles
                assert.ok(larger > base * 4 - largestPiece && larger <= base * 4)
            }
        }
    } finally { await server.close() }
})
