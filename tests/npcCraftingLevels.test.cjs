const {test} = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')
const {ref, computed} = require('vue')
const {parse, compileScript, compileTemplate, compileStyle} = require('@vue/compiler-sfc')

const filename = 'src/vue/views/gm/NpcDetailsDialog.vue'
const {descriptor} = parse(readFileSync(join(__dirname, '..', filename), 'utf8'))
const gmAst = ts.createSourceFile('GM.ts', readFileSync(join(__dirname, '../src/gm/GM.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
const gmObject = gmAst.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(declaration => declaration.name.getText(gmAst) === 'GMManager').initializer

function gmMethod(name, dependencies = {}) {
    const method = gmObject.properties.find(property => property.name?.getText(gmAst) === name)
    return new Function(...Object.keys(dependencies), 'return ' + ts.transpileModule('({' + method.getText(gmAst) + '})', {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText)(...Object.values(dependencies))[name]
}


const messagesAst = ts.createSourceFile('messages.ts', readFileSync(join(__dirname, '../src/network/messages.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
const messageClass = messagesAst.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'GMNpcAction')
const GMNpcAction = new Function(ts.transpileModule(messageClass.getText(messagesAst).replace(/^export /, ''),
    {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText + ';return GMNpcAction')()

test('GM crafting editor compiles with level selectors for each enabled category', () => {
    compileScript(descriptor, {id: 'npc-crafting-levels'})
    assert.deepEqual(compileTemplate({source: descriptor.template.content, filename, id: 'npc-crafting-levels'}).errors, [])
    for (const style of descriptor.styles) assert.deepEqual(compileStyle({source: style.content, filename, id: 'npc-crafting-levels'}).errors, [])
})

test('GM selection, dialog editing, save and reopening retain independent levels and default legacy data', () => {
    let saved
    const manager = {
        selectedNpc: ref(null),
        selectNpcForEditing: gmMethod('selectNpcForEditing'),
        setSelectedNpcDetails: gmMethod('setSelectedNpcDetails'),
        saveSelectedNpc: gmMethod('saveSelectedNpc', {
            GMNpcAction,
            Connector: {sendMessage(message) {
                // Match the worker boundary: Vue proxies must not reach postMessage.
                const cloned = structuredClone(message)
                assert.equal(cloned.t, 1007)
                assert.equal(cloned.d.action, 'UPDATE')
                saved = cloned.d.data
            }},
        }),
    }
    const models = new Proxy({}, {get: () => ({modelId: 1})})
    const editor = new Function('ref', 'computed', 'useI18n', 'GMManager', 'EquipSlotModelsCb', 'defineExpose',
        descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\nreturn {openDialog, saveDetails, features, createFeature, npcGender, hairTypeId, hairColorId}')(
        ref, computed, () => ({t: key => key}), manager, models, () => {})
    const original = {id: 1, name: 'Artisan', spawn: {x: 5, z: 5}, type: 'common',
        features: [{type: 'crafting', settings: {itemCategories: ['weapons', 'potions'], categoryLevels: {weapons: 8, potions: 3}}}]}
    manager.selectNpcForEditing(original)
    editor.openDialog()
    assert.equal(editor.npcGender.value, 'M')
    assert.equal(editor.hairTypeId.value, 1)
    assert.equal(editor.hairColorId.value, 1)
    editor.npcGender.value = 'F'
    editor.hairTypeId.value = 4
    editor.hairColorId.value = 8
    const settings = editor.features.value[0].settings
    assert.equal(settings.categoryLevels.weapons, 8)
    assert.equal(settings.categoryLevels.potions, 3)
    assert.equal(settings.categoryLevels.bows, 1)
    settings.categoryLevels.weapons = 10
    settings.categoryLevels.potions = 7
    assert.equal(original.features[0].settings.categoryLevels.weapons, 8)
    editor.saveDetails()
    assert.equal(saved.gender, 'F')
    assert.equal(saved.hairTypeId, 4)
    assert.equal(saved.hairColorId, 8)
    assert.equal(saved.features[0].settings.categoryLevels.weapons, 10)
    assert.equal(saved.features[0].settings.categoryLevels.potions, 7)
    manager.selectNpcForEditing(saved)
    editor.openDialog()
    assert.equal(editor.npcGender.value, 'F')
    assert.equal(editor.hairTypeId.value, 4)
    assert.equal(editor.hairColorId.value, 8)
    assert.equal(editor.features.value[0].settings.categoryLevels.weapons, 10)
    assert.equal(editor.features.value[0].settings.categoryLevels.potions, 7)
    delete original.features[0].settings.categoryLevels
    manager.selectNpcForEditing(original)
    editor.openDialog()
    assert.equal(editor.features.value[0].settings.categoryLevels.weapons, 1)
    assert.equal(editor.createFeature('crafting').settings.categoryLevels.potions, 1)
})

test('NPC commands snapshot nested reactive data before it is sent to the worker', () => {
    const source = ref({id: 7, name: 'Renamed', equipment: {head: {modelId: 1, materialId: 2}},
        features: [{type: 'crafting', settings: {itemCategories: ['bows'], categoryLevels: {bows: 8}}}],
        guard: {patrolPoints: [{x: 5, z: 6}]}})
    const command = new GMNpcAction('UPDATE', source.value)
    const snapshot = structuredClone(command)
    source.value.name = 'Later edit'
    source.value.features[0].settings.categoryLevels.bows = 1
    assert.equal(snapshot.d.data.name, 'Renamed')
    assert.equal(snapshot.d.data.features[0].settings.categoryLevels.bows, 8)
    assert.equal(command.d.data.name, 'Renamed')
    assert.deepEqual(snapshot.d.data.guard.patrolPoints, [{x: 5, z: 6}])
})
