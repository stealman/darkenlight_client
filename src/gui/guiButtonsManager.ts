import { GroundItemsManager } from '@/babylon/world/groundItemsManager'
import { TreeManager } from '@/babylon/world/treeManager'
import { InventoryManager } from '@/data/inventoryManager'
import { AudioManager } from '@/babylon/audio/audioManager'
import { MyPlayer } from '@/data/myPlayer'
import { WorldDataManager } from '@/data/worldDataManager'
import { WeaponCategories, WeaponTags } from '@/data/items/item'
import { Connector } from '@/network/connector'
import { FireArrowsActionMsg, GatheringActionMsg, RequestCookingMsg, RestingActionMsg, UseBuildingDoorMsg } from '@/network/messages'
import { CharacterAction, CharacterActions } from '@/data/actions/characterActions'
import { TargetingManager } from '@/gui/targettingManager'
import { GMManager } from '@/gm/GM'
import {NpcInteractionManager} from '@/data/npcInteractionManager'
import {NpcManager} from '@/babylon/npc/npcManager'
import { BuildingManager } from '@/babylon/world/buildings/buildingManager'
import { StaticsManager } from '@/babylon/world/statics/staticsManager'
import { ContainerManager } from '@/data/containerManager'
import { Vector3 } from '@babylonjs/core'
import { Utils } from '@/utils/utils'
import {PartyManager} from '@/data/partyManager'
import {t} from '@/i18n'

const HUD_BUTTON_GAP = 5
const HUD_MINIMAP_LEFT_FRAME_SIZE = 3
const CAMP_BARREL_STATIC_TYPE = 305

class GuiOpportunityButtonAction {
    name: string
    icon: string
    label: string | null

    constructor(name: string, icon: string, label: string | null = null) {
        this.name = name
        this.icon = icon
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
    PARTY_INVITE: new GuiOpportunityButtonAction('PARTY_INVITE', 'btn_party_invite'),
    PICKUP_ITEM: new GuiOpportunityButtonAction("PICKUP_ITEM", "btn_pick"),
    MINING: new GuiOpportunityButtonAction("MINING", "btn_pickaxe"),
    LUMBERJACKING: new GuiOpportunityButtonAction("LUMBERJACKING", "btn_lumber"),
    RESTING: new GuiOpportunityButtonAction("RESTING", "btn_rest"),
    COOKING: new GuiOpportunityButtonAction("COOKING", "btn_cooking"),
    USE_DOOR: new GuiOpportunityButtonAction("USE_DOOR", "btn_use_door"),
    USE_CHEST: new GuiOpportunityButtonAction("USE_CHEST", "btn_use_chest"),
    NPC_USE: new GuiOpportunityButtonAction("NPC_USE", "btn_chat"),
    NPC_EDIT: new GuiOpportunityButtonAction("NPC_EDIT", "", "NPC"),
    BOT_EDIT: new GuiOpportunityButtonAction("BOT_EDIT", "", "BOT"),
}

export const GuiButtonsManager = {
    size: 32 as number,
    fireArrowsMessageCooldown: 5000 as number,
    lastFireArrowsMessageTime: 0 as number,
    btnBackpack: null as HTMLDivElement,
    btnCharacter: null as HTMLDivElement,
    opportunityButtonsPanel: null as HTMLElement,
    opportunityButtons: new Map<string, GuiOpportunityButton>(),
    primaryOpportunityButton: null as GuiOpportunityButton | null,

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
        this.primaryOpportunityButton = null
        this.opportunityButtons.set(GuiOpportunityActions.PICKUP_ITEM.name, new GuiOpportunityButton(GuiOpportunityActions.PICKUP_ITEM))
        this.opportunityButtons.set(GuiOpportunityActions.RESTING.name, new GuiOpportunityButton(GuiOpportunityActions.RESTING))

        this.opportunityButtons.set(GuiOpportunityActions.MINING.name, new GuiOpportunityButton(GuiOpportunityActions.MINING))
        this.opportunityButtons.set(GuiOpportunityActions.LUMBERJACKING.name, new GuiOpportunityButton(GuiOpportunityActions.LUMBERJACKING))
        this.opportunityButtons.set(GuiOpportunityActions.COOKING.name, new GuiOpportunityButton(GuiOpportunityActions.COOKING))
        this.opportunityButtons.set(GuiOpportunityActions.USE_DOOR.name, new GuiOpportunityButton(GuiOpportunityActions.USE_DOOR))
        this.opportunityButtons.set(GuiOpportunityActions.USE_CHEST.name, new GuiOpportunityButton(GuiOpportunityActions.USE_CHEST))
        this.opportunityButtons.set(GuiOpportunityActions.NPC_USE.name, new GuiOpportunityButton(GuiOpportunityActions.NPC_USE))
        this.opportunityButtons.set(GuiOpportunityActions.NPC_EDIT.name, new GuiOpportunityButton(GuiOpportunityActions.NPC_EDIT))
        this.opportunityButtons.set(GuiOpportunityActions.BOT_EDIT.name, new GuiOpportunityButton(GuiOpportunityActions.BOT_EDIT))
        const invite = new GuiOpportunityButton(GuiOpportunityActions.PARTY_INVITE)
        invite.htmlEl.setAttribute('role', 'button')
        invite.htmlEl.title = t('party.invite')
        invite.htmlEl.setAttribute('aria-label', t('party.invite'))
        this.opportunityButtons.set(GuiOpportunityActions.PARTY_INVITE.name, invite)
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
        const buttonStep = this.size + HUD_BUTTON_GAP
        const miniMapRightOffset = miniMapSize + HUD_MINIMAP_LEFT_FRAME_SIZE + HUD_BUTTON_GAP

        this.btnCharacter.style.right = `${miniMapRightOffset}px`
        this.btnCharacter.style.top = `5px`

        this.btnBackpack.style.right = `${miniMapRightOffset + buttonStep}px`
        this.btnBackpack.style.top = `5px`
    },

