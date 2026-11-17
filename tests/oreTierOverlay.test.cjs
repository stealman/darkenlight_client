const {test} = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')
const vm = require('node:vm')

test('ore labels follow movement and world changes without viewport recalculation', () => {
    let position = {x: 950, z: 990}
    let map = []
    const labels = []
    class Vector3 { set(x,y,z) { Object.assign(this,{x,y,z}) } }
    const viewport = {visibleTileOffsets: [{x:0,z:0},{x:1,z:0}], getPositionOnScreen: p => ({x:p.x,y:p.z})}
    const deps = {
        '@babylonjs/core': {Vector3},
        '@/data/worldDataManager': {WorldDataManager: {getBlockMap: () => map}},
        '@/gm/GM': {GMManager: {}, GmTabs: {}},
        '@/data/myPlayer': {MyPlayer: {myChar: {getWeapon: () => ({hasWeaponTag: () => true}), getPositionRounded: () => position}}},
        '@/utils/viewport': {ViewportManager: viewport},
        '@/data/items/item': {WeaponTags: {PICKAXE:'pickaxe'}},
    }
    const exports = {}
    vm.runInNewContext(ts.transpileModule(readFileSync(join(__dirname,'../src/gui/gm/oreTierOverlay.ts'),'utf8'), {
        compilerOptions: {module:ts.ModuleKind.CommonJS},
    }).outputText, {exports,require: name => deps[name]})
    const ctx = {save(){},restore(){},strokeText(){},fillText:(...args)=>labels.push(args)}
    exports.GmOreTierOverlay.onFrame(ctx)
    assert.equal(labels.length,0)
    position = {x:10,z:20}
    map = [];map[11]=[];map[11][20]={minableOre:3,totalHeight:0};map[10]=[];map[10][20]={minableOre:1,totalHeight:0}
    exports.GmOreTierOverlay.onFrame(ctx)
    assert.equal(labels.length,1)
    assert.deepEqual(labels.pop(),['3',11.5,20.5])
    position = {x:11,z:20}
    exports.GmOreTierOverlay.onFrame(ctx)
    assert.equal(labels.length,1)
    assert.deepEqual(labels.pop(),['3',11.5,20.5])
})
