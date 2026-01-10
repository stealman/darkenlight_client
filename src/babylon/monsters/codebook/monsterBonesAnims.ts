import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { MeshAnimation } from '@/babylon/animations/animation'
import { MonsterCodebook } from '@/babylon/monsters/codebook/monsterCodebook'

export const MonsterBonesAnims = {

    initSkeleton(model: MonsterModel) {
        model.chestBone = model.skeleton.bones.find(b => b.id === "Bone")!
        model.headBone = model.skeleton.bones.find(b => b.id === "Bone.001")!
        model.lhandBone = model.skeleton.bones.find(b => b.id === "Bone.005")!
        model.rhandBone = model.skeleton.bones.find(b => b.id === "Bone.008")!

        const animations = [
            { name: "Idle", startFrame: 0, endFrame: 75 },
            { name: "Walk", startFrame: 76, endFrame: 225 },
            { name: "Attack", startFrame: 226, endFrame: 300 },
            { name: "AttackSlash", startFrame: 326, endFrame: 400 }
        ]

        const groups = animations.map(({ name, startFrame, endFrame }) => {
            return new MeshAnimation(model.animation.clone(name + Math.random(), undefined, true), startFrame, endFrame)
        });

        model.idleAnim = groups[0]
        model.walkAnim = groups[1]
        model.attackAnim = groups[2]
        model.attackAnim2 = groups[3]

        MonsterCodebook.initEquip(model)
    },

    initCat(model: MonsterModel) {
        const animations = [
            { name: "Idle", startFrame: 0, endFrame: 75 },
            { name: "Walk", startFrame: 76, endFrame: 225 }
        ]

        const groups = animations.map(({ name, startFrame, endFrame }) => {
            return new MeshAnimation(model.animation.clone(name + Math.random(), undefined, true), startFrame, endFrame)
        });

        model.idleAnim = groups[0]
        model.walkAnim = groups[1]
    }
}
