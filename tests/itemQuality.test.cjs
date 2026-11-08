const assert = require('node:assert/strict')
const {test} = require('node:test')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const {runInNewContext} = require('node:vm')
const ts = require('typescript')

const messages = JSON.parse(readFileSync(join(__dirname, '../src/i18n/locales/en_items.json'), 'utf8'))
const t = key => key.split('.').reduce((value, part) => value?.[part], messages) ?? key
const compiled = ts.transpileModule(readFileSync(join(__dirname, '../src/data/items/item.ts'), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
})
const context = {exports: {}, Map, require: path => path === '@/i18n' ? {t} : {ConsumablesCodebook: {}}}
runInNewContext(compiled.outputText, context)
const {Item} = context.exports

const fromWire = quality => Item.fromData(JSON.parse(JSON.stringify({
    id: 1, cb: 100, tp: 'W', mId: 0, matId: 1, name: 'steel-longsword', img: '', slot: 'weapon',
    atts: {qual: quality, dur: 10, durM: 150},
})))

test('wire JSON attributes support every quality tier and repair name sorting', () => {
    const cases = [[25, ''], [89, ''], [90, 'Fine '], [94, 'Fine '],
        [95, 'Superior '], [97, 'Superior '], [98, 'Perfect '], [100, 'Perfect ']]
    const items = cases.map(([quality, prefix]) => {
        const item = fromWire(quality)
        assert.equal(item.name, `${prefix}Steel Longsword`)
        return item
    })
    assert.doesNotThrow(() => items.sort((first, second) => (first.name ?? '').localeCompare(second.name ?? '')))
})

test('Map attributes still work and missing or invalid quality has no prefix', () => {
    const item = fromWire(100)
    item.atts = new Map([['qual', 98]])
    assert.equal(item.name, 'Perfect Steel Longsword')
    for (const quality of [undefined, null, 'invalid']) assert.equal(fromWire(quality).name, 'Steel Longsword')
    item.atts = new Map()
    assert.equal(item.name, 'Steel Longsword')
})
