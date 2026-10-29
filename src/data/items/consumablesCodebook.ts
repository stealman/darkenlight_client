import type {Item} from './item'

// Item classification must not import player, networking or rendering managers.
export const ConsumablesCodebook = {
    healingPotionIds: [1001, 1002, 1003],
    manaPotionIds: [1011, 1012, 1013],
    staminaPotionIds: [1021, 1022, 1023],
    woodIds: Array.from({length: 20}, (_, index) => 201 + index),
    foodIds: [351],

    isItemConsumable(item: Item): boolean {
        return this.getHealingPotionIds().includes(item.cbId) || this.getManaPotionIds().includes(item.cbId)
            || this.getStaminaPotionIds().includes(item.cbId) || this.getFoodIds().includes(item.cbId)
    },
    getHealingPotionIds(): number[] { return this.healingPotionIds },
    getManaPotionIds(): number[] { return this.manaPotionIds },
    getStaminaPotionIds(): number[] { return this.staminaPotionIds },
    getCampWoodIds(): number[] { return this.woodIds },
    getFoodIds(): number[] { return this.foodIds },
    isItemCampWood(item: Item): boolean {
        return item.cbType === 'R' && this.getCampWoodIds().includes(item.cbId)
    },
    isItemPotion(cbId: number): boolean {
        return this.getHealingPotionIds().includes(cbId) || this.getManaPotionIds().includes(cbId)
            || this.getStaminaPotionIds().includes(cbId)
    },
}
