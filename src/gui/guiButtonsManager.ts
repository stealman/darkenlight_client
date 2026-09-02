import { GroundItemsManager } from '@/babylon/world/groundItemsManager'
import { TreeManager } from '@/babylon/world/treeManager'
import { InventoryManager } from '@/data/inventoryManager'
import { AudioManager } from '@/babylon/audio/audioManager'
import { MyPlayer } from '@/data/myPlayer'
import { WorldDataManager } from '@/data/worldDataManager'
import { WeaponCategories, WeaponTags } from '@/data/items/item'
import { Connector } from '@/network/connector'
import { FireArrowsActionMsg, GatheringActionMsg, RequestCookingMsg, RestingActionMsg } from '@/network/messages'
import { CharacterAction, CharacterActions } from '@/data/actions/characterActions'
import { TargetingManager } from '@/gui/targettingManager'
import { GMManager } from '@/gm/GM'
import {NpcInteractionManager} from '@/data/npcInteractionManager'
import {NpcManager} from '@/babylon/npc/npcManager'

class GuiOpportunityButtonAction {
    name: string
    icon: string
    hoverIcon: string
    label: string | null

    constructor(name: string, icon: string, hoverIcon: string, label: string | null = null) {
        this.name = name
        this.icon = icon
        this.hoverIcon = hoverIcon
        this.label = label
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
        this.htmlEl.className = action.label ? "gui-action-button gui-opportunity-text-button" : "gui-action-button"
        if (action.label) {
            this.htmlEl.textContent = action.label
        } else {
            this.htmlEl.innerHTML = `
                <img class="action-icon" src="/images/icons/buttons/${action.icon}.png" />
                <img class="action-icon-hover" src="/images/icons/buttons/${action.hoverIcon}.png" />
            `
        }
        this.htmlEl.style.display = "none"
    }

    setVisible(visible: boolean) {
        if (this.visible === visible) {
            return
        }
        this.visible = visible
        this.htmlEl.style.display = visible ? (this.action.label ? "flex" : "block") : "none"
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
    NPC_USE: new GuiOpportunityButtonAction("NPC_USE", "", "", "USE"),
    NPC_EDIT: new GuiOpportunityButtonAction("NPC_EDIT", "", "", "NPC"),
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
        this.opportunityButtons.set(GuiOpportunityActions.NPC_USE.name, new GuiOpportunityButton(GuiOpportunityActions.NPC_USE))
        this.opportunityButtons.set(GuiOpportunityActions.NPC_EDIT.name, new GuiOpportunityButton(GuiOpportunityActions.NPC_EDIT))
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
        if (MyPlayer.isDead.value) {
            this.opportunityButtons.forEach((button) => button.setVisible(false))
            return
        }
        // Show pickup button if there's an item nearby
        this.opportunityButtons.get(GuiOpportunityActions.PICKUP_ITEM.name)!.setVisible(GroundItemsManager.nearbyItem !== null)

        const coveredBlocks = MyPlayer.myChar ? WorldDataManager.getCoveredBlocks(MyPlayer.myChar.pos, MyPlayer.myChar.getBoxSize()) : []

        // Show mining button if any covered block is mineable and the player has a mining tool available
        const hasMineableCoveredBlock = coveredBlocks.some(block => block.minableCoal || block.minableOre)
        this.opportunityButtons.get(GuiOpportunityActions.MINING.name)!.setVisible(
            hasMineableCoveredBlock && MyPlayer.hasWeaponTagInHandOrInventory(WeaponTags.MINING_TOOL)
        )

        this.opportunityButtons.get(GuiOpportunityActions.LUMBERJACKING.name)!.setVisible(
            TreeManager.isAnyTreeInDistance(MyPlayer.myChar.pos, 1.5) && MyPlayer.hasWeaponTagInHandOrInventory(WeaponTags.WOODCUTTING_TOOL)
        )

        this.opportunityButtons.get(GuiOpportunityActions.RESTING.name)!.setVisible(MyPlayer.nearFireplace !== null)
        this.opportunityButtons.get(GuiOpportunityActions.COOKING.name)!.setVisible(MyPlayer.nearFireplace !== null)
        const selectedTarget = TargetingManager.selectedTarget
        const closestNpc = NpcManager.getClosestNpcInDistance(3)
        this.opportunityButtons.get(GuiOpportunityActions.NPC_USE.name)!.setVisible(
            closestNpc !== null
        )
        this.opportunityButtons.get(GuiOpportunityActions.NPC_EDIT.name)!.setVisible(
            MyPlayer.myChar?.className === 'GM' && selectedTarget?.getObjectType() === 'N'
        )

        this.trySendFireArrowsAction()
    },

    onclickOpportunityButton(actionName: string) {
        if (MyPlayer.isDead.value) {
            return
        }
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
            case GuiOpportunityActions.NPC_USE.name:
                this.clickOnNpcUseButton()
                break
            case GuiOpportunityActions.NPC_EDIT.name:
                this.clickOnNpcEditButton()
                break
        }
    },

    clickFirstAvailableOpportunityButton() {
        if (MyPlayer.isDead.value) {
            return false
        }
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
        const hasMiningToolInHand = MyPlayer.myChar.getWeapon()?.hasWeaponTag(WeaponTags.MINING_TOOL)
        if (!hasMiningToolInHand) {
            const firstMiningToolInInventory = InventoryManager.inventory.find(
                item => item?.hasWeaponTag(WeaponTags.MINING_TOOL)
            )
            if (!firstMiningToolInInventory) {
                return
            }

            InventoryManager.equipItem(firstMiningToolInInventory)
        }

        Connector.sendMessage(new GatheringActionMsg(CharacterActions.MINING.name))
    },

    clickOnLumberjackingButton() {
        const hasWoodcuttingToolInHand = MyPlayer.myChar.getWeapon()?.hasWeaponTag(WeaponTags.WOODCUTTING_TOOL)
        if (!hasWoodcuttingToolInHand) {
            const firstWoodcuttingToolInInventory = InventoryManager.inventory.find(
                item => item?.hasWeaponTag(WeaponTags.WOODCUTTING_TOOL)
            )
            if (!firstWoodcuttingToolInInventory) {
                return
            }

            InventoryManager.equipItem(firstWoodcuttingToolInInventory)
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
        if (MyPlayer.nearFireplace) {
            Connector.sendMessage(new RequestCookingMsg(MyPlayer.nearFireplace.x, MyPlayer.nearFireplace.z))
        }
    },

    clickOnNpcEditButton() {
        const target = TargetingManager.selectedTarget
        if (MyPlayer.myChar?.className === 'GM' && target?.getObjectType() === 'N') {
            GMManager.openNpcDetails(target)
        }
    },

    clickOnNpcUseButton() {
        const closestNpc = NpcManager.getClosestNpcInDistance(3)
        if (closestNpc) {
            NpcInteractionManager.useNpc(closestNpc.id)
        }
    },

    trySendFireArrowsAction() {
        const nearbyFireplace = MyPlayer.nearFireplace
        const time = Date.now()
        if (nearbyFireplace == null || MyPlayer.myChar.getWeapon()?.weaponCategory !== WeaponCategories.BOW || time < this.lastFireArrowsMessageTime + this.fireArrowsMessageCooldown) {
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
