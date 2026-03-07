import { GroundItemsManager } from '@/babylon/world/groundItemsManager'
import { InventoryManager } from '@/data/InventoryManager'
import { AudioManager } from '@/babylon/audio/audioManager'
import { MyPlayer } from '@/data/myPlayer'
import { WorldDataManager } from '@/data/worldDataManager'
import { WeaponTypes } from '@/data/items/item'

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
}

export const GuiButtonsManager = {
    size: 32 as number,
    btnBackpack: null as HTMLDivElement,
    opportunityButtonsPanel: null as HTMLElement,
    opportunityButtons: new Map<string, GuiOpportunityButton>(),

    initialize() {
        this.btnBackpack = document.getElementById("btn-backpack") as HTMLDivElement
        this.opportunityButtonsPanel = document.getElementById("opportunity-action-buttons") as HTMLElement
        this.createOpportunityButtons()
        this.renderOpportunityButtons()
        this.setSize(this.size)
    },

    createOpportunityButtons() {
        this.opportunityButtons.clear()
        this.opportunityButtons.set(
            GuiOpportunityActions.PICKUP_ITEM.name,
            new GuiOpportunityButton(GuiOpportunityActions.PICKUP_ITEM)
        )
        this.opportunityButtons.set(
            GuiOpportunityActions.MINING.name,
            new GuiOpportunityButton(GuiOpportunityActions.MINING)
        )
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
        this.btnBackpack.style.right = `${miniMapSize + 5}px`
        this.btnBackpack.style.top = `5px`
    },

    onFrame() {
        // Show pickup button if there's an item nearby
        this.opportunityButtons.get(GuiOpportunityActions.PICKUP_ITEM.name)!.setVisible(GroundItemsManager.nearbyItem !== null)

        // Show mining button if there's a mineable block on the player's position and the player has a pickaxe available
        const blockOnPosition = MyPlayer.myChar
            ? WorldDataManager.getBlockOnPosition(MyPlayer.myChar.pos)
            : null
        this.opportunityButtons.get(GuiOpportunityActions.MINING.name)!.setVisible(
            blockOnPosition?.type === 3 && MyPlayer.hasWaponTypeInHandOrInventory(WeaponTypes.PICKAXE)
        )
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
    },

    setSize(size: number) {
        this.size = size

        if (this.btnBackpack != null) {
            this.btnBackpack.style.width = `${size}px`
            this.btnBackpack.style.height = `${size}px`
        }

        this.opportunityButtons.forEach((button) => button.setSize(size))
    }
}