    onFrame() {
        if (MyPlayer.isDead.value) {
            this.opportunityButtons.forEach((button) => button.setVisible(false))
            this.setPrimaryOpportunityButton(null)
            return
        }
        // Show pickup button if there's an item nearby
        this.opportunityButtons.get(GuiOpportunityActions.PICKUP_ITEM.name)!.setVisible(GroundItemsManager.nearbyItem !== null)

        const coveredBlocks = MyPlayer.myChar ? WorldDataManager.getCoveredBlocks(MyPlayer.myChar.pos, MyPlayer.myChar.getBoxSize()) : []

        // Show mining button if any covered block is mineable and the player has a mining tool available
        const hasMineableCoveredBlock = coveredBlocks.some(block => block.minableCoal || block.minableOreAvailable)
        this.opportunityButtons.get(GuiOpportunityActions.MINING.name)!.setVisible(
            hasMineableCoveredBlock && MyPlayer.hasWeaponTagInHandOrInventory(WeaponTags.MINING_TOOL)
        )

        this.opportunityButtons.get(GuiOpportunityActions.LUMBERJACKING.name)!.setVisible(
            TreeManager.isAnyTreeInDistance(MyPlayer.myChar.pos, 1.5) && MyPlayer.hasWeaponTagInHandOrInventory(WeaponTags.WOODCUTTING_TOOL)
        )

        this.opportunityButtons.get(GuiOpportunityActions.RESTING.name)!.setVisible(MyPlayer.nearFireplace !== null)
        this.opportunityButtons.get(GuiOpportunityActions.COOKING.name)!.setVisible(MyPlayer.nearFireplace !== null)
        this.opportunityButtons.get(GuiOpportunityActions.USE_DOOR.name)!.setVisible(
            BuildingManager.getClosestDoorIdInDistance(MyPlayer.myChar.pos, 1.5) !== null
        )
        this.opportunityButtons.get(GuiOpportunityActions.USE_CHEST.name)!.setVisible(
            typeof this.getClosestUsableBarrel()?.status?.containerId === 'string'
        )
        const selectedTarget = TargetingManager.selectedTarget
        const party = PartyManager.state.value
        this.opportunityButtons.get(GuiOpportunityActions.PARTY_INVITE.name)!.setVisible(
            selectedTarget?.getObjectType() === 'C' && selectedTarget.id !== MyPlayer.myChar.id
            && !(selectedTarget as any).isBot && !(selectedTarget as any).dead
            && (!party || party.leaderId === MyPlayer.myChar.id)
            && !party?.members.some(member => member.id === selectedTarget.id)
        )
        const closestNpc = NpcManager.getClosestNpcInDistance(3)
        this.opportunityButtons.get(GuiOpportunityActions.NPC_USE.name)!.setVisible(
            closestNpc !== null
        )
        this.opportunityButtons.get(GuiOpportunityActions.NPC_EDIT.name)!.setVisible(
            MyPlayer.myChar?.className === 'GM' && (
                selectedTarget?.getObjectType() === 'N'
                || (selectedTarget?.getObjectType() === 'M' && NpcManager.guards.has(selectedTarget.id))
            )
        )
        this.opportunityButtons.get(GuiOpportunityActions.BOT_EDIT.name)!.setVisible(
            MyPlayer.myChar?.className === 'GM'
            && selectedTarget?.getObjectType() === 'C'
            && (selectedTarget as any).isBot === true
        )

        this.updateOpportunityPriority()
        this.trySendFireArrowsAction()
    },

