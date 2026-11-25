const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const {test} = require('node:test')
const ts = require('typescript')

const source = readFileSync(join(__dirname, '../src/babylon/world/statics/staticVariation.ts'), 'utf8')
const code = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText
const variation = {}
new Function('exports', code)(variation)

test('static variation keys survive reconstruction and do not depend on sampling order', () => {
    const tile = {x: 14, z: 49}
    const first = variation.createStaticVariation(1, tile, 207)
    const height = first.unit(0, 2)
    first.signed(7, 3)

    const recreated = variation.createStaticVariation(1, {...tile}, 207)
    assert.equal(recreated.unit(0, 2), height)
    assert.equal(first.signed(0, 2), height * 2 - 1)
    assert.notEqual(first.unit(1, 2), height)
    assert.notEqual(first.unit(0, 3), height)
    assert.notEqual(variation.createStaticVariation(2, tile, 207).unit(0, 2), height)
    assert.notEqual(variation.createStaticVariation(1, {x: 15, z: 49}, 207).unit(0, 2), height)
    assert.notEqual(variation.createStaticVariation(1, tile, 208).unit(0, 2), height)
})

test('a render batch can move a static part without altering the initialized shape', async () => {
    const {Matrix} = await import('@babylonjs/core/index.js')
    const local = Matrix.Scaling(0.1, 0.8, 0.12).setTranslationFromFloats(0.25, 0.5, -0.25)
    const first = variation.placeStaticPart(local, {x: 8, y: 2, z: 16})
    first.setTranslationFromFloats(100, 100, 100)
    const second = variation.placeStaticPart(local, {x: 8, y: 3, z: 16})

    assert.deepEqual(Array.from(local.m.slice(12, 15)), [0.25, 0.5, -0.25])
    assert.deepEqual(Array.from(second.m.slice(12, 15)), [8.25, 3.5, 15.75])
    assert.deepEqual(Array.from(second.m.slice(0, 12)), Array.from(local.m.slice(0, 12)))
})
