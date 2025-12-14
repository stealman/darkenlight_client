import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { MeshAnimation } from '@/babylon/animations/animation'
import { MonsterCodebook } from '@/babylon/monsters/codebook/monsterCodebook'

export const MonsterBonesAnims = {

    initSkeleton(model: MonsterModel) {
        model.chestBone = model.skeleton.bones.find(b => b.id === "Bone")!
        model.headBone = model.skeleton.bones.find(b => b.id === "Bone.001")!
        model.lhandBone = model.skeleton.bones.find(b => b.id === "Bone.005")!
        model.rhandBone = model.skeleton.bones.find(b => b.id === "Bone.008")!

        model.chestBoneW = model.template.walkSkeleton.bones.find(b => b.id === "Bone")!
        model.headBoneW = model.template.walkSkeleton.bones.find(b => b.id === "Bone.001")!
        model.lhandBoneW = model.template.walkSkeleton.bones.find(b => b.id === "Bone.005")!
        model.rhandBoneW = model.template.walkSkeleton.bones.find(b => b.id === "Bone.008")!

        const animations = [
            { name: "Idle", startFrame: 0, endFrame: 75 },
            { name: "Walk", startFrame: 76, endFrame: 225 }
        ]

        const groups = animations.map(({ name, startFrame, endFrame }) => {
            return new MeshAnimation(model.animation.clone(name + Math.random(), undefined, true), startFrame, endFrame)
        });

        model.idleAnim = groups[0]
        model.walkAnim = groups[1]

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
