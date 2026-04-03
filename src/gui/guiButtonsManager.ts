import { GroundItemsManager } from '@/babylon/world/groundItemsManager'
import { TreeManager } from '@/babylon/world/treeManager'
import { InventoryManager } from '@/data/InventoryManager'
import { AudioManager } from '@/babylon/audio/audioManager'
import { MyPlayer } from '@/data/myPlayer'
import { WorldDataManager } from '@/data/worldDataManager'
import { WeaponTypes } from '@/data/items/item'
import { Connector } from '@/network/connector'
import { FireArrowsActionMsg, GatheringActionMsg, RestingActionMsg } from '@/network/messages'
import { CharacterAction, CharacterActions } from '@/data/actions/characterActions'

class GuiOpportunityButtonAction {
    name: string
    icon: string
    hoverIcon: string

    constructor(name: string, icon: string, hoverIcon: string) {
        this.name = name
        this.icon = icon
        this.hoverIcon = hoverIcon
    }
}

class GuiOpportunityButton {
    action: GuiOpportunityButtonAction
    htmlEl: HTMLDivElement
    visible: boolean = false

    constructor(action: GuiOpportunityButtonAction) {
        this.action = action
        this.htmlEl = document.createElement("div")
        this.htmlEl.id = `btn-opportunity-${action.name.toLowerCase()}`
        this.htmlEl.className = "gui-action-button"
        this.htmlEl.innerHTML = `
            <img class="action-icon" src="/images/icons/buttons/${action.icon}.png" />
            <img class="action-icon-hover" src="/images/icons/buttons/${action.hoverIcon}.png" />
        `
        this.htmlEl.style.display = "none"
    }

    setVisible(visible: boolean) {
        if (this.visible === visible) {
            return
        }
        this.visible = visible
        this.htmlEl.style.display = visible ? "block" : "none"
    }

    setSize(size: number) {
        this.htmlEl.style.width = `${size}px`
        this.htmlEl.style.height = `${size}px`
    }
}

export const GuiOpportunityActions = {
    PICKUP_ITEM: new GuiOpportunityButtonAction("PICKUP_ITEM", "btn_pick", "btn_pick_hover"),
    MINING: new GuiOpportunityButtonAction("MINING", "btn_pickaxe", "btn_pickaxe_hover"),
    LUMBERJACKING: new GuiOpportunityButtonAction("LUMBERJACKING", "btn_lumber", "btn_lumber_hover"),
    RESTING: new GuiOpportunityButtonAction("RESTING", "btn_rest", "btn_rest_hover"),
    COOKING: new GuiOpportunityButtonAction("COOKING", "btn_cooking", "btn_cooking_hover"),
}

