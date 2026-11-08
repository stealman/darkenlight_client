// Run from any directory: node scripts/test-beveled-terrain.cjs [--benchmark]
const fs = require('fs'), ts = require('typescript'), vm = require('vm'), assert = require('assert');
process.chdir(require('path').resolve(__dirname, '..'));
const load = (path, require) => {
    const exports = {};
    vm.runInThisContext('(function(exports,require){' + ts.transpileModule(fs.readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText + '\n})')(exports, require);
    return exports;
};
(async () => {
    const core = await import('@babylonjs/core/index.js');
    const geo = load('src/babylon/world/beveledTerrainBlock.ts', () => core);
    // Every selectable solid variant must close at its roof/wall junctions.
    const pairs = [5, 6, 10, 9];
    let variants = 0;
    for (let mask = 1; mask < 4096; mask++) {
        if (pairs.some((pair, corner) => (mask & (16 << corner)) && (mask & pair)
            || (mask & (256 << corner)) && (mask & 255) && (mask & pair) !== pair)) continue;
        for (const offset of [0, .04, .1]) {
            const data = geo.createBeveledTerrainVertexData(mask, false, offset);
            assert(data.positions.length / 3 <= 144, `Slot overflow: ${mask}`);
            const edges = new Map();
            const point = i => data.positions.slice(i * 3, i * 3 + 3);
            const key = p => p.map(n => n.toFixed(6).replace('-0.000000', '0.000000')).join(';');
            for (let i = 0; i < data.indices.length; i += 3) {
                const triangle = data.indices.slice(i, i + 3).map(point);
                for (let edge = 0; edge < 3; edge++) {
                    const k = [key(triangle[edge]), key(triangle[(edge + 1) % 3])].sort().join('/');
                    edges.set(k, (edges.get(k) || 0) + 1);
                }
                for (const [sx, sz, bit] of [[-1, -1, 256], [1, -1, 512], [1, 1, 1024], [-1, 1, 2048]]) {
                    if (!(mask & bit) || !triangle.every(p => Math.abs(sx * p[0] + sz * p[2] - (1 - geo.TERRAIN_VERTICAL_BEVEL_WIDTH)) < 1e-7)) continue;
                    const normalIndex = data.indices[i] * 3;
                    assert(data.normals[normalIndex] * sx + data.normals[normalIndex + 2] * sz > 0, `Inverted vertical cap: ${mask}`);
                }
            }
            assert([...edges.values()].every(count => count === 2), `Open geometry: ${mask}, offset ${offset}`);
            variants++;
        }
    }
    console.log(`PASS: ${variants} solid variants fit their slots and have closed geometry with outward vertical caps.`);
    function environment(file, realFreezer = false) {
        const engine = new core.NullEngine(), scene = new core.Scene(engine);
        const stats = { creates: 0, vertexUploads: 0, vertexBytes: 0, indexUploads: 0, invalidations: 0 };
        for (const [name, counter] of [['createDynamicVertexBuffer', 'creates'], ['updateDynamicVertexBuffer', 'vertexUploads'], ['updateDynamicIndexBuffer', 'indexUploads']]) {
            const original = engine[name].bind(engine);
            engine[name] = (...args) => {
                stats[counter]++;
                if (counter === 'vertexUploads') stats.vertexBytes += args[1].byteLength;
                return original(...args);
            };
        }
        let freezer = { invalidate() { stats.invalidations++; } };
        if (realFreezer) {
            const camera = new core.FreeCamera('camera', new core.Vector3(5, 15, -15), scene);
            camera.setTarget(new core.Vector3(5, 2, 5));
            freezer = load('src/babylon/scene/activeMeshFreezer.ts', () => core).ActiveMeshFreezer;
            freezer.initialize(scene); freezer.start();
        }
        const Materials = { planeMaterial: new core.StandardMaterial('plane', scene), terrainMaterial: new core.StandardMaterial('block', scene) };
        Object.values(Materials).forEach(m => m.disableLighting = true);
        const module = load(file, id => {
            if (id === '@babylonjs/core') return core;
            if (id.includes('beveledTerrainBlock')) return geo;
            if (id.includes('activeMeshFreezer')) return { ActiveMeshFreezer: freezer };
            if (id.includes('/materials')) return { Materials };
            if (id.includes('/settings')) return { Settings: { isShadowsEnabled: () => false } };
            if (id.includes('/lights')) return { Lights: { registerSharedLightMesh() {}, unregisterSharedLightMesh() {}, addShadowCaster() {}, removeShadowCaster() {} } };
            return {};
        });
        const manager = module.BeveledTerrain;
        manager.initialize(scene, null);
        function fill(shift, width = 20, edit = false) {
            manager.begin();
            for (let x = shift; x < shift + width; x++) for (let z = 0; z < width; z++) {
                const offset = [0, .04, .1][(x + z) % 3];
                manager.add(1 + (x * 13 + z * 7) % 255, (x + z) % 2 === 0, x, z,
                    edit && x === shift && z === 0 ? 3 : 2, offset, new core.Vector2(x % 8 + .5, 6.5));
            }
            manager.finish();
        }
        return { engine, scene, manager, stats, fill, freezer, module };
    }
    // Frozen rendering queues, retained picking data and GPU buffers survive
    // moves, slot eviction, edited data, growth and returning cached tiles.
    const env = environment('src/babylon/world/beveledTerrain.ts', true);
    env.fill(0, 6); env.scene.render(); env.scene.render();
    const batches = [...env.manager.batches.values()];
    const saved = batches.map(b => ({ b, sub: b.mesh.subMeshes[0], buffer: b.mesh.getVertexBuffer('position') }));
    const pick = (x, z) => env.scene.pickWithRay(new core.Ray(new core.Vector3(x, 10, z), new core.Vector3(0, -1, 0), 20));
    assert(pick(2, 2).hit);
    const points = batches.map(b => b.mesh.geometry._positions);
    const creates = env.stats.creates;
    for (const shift of [1, 2, 10, 20, 30, 20, 10, 2, 1, 0]) {
        env.fill(shift, 6); env.scene.render();
        saved.forEach(({ b, sub, buffer }, i) => {
            assert.strictEqual(b.mesh.subMeshes[0], sub, 'Moving recreated submesh');
            assert.strictEqual(b.mesh.getVertexBuffer('position'), buffer, 'Moving recreated GPU buffer');
            if (points[i]) assert.strictEqual(b.mesh.geometry._positions, points[i], 'Picking cache recreated');
            assert(b.slots.size <= b.capacity);
            assert.strictEqual(b.mesh.getIndices(), b.indices);
            assert.equal(b.mesh.subMeshes[0].indexCount, b.drawCount);
            for (let j = 0; j < b.drawCount; j++) {
                const index = b.indices[j];
                assert(index < b.positions.length / 3);
                if (b.mesh.geometry._positions) {
                    const p = b.mesh.geometry._positions[index];
                    assert.equal(p.x, b.positions[index * 3]);
                    assert.equal(p.y, b.positions[index * 3 + 1]);
                }
            }
        });
        assert(pick(shift + 2, 2).hit, 'Picking visible cached terrain failed');
        if (shift > 6) assert(!pick(0, 2).hit, 'Picking hit an invisible cached slot');
        const group = env.scene._renderingManager._renderingGroups[0]._opaqueSubMeshes;
        assert.equal(group.length, 2);
        batches.forEach(b => assert(group.data.slice(0, group.length).includes(b.mesh.subMeshes[0])));
    }
    assert.equal(env.stats.creates, creates);
    env.fill(0, 6, true); assert(pick(0, 0).pickedPoint.y > 2.9, 'Edited cached tile not updated');
    env.fill(0, 40); env.scene.render(); env.scene.render();
    assert([...env.manager.batches.values()].every(b => b.mesh.subMeshes[0].indexCount === b.drawCount));
    assert.equal(env.scene.meshes.length, 2);
    assert(pick(20, 20).hit, 'Picking after buffer growth failed');
    for (const b of env.manager.batches.values()) assert.equal(b.indices instanceof Uint32Array, b.capacity * b.stride > 65535);
    console.log('PASS: stable vertex/index buffers and frozen submeshes on moves; bounded LRU eviction; returning tiles; cache edits/growth; picking cache preserved and accurate; only 2 draws.');
    env.engine.dispose();

    // Stacked wall segments share x/z but must retain separate GPU slots.
    const wall = environment('src/babylon/world/beveledTerrain.ts');
    const tile = height => ({ type: 1, height, totalHeight: height });
    const map = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => tile(0)));
    map[1][1] = tile(3);
    const vertical = wall.module.terrainVerticalBevelMask;
    assert.equal(vertical(map, 1, 1, 3, new Set()), 3840);
    assert.equal(vertical(map, 1, 1, 1, new Set()), 3840);
    map[0][1] = tile(2);
    assert.equal(vertical(map, 1, 1, 1, new Set()), 1536, 'Hidden wall corners were beveled');
    map[0][1] = tile(0);
    const renderWall = () => {
        wall.manager.begin();
        for (const height of [1, 2, 3]) wall.manager.add(3840 | (height === 3 ? 15 : 0), false, 1, 1, height,
            height === 3 ? .04 : 0, new core.Vector2(.5, 6.5));
        wall.manager.finish();
    };
    renderWall();
    const wallBatch = wall.manager.batches.get(false);
    assert.equal(wallBatch.slots.size, 3);
    assert.equal(new Set([...wallBatch.slots.values()].map(s => s.id)).size, 3);
    const wallUploads = wall.stats.vertexUploads;
    renderWall();
    assert.equal(wall.stats.vertexUploads, wallUploads, 'Stationary wall uploaded geometry');
    for (const height of [1, 2, 3]) {
        const hit = wall.scene.pickWithRay(new core.Ray(new core.Vector3(1, height - .5, -2), new core.Vector3(0, 0, 1), 5));
        assert(hit.hit, `Missing stacked wall segment at height ${height}`);
    }
    assert.equal(wall.scene.meshes.length, 1);
    console.log('PASS: exposed corner selection, distinct stacked slots, continuous wall picking and zero stationary uploads.');
    wall.engine.dispose();

    // CPU-only benchmark; NullEngine deliberately excludes real GPU/driver time.
    if (process.argv.includes('--benchmark')) for (const file of ['src/babylon/world/beveledTerrain.ts']) {
        const test = environment(file);
        const route = [...Array(24).keys(), ...Array(24).keys()].map((x, i) => i < 24 ? x : 23 - x);
        for (const x of route) test.fill(x);
        const before = { ...test.stats }, samples = [];
        for (let repeat = 0; repeat < 2; repeat++) for (const x of route) {
            const started = performance.now(); test.fill(x); samples.push(performance.now() - started);
        }
        samples.sort((a, b) => a - b);
        console.log(JSON.stringify({ version: 'current',
            medianMs: +samples[Math.floor(samples.length * .5)].toFixed(3), p95Ms: +samples[Math.floor(samples.length * .95)].toFixed(3),
            vertexBufferCreations: test.stats.creates - before.creates,
            globalQueueInvalidations: test.stats.invalidations - before.invalidations,
            sceneMeshes: test.scene.meshes.length }));
        test.engine.dispose();
    }
})();