    updateOpportunityPriority() {
        let closestButton: GuiOpportunityButton | null = null
        let closestDistanceSquared = Infinity
        for (const button of this.opportunityButtons.values()) {
            if (!button.visible) continue
            const distanceSquared = this.getOpportunityDistanceSquared(button.action.name)
            // Strict comparison preserves the original order when targets are equally close.
            if (closestButton === null || distanceSquared < closestDistanceSquared) {
                closestButton = button
                closestDistanceSquared = distanceSquared
            }
        }
        this.setPrimaryOpportunityButton(closestButton)
    },

    setPrimaryOpportunityButton(button: GuiOpportunityButton | null) {
        if (button === this.primaryOpportunityButton) return
        if (this.primaryOpportunityButton) this.primaryOpportunityButton.htmlEl.style.order = ''
        this.primaryOpportunityButton = button
        if (button) button.htmlEl.style.order = '-1'
    },

    getOpportunityDistanceSquared(actionName: string): number {
        const playerPos = MyPlayer.myChar.pos
        let target: { x: number, z: number } | null | undefined = null
        switch (actionName) {
            case GuiOpportunityActions.PARTY_INVITE.name:
                target = TargetingManager.selectedTarget?.pos
                break
            case GuiOpportunityActions.PICKUP_ITEM.name:
                target = GroundItemsManager.nearbyItem?.pos
                break
            case GuiOpportunityActions.RESTING.name:
            case GuiOpportunityActions.COOKING.name:
                target = MyPlayer.nearFireplace
                break
            case GuiOpportunityActions.MINING.name: {
                let closest = Infinity
                const map = WorldDataManager.getBlockMap()
                for (const coords of Utils.getCoveredBlocks(playerPos.x, playerPos.z, MyPlayer.myChar.getBoxSize())) {
                    const block = map[coords.x]?.[coords.z]
                    if (!block || (!block.minableCoal && !block.minableOreAvailable)) continue
                    const dx = playerPos.x - coords.x
                    const dz = playerPos.z - coords.z
                    closest = Math.min(closest, dx * dx + dz * dz)
                }
                return closest
            }
            case GuiOpportunityActions.LUMBERJACKING.name: {
                let closest = Infinity
                for (const tree of TreeManager.visibleTrees) {
                    if (Vector3.DistanceSquared(tree.position, playerPos) > 1.5 * 1.5) continue
                    const dx = playerPos.x - tree.position.x
                    const dz = playerPos.z - tree.position.z
                    closest = Math.min(closest, dx * dx + dz * dz)
                }
                return closest
            }
            case GuiOpportunityActions.USE_DOOR.name: {
                const doorId = BuildingManager.getClosestDoorIdInDistance(playerPos, 1.5)
                target = doorId === null ? null : BuildingManager.buildings.get(doorId)?.getDoorPosition()
                break
            }
            case GuiOpportunityActions.USE_CHEST.name: {
                const barrel = this.getClosestUsableBarrel()
                if (!barrel) return Infinity
                const distance = StaticsManager.getDistanceToStaticFootprint(playerPos, barrel.position, barrel.getSize())
                return distance * distance
            }
            case GuiOpportunityActions.NPC_USE.name:
                target = NpcManager.getClosestNpcInDistance(3)?.pos
                break
            case GuiOpportunityActions.NPC_EDIT.name:
            case GuiOpportunityActions.BOT_EDIT.name:
                target = TargetingManager.selectedTarget?.pos
                break
        }
        if (!target) return Infinity
        const dx = playerPos.x - target.x
        const dz = playerPos.z - target.z
        return dx * dx + dz * dz
    },

