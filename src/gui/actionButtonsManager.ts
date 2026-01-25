import { Settings } from '@/settings/settings'
import { AudioManager } from '@/babylon/audio/audioManager'
import { TargetingManager } from '@/gui/targettingManager'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'

class ActionButtonActionBinding {
    name: string
    toggled: boolean = false
    data: object

    constructor(name: string, data: object) {
        this.name = name
        this.data = data
    }
}

class ActionButtonAction {
    name: string
    image: string
    toggleable: boolean

    constructor(name: string, image: string, toggleable: boolean) {
        this.name = name
        this.image = image
        this.toggleable = toggleable
    }
}

class ActionButton {
    index: string
    htmlEl: HTMLElement | null = null
    actionBinding: ActionButtonActionBinding | null = null
    active: boolean = false

    pointerDownTime: number = 0

    constructor(index: string) {
        this.index = index
        this.htmlEl = document.createElement("div")
        this.htmlEl.id = "act-btn-" + index
        this.htmlEl.className = "action-button"
        this.htmlEl.onpointerdown = (e) => { e.preventDefault(); this.pointerDown() }
        this.htmlEl.onpointerup = (e) => { e.preventDefault(); this.pointerUp() }
    }

    onFrame(time: number) {
        if (this.actionBinding && ActionButtonActions.getActionByName(this.actionBinding.name).toggleable && this.pointerDownTime > 0 && (time - this.pointerDownTime) > 750) {
            this.pointerDownTime = 0
            this.onToggle()
        }
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
            this.htmlEl!.classList.add("toggled")
        } else {
            this.htmlEl!.classList.remove("toggled")
        }
        ActionButtonsManager.toggleStateChange(this.actionBinding!.name, this.actionBinding!.toggled)
        AudioManager.playGuiButtonToggle(this.actionBinding!.toggled)
    }

    setBinding(binding: ActionButtonActionBinding) {
        this.actionBinding = binding
        const action: ActionButtonAction = ActionButtonActions.getActionByName(binding.name)!
        this.setImage(action.image)

        if (action.toggleable && binding.toggled) {
            this.htmlEl!.classList.add("toggled")
        } else {
            this.htmlEl!.classList.remove("toggled")
        }
    }

    clearBinding() {
        this.actionBinding = null
        this.htmlEl!.style.backgroundImage = ""
        this.htmlEl!.classList.remove("toggled")
    }

    setImage(imageSrc: string) {
        this.htmlEl!.style.backgroundImage = `url('images/icons/buttons/${imageSrc}.gif')`
    }

    activated() {
        this.active = true
        this.htmlEl!.classList.add("active")
    }

    deactivated() {
        this.active = false
        this.htmlEl!.classList.remove("active")
    }
}

export const ActionButtonsManager = {
    actionBindingKey: "DARKENLIGHT_ACTION_BUTTONS_BINDINGS",
    desktopPanel: null as HTMLElement,
    touchPanel: null as HTMLElement,
    bindings: new Map<number, ActionButtonActionBinding>(),
    actionButtons: new Map<number, ActionButton>(),

    initialize() {
        this.desktopPanel = document.getElementById("action-buttons-desktop") as HTMLElement
        this.touchPanel = document.getElementById("action-buttons-touch") as HTMLElement

        // Create 8 empty action buttons and store to map
        for (let i = 1; i <= 8; i++) {
            this.actionButtons.set(i, new ActionButton(i.toString()))
        }

        // Init default bindings if not present in localStorage
        if (!localStorage.getItem(this.actionBindingKey)) {
            this.bindings.set(1, new ActionButtonActionBinding(ActionButtonActions.AUTO_ATTACK.name, {}))
            localStorage.setItem(this.actionBindingKey, JSON.stringify(Array.from(this.bindings.entries())))
        } else {
            const storedBindings = JSON.parse(localStorage.getItem(this.actionBindingKey)!)
            this.bindings = new Map<number, ActionButtonActionBinding>(storedBindings)
        }
        this.renderActionButtons()
    },

    onFrame(time) {
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
        this.desktopPanel.innerHTML = ""
        this.touchPanel.innerHTML = ""

        const activePanel = Settings.isPhoneOrTablet() ? this.touchPanel : this.desktopPanel
        if (Settings.isPhoneOrTablet()) {
            this.desktopPanel.style.setProperty("display", "none")
        } else {
            this.touchPanel.style.setProperty("display", "none")
        }

        activePanel.style.setProperty("display", "flex")
        this.actionButtons.forEach((btn) => {
            const binding = this.bindings.get(parseInt(btn.index))
            if (binding) {
               btn.setBinding(binding)
            } else {
               btn.clearBinding()
            }
            activePanel.appendChild(btn.htmlEl!)
        })
    },

    onclickActionButton(index: number) {
        const actionButton = this.actionButtons.get(index)
        if (actionButton && actionButton.actionBinding) {
            AudioManager.playGuiButtonClick()

            switch (actionButton.actionBinding.name) {
                case ActionButtonActions.AUTO_ATTACK.name:
                    this.clickOnAutoAttackButton()
                    break
            }
        }
    },

    toggleStateChange(actionName: string, toggled: boolean) {
        this.storeBindings()

        switch (actionName) {
            case ActionButtonActions.AUTO_ATTACK.name:
                OnScreenMessageManager.addMessage(`Auto-Útok: ${toggled ? 'Zapnuto' : 'Vypnuto'}`)
                break
        }
    },

    activated(action: ActionButtonAction) {
        this.actionButtons.forEach((btn) => {
            if (btn.actionBinding && btn.actionBinding.name === action.name) {
                btn.activated()
            }
        })
    },

    deactivated(action: ActionButtonAction) {
        this.actionButtons.forEach((btn) => {
            if (btn.actionBinding && btn.actionBinding.name === action.name) {
                btn.deactivated()
            }
        })
    },

    clickOnAutoAttackButton() {
        TargetingManager.checkAutoAttackOnSelectedTarget(true)
    },

    isButtonToggled(action: ActionButtonAction): boolean {
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
}

export const ActionButtonActions = {
    AUTO_ATTACK: new ActionButtonAction("AUTO_ATTACK", "btn_attack", true),
    HEALING: new ActionButtonAction("HEALING", "btn_heal", false),

    getActionByName(name: string): ActionButtonAction {
        for (const key in this) {
            if (this[key as keyof typeof this].name === name) {
                return this[key as keyof typeof this]
            }
        }
    }
}
