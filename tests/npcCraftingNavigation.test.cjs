const {test} = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')
const {parse, compileScript, compileTemplate} = require('@vue/compiler-sfc')

const filename = 'src/App.vue'
const {descriptor} = parse(readFileSync(join(__dirname, '..', filename), 'utf8'))

test('hidden crafting dialogs are unmounted, removing their Escape listener', () => {
    const template = compileTemplate({source: descriptor.template.content, filename, id: 'npc-navigation'})
    assert.deepEqual(template.errors, [])
    compileScript(descriptor, {id: 'npc-navigation'})
    assert.ok(descriptor.template.content.includes('<CraftingDialog v-if="displayCraftingDialog"'))
})

test('closing returns once to NPC crafting; hidden dialogs and craft submission cannot reopen it', () => {
    const ast = ts.createSourceFile('App.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true)
    const declaration = ast.statements.filter(ts.isVariableStatement)
        .flatMap(statement => [...statement.declarationList.declarations])
        .find(declaration => declaration.name.getText(ast) === 'onCloseCraftingMenu')
    const visible = {value: true}
    const calls = []
    const close = new Function('displayCraftingDialog', 'isDead', 'loginRequestSentFlag', 'NpcInteractionManager',
        'return ' + ts.transpileModule(declaration.initializer.getText(ast), {}).outputText)(
        visible, {value: false}, {value: true}, {useNpc: (...args) => calls.push(args)})
    close(7)
    close(7)
    assert.deepEqual(calls, [[7, 'crafting']])
    visible.value = true
    close(undefined)
    close(7)
    assert.equal(visible.value, false)
    assert.equal(calls.length, 1)
})