export const GuiButtonsManager = {
    size: 32 as number,
    fireArrowsMessageCooldown: 5000 as number,
    lastFireArrowsMessageTime: 0 as number,
    btnBackpack: null as HTMLDivElement,
    btnCharacter: null as HTMLDivElement,
    opportunityButtonsPanel: null as HTMLElement,
    opportunityButtons: new Map<string, GuiOpportunityButton>(),

    initialize() {
        this.btnBackpack = document.getElementById("btn-backpack") as HTMLDivElement
        this.btnCharacter = document.getElementById("btn-character") as HTMLDivElement
        this.opportunityButtonsPanel = document.getElementById("opportunity-action-buttons") as HTMLElement
        this.createOpportunityButtons()
        this.renderOpportunityButtons()
        this.setSize(this.size)
    },

    createOpportunityButtons() {
        this.opportunityButtons.clear()
        this.opportunityButtons.set(GuiOpportunityActions.PICKUP_ITEM.name, new GuiOpportunityButton(GuiOpportunityActions.PICKUP_ITEM))
        this.opportunityButtons.set(GuiOpportunityActions.RESTING.name, new GuiOpportunityButton(GuiOpportunityActions.RESTING))

        this.opportunityButtons.set(GuiOpportunityActions.MINING.name, new GuiOpportunityButton(GuiOpportunityActions.MINING))
        this.opportunityButtons.set(GuiOpportunityActions.LUMBERJACKING.name, new GuiOpportunityButton(GuiOpportunityActions.LUMBERJACKING))
        this.opportunityButtons.set(GuiOpportunityActions.COOKING.name, new GuiOpportunityButton(GuiOpportunityActions.COOKING))
    },

    renderOpportunityButtons() {
        if (!this.opportunityButtonsPanel) {
            return
        }

        this.opportunityButtonsPanel.innerHTML = ""
        this.opportunityButtons.forEach((button) => {
            button.htmlEl.onpointerdown = (e) => {
                e.preventDefault()
                this.onclickOpportunityButton(button.action.name)
            }
            button.htmlEl.onpointerup = (e) => {
                e.preventDefault()
            }
            this.opportunityButtonsPanel.appendChild(button.htmlEl)
        })
    },

    updatePositions(miniMapSize: number) {
        this.btnCharacter.style.right = `${miniMapSize + 5}px`
        this.btnCharacter.style.top = `5px`

        this.btnBackpack.style.right = `${miniMapSize + 5}px`
        this.btnBackpack.style.top = `${this.btnCharacter.offsetTop + this.btnCharacter.offsetHeight + 5}px`
    },

    onFrame() {
        // Show pickup button if there's an item nearby
        this.opportunityButtons.get(GuiOpportunityActions.PICKUP_ITEM.name)!.setVisible(GroundItemsManager.nearbyItem !== null)

        const coveredBlocks = MyPlayer.myChar ? WorldDataManager.getCoveredBlocks(MyPlayer.myChar.pos, MyPlayer.myChar.getBoxSize()) : []

        // Show mining button if any covered block is mineable and the player has a pickaxe available
        const hasMineableCoveredBlock = coveredBlocks.some(block => block.minableCoal || block.minableOre)
        this.opportunityButtons.get(GuiOpportunityActions.MINING.name)!.setVisible(
            hasMineableCoveredBlock && MyPlayer.hasWaponTypeInHandOrInventory(WeaponTypes.PICKAXE)
        )

        this.opportunityButtons.get(GuiOpportunityActions.LUMBERJACKING.name)!.setVisible(
            TreeManager.isAnyTreeInDistance(MyPlayer.myChar.pos, 1.5) && MyPlayer.hasWaponTypeInHandOrInventory(WeaponTypes.GREAT_AXE)
        )

        this.opportunityButtons.get(GuiOpportunityActions.RESTING.name)!.setVisible(MyPlayer.nearFireplace !== null)
        this.opportunityButtons.get(GuiOpportunityActions.COOKING.name)!.setVisible(MyPlayer.nearFireplace !== null)

        this.trySendFireArrowsAction()
    },

    onclickOpportunityButton(actionName: string) {
        AudioManager.playGuiButtonClick()
        switch (actionName) {
            case GuiOpportunityActions.PICKUP_ITEM.name:
                this.clickOnPickupItemButton()
                break
            case GuiOpportunityActions.MINING.name:
                this.clickOnMiningButton()
                break
            case GuiOpportunityActions.LUMBERJACKING.name:
                this.clickOnLumberjackingButton()
                break
            case GuiOpportunityActions.RESTING.name:
                this.clickOnRestingButton()
                break
            case GuiOpportunityActions.COOKING.name:
                this.clickOnCookingButton()
                break
        }
    },

    clickFirstAvailableOpportunityButton() {
        for (const button of this.opportunityButtons.values()) {
            if (!button.visible) {
                continue
            }
            this.onclickOpportunityButton(button.action.name)
            return true
        }
        return false
    },

    clickOnPickupItemButton() {
        InventoryManager.pickItem()
    },

    clickOnMiningButton() {
        const hasPickaxeInHand = MyPlayer.myChar.getWeapon()?.slotInfo?.weaponType === WeaponTypes.PICKAXE
        if (!hasPickaxeInHand) {
            const firstPickaxeInInventory = InventoryManager.inventory.find(
                item => item?.slotInfo?.weaponType === WeaponTypes.PICKAXE
            )
            if (!firstPickaxeInInventory) {
                return
            }

            InventoryManager.equipItem(firstPickaxeInInventory)
        }

        Connector.sendMessage(new GatheringActionMsg(CharacterActions.MINING.name))
    },

    clickOnLumberjackingButton() {
        const hasGreatAxeInHand = MyPlayer.myChar.getWeapon()?.slotInfo?.weaponType === WeaponTypes.GREAT_AXE
        if (!hasGreatAxeInHand) {
            const firstGreatAxeInInventory = InventoryManager.inventory.find(
                item => item?.slotInfo?.weaponType === WeaponTypes.GREAT_AXE
            )
            if (!firstGreatAxeInInventory) {
                return
            }

            InventoryManager.equipItem(firstGreatAxeInInventory)
        }

        Connector.sendMessage(new GatheringActionMsg(CharacterActions.LUMBERJACKING.name))
    },

    clickOnRestingButton() {
        if (MyPlayer.nearFireplace == null) {
            return
        }

        if (MyPlayer.activeAction?.name === CharacterActions.RESTING.name) {
            MyPlayer.stopActions()
            return
        }
        Connector.sendMessage(new RestingActionMsg(MyPlayer.nearFireplace.x, MyPlayer.nearFireplace.z))
    },

    clickOnCookingButton() {
        console.log("Cooking action triggered")
        //Connector.sendMessage(new GatheringActionMsg(CharacterActions.COOKING.name))
    },

    trySendFireArrowsAction() {
        const nearbyFireplace = MyPlayer.nearFireplace
        const time = Date.now()
        if (nearbyFireplace == null || MyPlayer.myChar.getWeapon()?.slotInfo?.weaponType !== WeaponTypes.BOW || time < this.lastFireArrowsMessageTime + this.fireArrowsMessageCooldown) {
            return
        }

        Connector.sendMessage(new FireArrowsActionMsg(nearbyFireplace.x, nearbyFireplace.z))
        this.lastFireArrowsMessageTime = time
    },

    setActiveAction(action: CharacterAction | null) {
        const miningButton = this.opportunityButtons.get(GuiOpportunityActions.MINING.name)
        const lumberjackingButton = this.opportunityButtons.get(GuiOpportunityActions.LUMBERJACKING.name)
        const restingButton = this.opportunityButtons.get(GuiOpportunityActions.RESTING.name)

        if (action?.name === GuiOpportunityActions.MINING.name) {
            miningButton.htmlEl.classList.add("active")
            lumberjackingButton.htmlEl.classList.remove("active")
            restingButton.htmlEl.classList.remove("active")
            return
        }

        miningButton.htmlEl.classList.remove("active")

        if (action?.name === GuiOpportunityActions.LUMBERJACKING.name) {
            lumberjackingButton.htmlEl.classList.add("active")
            restingButton.htmlEl.classList.remove("active")
            return
        }

        lumberjackingButton.htmlEl.classList.remove("active")

        if (action?.name === GuiOpportunityActions.RESTING.name) {
            restingButton.htmlEl.classList.add("active")
            return
        }

        restingButton.htmlEl.classList.remove("active")
    },

    setSize(size: number) {
        this.size = size

        if (this.btnBackpack != null) {
            this.btnBackpack.style.width = `${size}px`
            this.btnBackpack.style.height = `${size}px`
        }

        if (this.btnCharacter != null) {
            this.btnCharacter.style.width = `${size}px`
            this.btnCharacter.style.height = `${size}px`
        }

        this.opportunityButtons.forEach((button) => button.setSize(size))
    }
}
