import { Settings } from '@/settings/settings'
import { AudioManager } from '@/babylon/audio/audioManager'
import { TargetingManager } from '@/gui/targettingManager'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import { MyPlayer } from '@/data/myPlayer'
import { GuiButtonsManager } from '@/gui/guiButtonsManager'
import { EmeraldsManager } from '@/gui/emeraldsManager'
import { InventoryManager } from '@/data/InventoryManager'
import { ConsumableHelper } from '@/data/items/consumableHelper'
import { CharacterAction, CharacterActions } from '@/data/actions/characterActions'
import { t } from '@/i18n'

class ActionButtonActionBinding {
    name: string
    toggled: boolean = false
    data: object

    constructor(name: string, data: object) {
        this.name = name
        this.data = data
    }
}

class ActionButton {
    index: string
    htmlEl: HTMLElement | null = null
    actionBinding: ActionButtonActionBinding | null = null
    active: boolean = false
    size: number = 64
    cooldownOverlayEl: HTMLDivElement | null = null

    pointerDownTime: number = 0

    constructor(index: string) {
        this.index = index
        this.htmlEl = document.createElement('div')
        this.htmlEl.id = 'act-btn-' + index
        this.htmlEl.className = 'action-button'
        this.htmlEl.style.backgroundImage = `url('images/icons/buttons/btn_background.png')`

        this.cooldownOverlayEl = document.createElement('div')
        this.cooldownOverlayEl.className = 'action-button-cooldown-overlay'
        this.htmlEl.appendChild(this.cooldownOverlayEl)

        this.htmlEl.onpointerdown = (e) => { e.preventDefault(); this.pointerDown() }
        this.htmlEl.onpointerup = (e) => { e.preventDefault(); this.pointerUp() }
        this.setSize(this.size)
    }

    onFrame(time: number) {
        if (this.actionBinding && CharacterActions.getActionByName(this.actionBinding.name).toggleable && this.pointerDownTime > 0 && (time - this.pointerDownTime) > 750) {
            this.pointerDownTime = 0
            this.onToggle()
        }

        this.updateCooldownState(time)
    }

    pointerDown() {
        this.pointerDownTime = Date.now()
        ActionButtonsManager.onclickActionButton(parseInt(this.index))
    }

    pointerUp() {
        this.pointerDownTime = 0
    }

    onToggle() {
        this.actionBinding!.toggled = !this.actionBinding!.toggled
        if (this.actionBinding?.toggled) {
            this.htmlEl!.classList.add('toggled')
        } else {
            this.htmlEl!.classList.remove('toggled')
        }
        ActionButtonsManager.toggleStateChange(this.actionBinding!.name, this.actionBinding!.toggled)
        AudioManager.playGuiButtonToggle(this.actionBinding!.toggled)
    }

    setBinding(binding: ActionButtonActionBinding) {
        this.actionBinding = binding
        const action: CharacterAction = CharacterActions.getActionByName(binding.name)!
        this.setImage(action.image)
        this.setItemsAvailabilityState()

        if (action.toggleable && binding.toggled) {
            this.htmlEl!.classList.add('toggled')
        } else {
            this.htmlEl!.classList.remove('toggled')
        }
    }

    clearBinding() {
        this.actionBinding = null
        this.htmlEl!.innerHTML = ''
        this.htmlEl!.classList.remove('toggled')
        this.htmlEl!.classList.remove('unavailable')
        this.htmlEl!.appendChild(this.cooldownOverlayEl!)
        this.setCooldownPercent(100)
    }

    setImage(imageSrc: string) {
        let img = this.htmlEl!.querySelector('img') as HTMLImageElement
        if (!img) {
            img = document.createElement('img')
            img.className = 'action-icon'
            img.draggable = false
            this.htmlEl!.appendChild(img)
        }
        img.src = this.resolveImagePath(imageSrc)
    }

    setItemsAvailabilityState() {
        if (!this.actionBinding) {
            this.htmlEl!.classList.remove('unavailable')
            return
        }

        switch (this.actionBinding.name) {
            case CharacterActions.HEAL.name:
                this.htmlEl!.classList.toggle('unavailable', !ActionButtonsManager.hasBandageAvailable())
                return
            case CharacterActions.HEALING_POTION.name:
                this.htmlEl!.classList.toggle('unavailable', !ActionButtonsManager.hasHealingPotionAvailable())
                return
            case CharacterActions.MANA_POTION.name:
                this.htmlEl!.classList.toggle('unavailable', !ActionButtonsManager.hasManaPotionAvailable())
                return
            default:
                this.htmlEl!.classList.remove('unavailable')
        }
    }

