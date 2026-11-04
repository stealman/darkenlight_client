const {test} = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')
const vm = require('node:vm')

test('sheared sheep use their own shared texture, including selection, and regrow wool', () => {
    const loader = {shavedSheepMaterial: {}, selectedShavedSheepMaterial: {}}
    const Lights = {daylightFactor: 0.5}
    let now = 1000
    const exports = {}
    const source = readFileSync(join(__dirname, '../src/babylon/monsters/monsterModel.ts'), 'utf8')
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText, {exports, Date: {now: () => now}, require: name => ({
        '@/babylon/monsters/monsterLoader': {MonsterLoader: loader},
        '@/babylon/scene/lights': {Lights},
    }[name] || {})})
    const template = {material: {}, selectedMaterial: {}}
    const makeModel = (id, woolReadyAt) => {
        const model = Object.create(exports.MonsterModel.prototype)
        Object.assign(model, {type: {id}, parent: {woolReadyAt}, template,
            mesh: {material: template.material}, selected: false, selectedMaterialApplied: false})
        model.node = {getChildMeshes: () => [model.mesh]}
        return model
    }
    const sheep = makeModel(1201, 2000)
    const otherSheep = makeModel(1201, 0)
    sheep.refreshSelectedMaterial()
    assert.equal(sheep.mesh.material, loader.shavedSheepMaterial)
    otherSheep.refreshSelectedMaterial()
    assert.equal(otherSheep.mesh.material, template.material)
    sheep.selected = true
    sheep.refreshSelectedMaterial()
    assert.equal(sheep.mesh.material, loader.selectedShavedSheepMaterial)
    now = 2000
    sheep.refreshSelectedMaterial()
    assert.equal(sheep.mesh.material, template.selectedMaterial)
    sheep.selected = false
    sheep.refreshSelectedMaterial()
    assert.equal(sheep.mesh.material, template.material)
    const deer = makeModel(1101, 5000)
    deer.refreshSelectedMaterial()
    assert.equal(deer.mesh.material, template.material)
})
