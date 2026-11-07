const assert = require('node:assert/strict')
const {test} = require('node:test')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function loadModule(path, dependencies) {
    const context = {exports: {}, require: name => {
        assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
        return dependencies[name]
    }}
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText, context)
    return context.exports
}

test('every resource has a localized description and potion tooltips show exact recovery amounts', () => {
    const resources = [1, 51, 52, 53, 119, 301, 351,
        ...Array.from({length: 12}, (_, i) => 101 + i),
        ...Array.from({length: 12}, (_, i) => 120 + i),
        ...Array.from({length: 6}, (_, i) => 201 + i),
        ...Array.from({length: 6}, (_, i) => 221 + i),
        231, 232, 233,
        1001, 1002, 1003, 1011, 1012, 1013, 1021, 1022, 1023]
    for (const locale of ['cs', 'en']) {
        const messages = JSON.parse(fs.readFileSync(`src/i18n/locales/${locale}_items.json`, 'utf8'))
        const t = (key, params = {}) => {
            const value = key.split('.').reduce((value, part) => value?.[part], messages)
            assert.equal(typeof value, 'string', `Missing ${locale} translation: ${key}`)
            return value.replace(/\{(\w+)\}/g, (_, name) => String(params[name]))
        }
        const descriptions = loadModule('src/data/items/resourceDescriptions.ts', {'@/i18n': {t}})
        const tooltip = loadModule('src/vue/views/inventory/itemTooltip.ts', {
            '@/i18n': {t}, '@/data/items/resourceDescriptions': descriptions,
        })
        for (const id of resources) {
            const description = descriptions.getResourceDescription(id)
            assert.ok(description?.length > 10, `${locale} resource ${id}`)
            assert.equal(tooltip.getItemTooltipData({cbType: 'R', cbId: id, name: 'Resource', atts: new Map()}).description, description)
            assert.equal(tooltip.getItemTooltipData({tp: 'R', cb: id, name: 'Resource', atts: {}}).description, description)
        }
        for (const baseId of [1001, 1011, 1021]) {
            for (let tier = 0; tier < 3; tier++) {
                assert.ok(descriptions.getResourceDescription(baseId + tier).includes(String((tier + 1) * 25)))
            }
        }
        assert.equal(descriptions.getResourceDescription(999999), null)
        assert.equal(tooltip.getItemTooltipData({tp: 'W', cb: 101, name: 'Sword', atts: {}}).description, null)
    }
})