    updateCooldownState(actualTime: number) {
        if (!this.actionBinding) {
            this.setCooldownPercent(100)
            return
        }

        const action = CharacterActions.getActionByName(this.actionBinding.name)
        if (!action) {
            this.setCooldownPercent(100)
            return
        }

        this.setCooldownPercent(MyPlayer.getActionCooldownPercent(action, actualTime))
    }

    setCooldownPercent(percent: number) {
        const safePercent = Math.max(0, Math.min(100, percent))
        this.cooldownOverlayEl!.style.setProperty('--cooldown-progress', safePercent.toString())

        if (safePercent >= 100) {
            this.cooldownOverlayEl!.style.display = 'none'
            this.htmlEl!.classList.remove('cooldown-active')
            return
        }

        this.cooldownOverlayEl!.style.display = 'block'
        if (!this.active) {
            this.htmlEl!.classList.add('cooldown-active')
        }
    }

    resolveImagePath(imageSrc: string) {
        if (imageSrc == CharacterActions.AUTO_ATTACK.image && MyPlayer.myChar?.isWeaponRanged()) {
            imageSrc = 'btn_attack_ranged'
        }
        if (imageSrc == CharacterActions.AUTO_ATTACK.image && MyPlayer.myChar?.isWeaponAxe()) {
            imageSrc = 'btn_attack_axe'
        }

        return `/images/icons/buttons/${imageSrc}.png`
    }

    activated() {
        this.active = true
        this.htmlEl!.classList.add('active')
    }

    deactivated() {
        this.active = false
        this.htmlEl!.classList.remove('active')
        if (this.cooldownOverlayEl?.style.display === 'block') {
            this.htmlEl!.classList.add('cooldown-active')
        }
    }

    setSize(size: number) {
        this.size = size
        this.htmlEl!.style.width = `${size}px`
        this.htmlEl!.style.height = `${size}px`
    }
}

