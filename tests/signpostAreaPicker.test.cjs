const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
const source=ts.createSourceFile('signpost.ts',fs.readFileSync('src/babylon/world/statics/objects/woodenSignpost.ts','utf8'),ts.ScriptTarget.Latest,true)
let config
const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='SIGNPOST_DIRECTIONS')config=new Function('return ('+node.initializer.getText(source)+')')();ts.forEachChild(node,visit)}
visit(source)
let sent=[]
const mod={exports:{}}
new Function('exports','require',ts.transpileModule(fs.readFileSync('src/gm/signpostAreaPicker.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(mod.exports,id=>({
    '@/network/connector':{Connector:{sendMessage:msg=>sent.push(msg.d)}},
    '@/network/messages':{GMWorldAreasRequest:class {constructor(d){this.d=d}}},
    '@/babylon/world/statics/objects/woodenSignpost':{SIGNPOST_DIRECTIONS:config},
}[id]))
const {directionToSignpostTarget,SignpostAreaPicker}=mod.exports
test('nearest direction matches all eight world vectors and translated origins',()=>{
    for(const [direction,{yaw}] of Object.entries(config)){
        assert.equal(directionToSignpostTarget(100,200,{x:100+Math.cos(yaw)*20,z:200-Math.sin(yaw)*20}),direction)
    }
    assert.equal(directionToSignpostTarget(100,200,{x:100,z:200}),null)
    assert.equal(directionToSignpostTarget(0,0,{x:10,z:1}),'+X')
})
test('picker loads authoritative targets, ignores unrelated responses and refreshes on context changes',()=>{
    const picker=new SignpostAreaPicker()
    picker.refresh(1,2);assert.equal(sent.at(-1).action,'signpostTargets');assert(picker.loading)
    const request=sent.at(-1)
    picker.receive({worldId:1,requestId:'other'});assert(picker.loading)
    picker.receive({worldId:1,requestId:request.requestId,signpostTargets:{currentAreaId:2,currentAreaName:'Island',targets:[{id:3,name:'Town',x:5,z:6,depth:0}]}})
    assert(!picker.loading);assert.equal(picker.targets[0].name,'Town')
    const count=sent.length;picker.refresh(1,2);assert.equal(sent.length,count)
    picker.refresh(1,3);assert(picker.loading);assert.equal(picker.targets.length,0)
    picker.receive({worldId:1,requestId:sent.at(-1).requestId,error:'Failed'});assert.equal(picker.error,'Failed')
    picker.refresh(1,3,true);assert(picker.loading);picker.dispose()
})
