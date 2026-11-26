const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

test('all eight sign directions render, can be picked and produce the correct reading arrow', async () => {
    const core = await import('@babylonjs/core')
    const {Vector2, Vector3, Matrix, Ray} = core
    const source = fs.readFileSync('src/babylon/world/statics/objects/woodenSignpost.ts', 'utf8')
    const world = {
        block1: {matrices: [], uvData: []},
        addTerrainContactBlock(matrix, uv) {
            this.block1.matrices.push(matrix)
            this.block1.uvData.push(uv)
        },
    }
    const prefab = {matrices:[],uvData:[]}
    class BaseStaticObject {
        constructor(type, position, rotation, material) {this.renderPosition=position;this.material=material;this.prefab=prefab}
    }
    const mod = {exports:{}}
    const variation = {exports:{}}
    const variationSource = fs.readFileSync('src/babylon/world/statics/staticVariation.ts', 'utf8')
    new Function('exports', ts.transpileModule(variationSource, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(variation.exports)
    new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(mod.exports, id => ({
        '@babylonjs/core':{Vector2,Vector3,Matrix,Ray},
        './baseStaticObject':{BaseStaticObject},
        '../../worldRenderer':{WorldRenderer:world},
        '../../taperedBlockBatch':{TaperedBlockBatch:{add:(matrix, uv)=>world.addTerrainContactBlock(matrix, uv)}},
        '../staticVariation':variation.exports,
        '../staticWoodShape':{createWoodShape:()=>null},
        '../palisadeWoodJoin':{WOOD_POST_TOP_MOISTURE:12},
        '@/data/myPlayer':{MyPlayer:{worldId:1}},
        '@/babylon/materials':{MaterialEnum1:{WOOD_3:{uv:new Vector2()},WOOD_PLANKS:{uv:new Vector2()}}},
        '../staticSurfacePlanes':{StaticSurfaceAtlas:{inscriptions:[new Vector2(),new Vector2()]},StaticSurfacePlanes:{getPrefab:()=>prefab}},
        '@/i18n':{t:key=>key},
    }[id]))
    const {WoodenSignpost, SIGNPOST_DIRECTIONS} = mod.exports
    const expected = {'+X':[1,-1],'-X':[-1,1],'+Z':[-1,-1],'-Z':[1,1],'+X+Z':[0,-1],'+X-Z':[1,0],'-X+Z':[-1,0],'-X-Z':[0,1]}
    for (const [direction, config] of Object.entries(SIGNPOST_DIRECTIONS)) {
        const position = new Vector3(30,7,40)
        const sign = new WoodenSignpost(404, position, {signCount:1,sign1:direction,sign1Text:'Destination'})
        const entry = sign.getReadingEntries()[0]
        assert.equal(entry.direction,'signpost.'+config.name)
        const angle=entry.arrowRotation*Math.PI/180
        const axis=n=>Math.abs(n)<1e-6?0:Math.sign(n)
        assert.deepEqual([axis(Math.cos(angle)+Math.sin(angle)),axis(Math.sin(angle)-Math.cos(angle))],expected[direction])
        world.block1.matrices=[];world.block1.uvData=[];prefab.matrices=[];prefab.uvData=[]
        sign.render()
        assert.equal(world.block1.matrices.length,3)
        const centre = Vector3.TransformCoordinates(Vector3.Zero(),world.block1.matrices[1])
        assert(Math.abs(centre.x-position.x-Math.cos(config.yaw)*0.37)<1e-5)
        assert(Math.abs(centre.z-position.z+Math.sin(config.yaw)*0.37)<1e-5)
        const normal=new Vector3(Math.sin(config.yaw),0,Math.cos(config.yaw))
        const target=position.add(new Vector3(Math.cos(config.yaw)*0.8,1.92,-Math.sin(config.yaw)*0.8))
        assert(sign.intersectsRay(new Ray(target.add(normal.scale(2)),normal.scale(-1))))
        assert(!sign.intersectsRay(new Ray(target.add(new Vector3(0,0.3,0)).add(normal.scale(2)),normal.scale(-1))))
        assert(!sign.intersectsRay(new Ray(target.add(new Vector3(0,0.5,0)).add(normal.scale(2)),normal.scale(-1))))
    }
    for (const [directions, heights] of [
        [['+X', '+Z', '-Z'], [1.92, 1.92, 1.92]],
        [['+X', '+Z', '+X', '+X'], [1.92, 1.92, 1.61, 1.30]],
        [['+X+Z', '-X-Z', '+X+Z'], [1.92, 1.92, 1.61]],
    ]) {
        const metadata = {signCount: directions.length}
        directions.forEach((direction, i) => {metadata[`sign${i + 1}`] = direction})
        const sign = new WoodenSignpost(404, new Vector3(30,7,40), metadata)
        world.block1.matrices=[];world.block1.uvData=[];prefab.matrices=[];prefab.uvData=[]
        sign.render()
        heights.forEach((height, i) => {
            const frontY = prefab.matrices[i * 2].m[13]
            const backY = prefab.matrices[i * 2 + 1].m[13]
            assert(Math.abs((frontY + backY) / 2 - 7 - height) < 1e-5)
        })
        // A single west-pointing board is at the top, with no ghost hit at its old global row.
        if (directions[1] === '+Z') {
            const target = new Vector3(30, 7 + 1.92, 40.8)
            assert(sign.intersectsRay(new Ray(target.add(new Vector3(-2,0,0)),new Vector3(1,0,0))))
            assert(!sign.intersectsRay(new Ray(target.add(new Vector3(-2,-0.31,0)),new Vector3(1,0,0))))
        }
    }
    const fallback = new WoodenSignpost(404,Vector3.Zero(),{sign1:'invalid'})
    assert.equal(fallback.getReadingEntries()[0].direction,'signpost.north')
})
