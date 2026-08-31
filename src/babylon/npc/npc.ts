import Character from '@/babylon/character/character'

export class Npc extends Character {
    type: string
    title: string
    wanderingRange: number

    constructor(data: any) {
        super({
            ...data,
            cls: 'FIGHTER',
            bsz: data.bsz ?? 0.8,
            equipSet: {}
        })
        this.type = data.type
        this.title = data.title ?? ''
        this.wanderingRange = data.wr ?? 0
        this.nameDisplayTime = Number.MAX_SAFE_INTEGER
    }

    onFrame(timeRate: number, actualTime: number, myChar: boolean) {
        super.onFrame(timeRate, actualTime, myChar)
        this.nameDisplayTime = Number.MAX_SAFE_INTEGER
    }

    getObjectType(): string {
        return 'N'
    }

    getRelationToMyPlayer(): 'ALLY' | 'ENEMY' | 'NEUTRAL' {
        return 'NEUTRAL'
    }
}