export const ActionButtonsManager = {
    actionBindingKey: 'DARKENLIGHT_ACTION_BUTTONS_BINDINGS',

    buttonsPanel1: null as HTMLElement,
    buttonsPanel2: null as HTMLElement,
    opportunityButtonsPanel: null as HTMLElement,
    bindings: new Map<number, ActionButtonActionBinding>(),
    actionButtons: new Map<number, ActionButton>(),

    stopButton: null as HTMLElement,

    initialize() {
        this.buttonsPanel1 = document.getElementById('action-buttons-1') as HTMLElement
        this.buttonsPanel2 = document.getElementById('action-buttons-2') as HTMLElement
        this.opportunityButtonsPanel = document.getElementById('opportunity-action-buttons') as HTMLElement
        this.stopButton = document.getElementById('btn-action-stop') as HTMLElement

        for (let i = 1; i <= 10; i++) {
            this.actionButtons.set(i, new ActionButton(i.toString()))
        }

        if (!localStorage.getItem(this.actionBindingKey)) {
            this.bindings.set(1, new ActionButtonActionBinding(CharacterActions.AUTO_ATTACK.name, {}))
            this.bindings.set(2, new ActionButtonActionBinding(CharacterActions.HEAL.name, {}))
            localStorage.setItem(this.actionBindingKey, JSON.stringify(Array.from(this.bindings.entries())))
        } else {
            const storedBindings = JSON.parse(localStorage.getItem(this.actionBindingKey)!)
            this.bindings = new Map<number, ActionButtonActionBinding>(storedBindings)
        }
        this.renderActionButtons()
    },

    onFrame(time: number) {
        this.actionButtons.forEach((btn) => {
            btn.onFrame(time)
        })
    },

    externalPressActionButton(index: number) {
        const actionButton = this.actionButtons.get(index)
        if (actionButton) {
            actionButton.pointerDown()
        }
    },

    externalReleaseActionButton(index: number) {
        const actionButton = this.actionButtons.get(index)
        if (actionButton) {
            actionButton.pointerUp()
        }
    },

    renderActionButtons() {
        this.buttonsPanel1.innerHTML = ''
        this.buttonsPanel2.innerHTML = ''

        if (Settings.actionButtonsLayout == '1COLUMN') {
            this.buttonsPanel2.style.setProperty('display', 'none')
        } else {
            this.buttonsPanel2.style.setProperty('display', 'flex')
        }

        if (Settings.actionButtonsLayout == '2COLUMN') {
            this.buttonsPanel2.style.setProperty('flex-direction', 'column')
        }

        if (Settings.actionButtonsLayout == 'CORNER') {
            this.buttonsPanel2.style.setProperty('flex-direction', 'row')
        }

        this.actionButtons.forEach((btn) => {
            if (parseInt(btn.index) > Settings.actionButtonCount) {
                btn.htmlEl!.style.setProperty('display', 'none')
            } else {
                btn.htmlEl!.style.removeProperty('display')
            }

            const binding = this.bindings.get(parseInt(btn.index))
            if (binding) {
               btn.setBinding(binding)
            } else {
               btn.clearBinding()
            }

            let actualPanel = this.buttonsPanel1
            if ((Settings.actionButtonsLayout == 'CORNER' || Settings.actionButtonsLayout == '2COLUMN') && parseInt(btn.index) > Settings.actionButtonCount / 2) {
                actualPanel = this.buttonsPanel2
            }
            actualPanel.appendChild(btn.htmlEl!)
        })

        this.buttonSizeChanged(Settings.actionButtonSize)
        this.refreshItemsAvailability()
    },

    onclickActionButton(index: number) {
        const actionButton = this.actionButtons.get(index)
        if (actionButton && actionButton.actionBinding) {
            AudioManager.playGuiButtonClick()

            switch (actionButton.actionBinding.name) {
                case CharacterActions.AUTO_ATTACK.name:
                    this.clickOnAutoAttackButton()
                    break
                case CharacterActions.HEAL.name:
                    this.clickOnHealingButton()
                    break
                case CharacterActions.HEALING_POTION.name:
                    this.clickOnHealingPotionButton()
                    break
                case CharacterActions.MANA_POTION.name:
                    this.clickOnManaPotionButton()
                    break
                case CharacterActions.EQUIP_STORED_WEAPONS.name:
                    this.clickOnEquipStoredWeaponsButton()
                    break
            }
        }
    },

    setActiveAction(action: CharacterAction | null) {
        this.actionButtons.forEach((btn) => {
            if (btn.actionBinding && btn.actionBinding.name === action?.name) {
                btn.activated()
            } else {
                btn.deactivated()
            }
        })
    },

    clickOnAutoAttackButton() {
        if (MyPlayer.activeAction &&
            MyPlayer.activeAction.name === CharacterActions.AUTO_ATTACK.name &&
            MyPlayer.myChar.autoAttackTarget && MyPlayer.myChar.autoAttackTarget === TargetingManager.selectedTarget) {
            MyPlayer.stopActions()
            return
        }

        if (!InventoryManager.hasStoredWeaponSetupEquipped()) {
            InventoryManager.equipStoredWeaponSetup('primary')
        }

        TargetingManager.checkAutoAttackOnSelectedTarget(true)
    },

    clickOnHealingButton() {
        if (InventoryManager.getTotalResourceItemCountByType(1) <= 0) { OnScreenMessageManager.addMessage(t('messages.noBandages')); return }
        if (MyPlayer.activeAction && MyPlayer.activeAction.name === CharacterActions.HEAL.name) {
            MyPlayer.stopActions()
            return
        }
        MyPlayer.startHealingAction()
    },

    clickOnHealingPotionButton() {
        if (!ActionButtonsManager.hasHealingPotionAvailable()) { OnScreenMessageManager.addMessage(t('messages.noHealthPotions')); return }
        ConsumableHelper.clickOnConsumeHealingPotion()
    },

    clickOnManaPotionButton() {
        if (!ActionButtonsManager.hasManaPotionAvailable()) { OnScreenMessageManager.addMessage(t('messages.noManaPotions')); return }
        ConsumableHelper.clickOnConsumeManaPotion()
    },

    clickOnEquipStoredWeaponsButton() {
        InventoryManager.clickOnEquipStoredWeaponsButton()
    },

    toggleStateChange(actionName: string, toggled: boolean) {
        this.storeBindings()
        switch (actionName) {
            case CharacterActions.AUTO_ATTACK.name:
                OnScreenMessageManager.addMessage(t('messages.autoAttack', {
                    state: toggled ? t('messages.enabled') : t('messages.disabled')
                }))
                break
        }
    },

    isButtonToggled(action: CharacterAction): boolean {
        for (const btn of this.actionButtons.values()) {
            if (btn.actionBinding && btn.actionBinding.name === action.name) {
                return btn.actionBinding.toggled
            }
        }
        return false
    },

    storeBindings() {
        localStorage.setItem(this.actionBindingKey, JSON.stringify(Array.from(this.bindings.entries())))
    },

    getBindingIconForIndex(index: number): string | null {
        const binding = this.bindings.get(index)
        if (!binding) return null

        const imageSrc = CharacterActions.getActionByName(binding.name)?.image
        if (!imageSrc) return null

        const actionButton = this.actionButtons.get(index)
        if (actionButton) return actionButton.resolveImagePath(imageSrc)

        return null
    },

    getBindingDescriptionForIndex(index: number): string {
        const binding = this.bindings.get(index)
        if (!binding) return ''

        return CharacterActions.getActionByName(binding.name)?.description ?? ''
    },

    getBindingActionNameForIndex(index: number): string | null {
        return this.bindings.get(index)?.name ?? null
    },

    getAvailableActionsForBindings(): CharacterAction[] {
        return [
            CharacterActions.AUTO_ATTACK,
            CharacterActions.HEAL,
            CharacterActions.HEALING_POTION,
            CharacterActions.MANA_POTION,
            CharacterActions.EQUIP_STORED_WEAPONS,
        ]
    },

    setBindingForIndex(index: number, actionName: string) {
        const action = CharacterActions.getActionByName(actionName)
        if (!action) return

        this.bindings.set(index, new ActionButtonActionBinding(action.name, {}))
        this.storeBindings()
        this.renderActionButtons()
        this.setActiveAction(MyPlayer.activeAction)
    },

    clearBindingForIndex(index: number) {
        this.bindings.delete(index)
        this.storeBindings()
        this.renderActionButtons()
        this.setActiveAction(MyPlayer.activeAction)
    },

    buttonSizeChanged(newSize: number) {
        const panelGap = 8

        this.actionButtons.forEach((btn) => {
            btn.setSize(newSize)
        })

        if (Settings.actionButtonsLayout == '1COLUMN') {
            this.buttonsPanel1.style.setProperty('bottom', Settings.actionButtonsYOffset + 'px')
            this.opportunityButtonsPanel.style.setProperty('bottom', Settings.actionButtonsYOffset + 'px')
            this.opportunityButtonsPanel.style.setProperty('right', (newSize + panelGap) + 'px')
        }

        if (Settings.actionButtonsLayout == '2COLUMN') {
            this.buttonsPanel1.style.setProperty('bottom', Settings.actionButtonsYOffset + 'px')
            this.buttonsPanel2.style.setProperty('bottom', Settings.actionButtonsYOffset + 'px')
            this.buttonsPanel2.style.setProperty('right', (newSize + panelGap) + 'px')
            this.opportunityButtonsPanel.style.setProperty('bottom', Settings.actionButtonsYOffset + 'px')
            this.opportunityButtonsPanel.style.setProperty('right', ((newSize + panelGap) * 2) + 'px')
        }

        if (Settings.actionButtonsLayout == 'CORNER') {
            this.buttonsPanel1.style.setProperty('bottom', (Settings.actionButtonsYOffset + newSize + panelGap) + 'px')
            this.buttonsPanel2.style.setProperty('bottom', Settings.actionButtonsYOffset + 'px')
            this.buttonsPanel2.style.setProperty('right', '0px')
            this.opportunityButtonsPanel.style.setProperty('bottom', (Settings.actionButtonsYOffset + newSize + panelGap) + 'px')
            this.opportunityButtonsPanel.style.setProperty('right', (newSize + panelGap) + 'px')
        }

        GuiButtonsManager.setSize(newSize)
        EmeraldsManager.setSize(newSize)
    },

    refreshItemsAvailability() {
        this.actionButtons.forEach((btn) => {
            btn.setItemsAvailabilityState()
        })
    },

    hasBandageAvailable(): boolean {
        return InventoryManager.getTotalResourceItemCountByType(1) > 0
    },

    hasHealingPotionAvailable(): boolean {
        return ConsumableHelper.getHealingPotionIds().some(cbId => InventoryManager.getTotalResourceItemCountByType(cbId) > 0)
    },

    hasManaPotionAvailable(): boolean {
        return ConsumableHelper.getManaPotionIds().some(cbId => InventoryManager.getTotalResourceItemCountByType(cbId) > 0)
    },

    charEquipChanged() {
        this.actionButtons.forEach((btn) => {
            if (btn.actionBinding && btn.actionBinding.name === CharacterActions.AUTO_ATTACK.name) {
                btn.setImage(CharacterActions.AUTO_ATTACK.image)
            }
        })
    }
}
