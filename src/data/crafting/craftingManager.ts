import { InventoryManager } from '@/data/InventoryManager'
import { CraftingInitMenuData, CraftingRecipe } from '@/network/messageIfs'

export const CraftingTypes = {
    COOKING: "COOKING",
    BLACKSMITHY: "BLACKSMITHY",
    BOWCRAFTING: "BOWCRAFTING",
    JEWELERY: "JEWELRY",
}

export const CraftingManager = {

    initialize() {},

    onFrame() {},

    submitCraftRequest(recipe: CraftingRecipe, quantity: number) {
        void recipe
        void quantity
    },

    processCraftingMenu(data: CraftingInitMenuData) {

        // Enrich the crafting menu data with the quantity of possible crafts based on the player's inventory
        for (const recipe of data.recipes as Array<typeof data.recipes[number] & { craftableQty?: number }>) {
            let craftableQty = Number.MAX_SAFE_INTEGER

            for (const ingredient of recipe.ing as Array<typeof recipe.ing[number] & { inventoryQty?: number }>) {
                ingredient.inventoryQty = InventoryManager.getTotalResourceItemCountByType(ingredient.res.cb)

                const requiredQty = Number(ingredient.qty)
                if (Number.isFinite(requiredQty) && requiredQty > 0) {
                    craftableQty = Math.min(craftableQty, Math.floor(ingredient.inventoryQty / requiredQty))
                }
            }

            recipe.craftableQty = craftableQty === Number.MAX_SAFE_INTEGER ? 0 : Math.max(0, craftableQty)
        }

        window.dispatchEvent(new CustomEvent('ui:open-crafting', {
            detail: data,
        }))
    }
}
