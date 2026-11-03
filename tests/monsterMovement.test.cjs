const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Exercise the model's movement without initializing the browser or game scene.
const source = readFileSync(join(__dirname, '../src/babylon/monsters/monsterModel.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText
const exportsObject = {}
vm.runInNewContext(compiled, {exports: exportsObject, require: () => ({})})
const {MonsterModel} = exportsObject

test('monster position converges without overshooting, including a 100 ms frame', () => {
    for (const delta of [1 / 60, 1 / 30, 0.08, 0.1]) {
        const model = Object.create(MonsterModel.prototype)
        model.parent = {pos: {x: 12, y: 2, z: 7}, logicYpos: 3}
        model.node = {position: {x: 10, y: 2, z: 10}}
        model.mesh = {computeWorldMatrix() {}}
        model.resolveModelRotation = () => {}
        let previousDistance = Infinity
        for (let frame = 0; frame < 30; frame++) {
            model.resolveMovement(delta)
            const {x, y, z} = model.node.position
            assert.ok(x >= 10 && x <= 12, `x overshot at delta ${delta}`)
            assert.ok(z >= 7 && z <= 10, `z overshot at delta ${delta}`)
            assert.ok(y >= 2 && y <= 3, `y overshot at delta ${delta}`)
            const distance = Math.hypot(12 - x, 3 - y, 7 - z)
            assert.ok(distance <= previousDistance)
            previousDistance = distance
        }
    }
})
