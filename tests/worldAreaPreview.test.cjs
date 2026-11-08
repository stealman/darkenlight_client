const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const {ref, watch} = require('vue')
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText
const geometry = {exports: {}}
new Function('exports', 'require', transpile('src/data/worldAreas.ts'))(geometry.exports, require)
const clone = value => JSON.parse(JSON.stringify(value))
class Vector3 {
    constructor(x,y,z) {Object.assign(this,{x,y,z})}
    clone() {return new Vector3(this.x,this.y,this.z)}
    add(v) {return new Vector3(this.x+v.x,this.y+v.y,this.z+v.z)}
    scale(n) {return new Vector3(this.x*n,this.y*n,this.z*n)}
}
const types = {POINTERDOWN:1, POINTERMOVE:2, POINTERUP:3}
const player = {worldId:1,myChar:{pos:{y:10},getModelHeight:()=>2}}
const data = {worldId:1,revision:0,response:ref(null),index:{areas:[{id:1,name:'Island',points:[1,1,10,1,10,10,1,10]}]}}
let sent=[],messages=[],handles=[]
const mesh = () => ({position:new Vector3(0,0,0),dispose(){this.disposed=true}})
global.window = {addEventListener(){},removeEventListener(){}}
const mod = {exports:{}}
new Function('exports','require',transpile('src/gm/worldAreaPreview.ts'))(mod.exports, id => ({
    '@babylonjs/core':{Vector3,Color3:class {},StandardMaterial:class {dispose(){}},Matrix:{Identity:()=>({})},PointerEventTypes:types,
        MeshBuilder:{CreateSphere:()=>{const m=mesh();handles.push(m);return m},CreateLines:(name,options)=>options.instance??mesh()}},
    'vue':{watch}, '@/data/myPlayer':{MyPlayer:player}, '@/data/worldAreaManager':{WorldAreaManager:data},
    '@/data/worldAreas':geometry.exports,'@/network/connector':{Connector:{sendMessage:m=>sent.push(m.d)}},
    '@/network/messages':{GMWorldAreasRequest:class {constructor(d){this.d=d}}},
    '@/gui/onScreenMessageManager':{OnScreenMessageManager:{addMessage:(...args)=>messages.push(args)}}
}[id]))
const preview = mod.exports.WorldAreaPreview
const scene = {pointerX:1,pointerY:1,activeCamera:{},getEngine:()=>({getRenderingCanvas:()=>null}),
    pick:()=>({pickedMesh:handles[0]}),createPickingRay:()=>({origin:new Vector3(scene.pointerX,20,scene.pointerY),direction:new Vector3(0,-1,0)})}
const pointer = (type, x, z, buttons=1) => {scene.pointerX=x;scene.pointerY=z;return preview.handlePointer({type,event:{pointerId:1,button:0,buttons,pointerType:'mouse'}},scene)}
const tick = () => new Promise(resolve=>setImmediate(resolve))
const show = () => {handles=[];preview.show(scene,1,1,64)}

test('vertex drag snaps and saves only on release, waits for acknowledgement', async()=>{
    show();assert.equal(handles.length,4);assert.equal(handles[0].position.y,12)
    assert(pointer(types.POINTERDOWN,1,1));pointer(types.POINTERMOVE,2.4,2.4)
    assert.equal(handles[0].position.x,2);assert.equal(sent.length,0)
    pointer(types.POINTERUP,2.4,2.4,0);assert.equal(sent.length,1)
    assert.equal(sent[0].revision,0);assert.deepEqual(sent[0].areas[0].points.slice(0,2),[2,2])
    pointer(types.POINTERDOWN,2,2);pointer(types.POINTERMOVE,3,3);pointer(types.POINTERUP,3,3,0);assert.equal(sent.length,1)
    data.index.areas=clone(sent[0].areas);data.revision=1
    data.response.value={worldId:1,revision:1,areas:data.index.areas,requestId:sent[0].requestId,saved:true}
    await tick();assert.equal(messages.at(-1)[1],'SUCCESS')
    preview.clear();assert(handles.every(h=>h.disposed))
})
test('invalid geometry rolls back without a save; cancelled pointer also restores', ()=>{
    show();const original=handles[0].position.clone();const count=sent.length
    pointer(types.POINTERDOWN,2,2);pointer(types.POINTERMOVE,10,10);pointer(types.POINTERUP,10,10,0)
    assert.equal(sent.length,count);assert.equal(handles[0].position.x,original.x);assert.equal(messages.at(-1)[1],'ERROR')
    pointer(types.POINTERDOWN,2,2);pointer(types.POINTERMOVE,3,3);pointer(types.POINTERMOVE,3,3,0)
    assert.equal(handles[0].position.x,original.x);assert.equal(sent.length,count)
    preview.clear()
})
test('server rejection rolls back and blocks further edits until reload', async()=>{
    show();pointer(types.POINTERDOWN,2,2);pointer(types.POINTERMOVE,3,3);pointer(types.POINTERUP,3,3,0)
    const request=sent.at(-1)
    data.response.value={worldId:1,revision:2,areas:data.index.areas,requestId:request.requestId,error:'Revision conflict'}
    await tick();assert.equal(handles[0].position.x,2)
    const count=sent.length;pointer(types.POINTERDOWN,2,2);pointer(types.POINTERMOVE,4,4);pointer(types.POINTERUP,4,4,0);assert.equal(sent.length,count)
    preview.clear()
})
test('switching worlds disposes all handles', ()=>{
    show();player.worldId=2;preview.update();assert(handles.every(h=>h.disposed));player.worldId=1
})