    onclickOpportunityButton(actionName: string) {
        if (MyPlayer.isDead.value) {
            return
        }
        AudioManager.playGuiButtonClick()
        switch (actionName) {
            case GuiOpportunityActions.PARTY_INVITE.name:
                if (TargetingManager.selectedTarget?.getObjectType() === 'C') PartyManager.invite(TargetingManager.selectedTarget.id)
                break
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
            case GuiOpportunityActions.USE_DOOR.name:
                this.clickOnUseDoorButton()
                break
            case GuiOpportunityActions.USE_CHEST.name:
                this.clickOnUseChestButton()
                break
            case GuiOpportunityActions.NPC_USE.name:
                this.clickOnNpcUseButton()
                break
            case GuiOpportunityActions.NPC_EDIT.name:
                this.clickOnNpcEditButton()
                break
            case GuiOpportunityActions.BOT_EDIT.name:
                this.clickOnBotEditButton()
                break
        }
    },

    clickFirstAvailableOpportunityButton() {
        if (MyPlayer.isDead.value) {
            return false
        }
        const button = this.primaryOpportunityButton
        if (button?.visible) {
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

    clickOnUseDoorButton() {
        const buildingId = BuildingManager.getClosestDoorIdInDistance(MyPlayer.myChar.pos, 1.5)
        if (buildingId !== null) {
            Connector.sendMessage(new UseBuildingDoorMsg(buildingId))
        }
    },

    clickOnUseChestButton() {
        const containerId = this.getClosestUsableBarrel()?.status?.containerId
        if (typeof containerId === 'string') {
            ContainerManager.open(containerId)
        }
    },

    getClosestUsableBarrel() {
        return StaticsManager.getClosestStaticInDistance(CAMP_BARREL_STATIC_TYPE, MyPlayer.myChar.pos, 2)
    },

    clickOnNpcEditButton() {
        const target = TargetingManager.selectedTarget
        const isNpc = target?.getObjectType() === 'N'
        const isGuard = target?.getObjectType() === 'M' && NpcManager.guards.has(target.id)
        if (MyPlayer.myChar?.className === 'GM' && (isNpc || isGuard)) {
            GMManager.openNpcDetails(target)
        }
    },

    clickOnBotEditButton() {
        const target = TargetingManager.selectedTarget as any
        if (MyPlayer.myChar?.className === 'GM' && target?.getObjectType() === 'C' && target.isBot === true) {
            GMManager.openBotDetails(target)
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
