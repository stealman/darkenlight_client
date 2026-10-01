<template>
    <GameDialog
        ref="gameDialog"
        backdrop-class="login-screen-backdrop"
        :window-class="['login-dialog-window', {
            'login-dialog-window--mobile': useMobileLoginLayout,
            'login-dialog-window--phone': usePhoneLoginLayout,
        }]"
        content-class="login-dialog-content"
        :close-on-backdrop="false"
        :close-on-escape="false"
    >
        <template #header>
            <span class="login-dialog-title ui-text-gradient">Darkenlight</span>
        </template>

        <template v-if="dialogMode === 'login'">
        <section class="login-guest-section">
            <div class="login-section-copy">
                <div class="login-section-title"><span class="ui-text-gradient">{{ t('login.guestTitle') }}</span></div>
            </div>
            <label class="login-field login-guest-field" for="username">
                <span :class="{ 'login-field-label--ready': guestLoginReady }">{{ t('login.name') }}</span>
                <input id="username" v-model="charName" type="text" @keydown="clearLoginAndPassword" />
            </label>
            <div class="login-section-description login-guest-description">{{ t('login.guestDescription') }}</div>
        </section>

        <div class="login-section-divider"></div>

        <section class="login-account-section">
            <div class="login-section-title"><span class="ui-text-gradient">{{ t('login.accountTitle') }}</span></div>
            <div class="login-account-form">
                <label class="login-field" for="account-login">
                    <span :class="{ 'login-field-label--ready': accountLoginReady }">{{ t('login.accountLogin') }}</span>
                    <input id="account-login" v-model="login" type="text" @keydown="clearCharName" />
                </label>
                <label class="login-field" for="account-password">
                    <span :class="{ 'login-field-label--ready': accountPasswordReady }">{{ t('login.password') }}</span>
                    <input id="account-password" v-model="password" type="password" />
                </label>
                <div class="login-checkbox-field">
                    <span>{{ t('login.rememberMe') }}</span>
                    <Checkbox name="remember-me" input-id="rememberme" v-model="rememberMe" binary />
                </div>
                <div v-if="rememberMe" class="login-checkbox-field">
                    <span>{{ t('login.autoLogin') }}</span>
                    <Checkbox name="auto-login" input-id="autologin" v-model="autoLogin" binary />
                </div>
            </div>
        </section>

        <div class="dialog-actions login-dialog-actions">
            <button class="dialog-button login-submit-button" :disabled="!canSubmit" @click="AudioManager.playGuiButtonClick(); doLogin()"><span class="ui-text-gradient--button-state">{{ t('login.submit') }}</span></button>
            <button v-if="!charName.trim()" class="dialog-button" @click="AudioManager.playGuiButtonClick(); openRegistration()"><span class="ui-text-gradient--button-state">{{ t('login.register') }}</span></button>
        </div>
        </template>

        <template v-else>
            <section class="login-registration-section">
                <div class="login-section-title"><span class="ui-text-gradient">{{ t('login.registrationTitle') }}</span></div>
                <div class="login-section-description login-registration-description">{{ t('login.registrationDescription') }}</div>
                <div class="login-account-form">
                    <label class="login-field" for="registration-email">
                        <span :class="{ 'login-field-label--ready': registrationEmailReady }">{{ t('login.email') }}</span>
                        <input id="registration-email" v-model="registrationEmail" type="email" autocomplete="email" />
                    </label>
                    <label class="login-field" for="registration-password">
                        <span :class="{ 'login-field-label--ready': registrationPasswordReady }">{{ t('login.password') }}</span>
                        <input id="registration-password" v-model="registrationPassword" type="password" autocomplete="new-password" />
                    </label>
                    <label class="login-field" for="registration-password-confirmation">
                        <span :class="{ 'login-field-label--ready': registrationPasswordsMatch }">{{ t('login.confirmPassword') }}</span>
                        <input id="registration-password-confirmation" v-model="registrationPasswordConfirmation" type="password" autocomplete="new-password" />
                    </label>
                </div>
                <div v-if="registrationMessage" :class="['login-registration-message', { 'login-registration-message--success': registrationSucceeded }]">
                    {{ registrationMessage }}
                </div>
            </section>
            <div class="dialog-actions login-dialog-actions">
                <button v-if="!registrationSucceeded" class="dialog-button" :disabled="!canRegister" @click="AudioManager.playGuiButtonClick(); doRegister()"><span class="ui-text-gradient--button-state">{{ t('login.confirmRegistration') }}</span></button>
                <button class="dialog-button" @click="AudioManager.playGuiButtonClick(); returnToLogin()"><span class="ui-text-gradient--button-state">{{ t('login.guestCreationBack') }}</span></button>
            </div>
        </template>
    </GameDialog>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import GameDialog from '@/vue/views/GameDialog.vue'
import { Connector } from '@/network/connector'
import { Settings } from '@/settings/settings'
import { useI18n } from '@/i18n'
import { AudioManager } from '@/babylon/audio/audioManager'

let rememberMe = ref(false)
let autoLogin = ref(false)
const login = ref('')
const password = ref('')
const charName = ref('')
const dialogMode = ref('login')
const registrationEmail = ref('')
const registrationPassword = ref('')
const registrationPasswordConfirmation = ref('')
const registrationMessage = ref('')
const registrationSucceeded = ref(false)
const registrationSubmitting = ref(false)
const gameDialog = ref(null)
const useMobileLoginLayout = Settings.isPhoneOrTablet()
const usePhoneLoginLayout = Settings.getDeviceType() === 'PHONE'
const guestLoginReady = computed(() => charName.value.trim().length >= 3)
const accountLoginReady = computed(() => login.value.trim().length >= 3)
const accountPasswordReady = computed(() => password.value.length >= 3)
const canSubmit = computed(() => guestLoginReady.value || (accountLoginReady.value && accountPasswordReady.value))
const registrationEmailReady = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registrationEmail.value.trim()))
const registrationPasswordReady = computed(() => registrationPassword.value.length >= 3)
const registrationPasswordsMatch = computed(() => registrationPasswordConfirmation.value.length > 0 && registrationPassword.value === registrationPasswordConfirmation.value)
const canRegister = computed(() => registrationEmailReady.value && registrationPasswordReady.value && registrationPasswordsMatch.value && !registrationSubmitting.value)

const emit = defineEmits(['login-requested'])
const { t } = useI18n()

onMounted(() => {
    const loginForm = localStorage.getItem('DARKENLIGHT_LOGIN_FORM')
    if (loginForm) {
        const form = JSON.parse(loginForm)
        login.value = form.login
        password.value = form.password
        charName.value = form.charName
        rememberMe.value = form.rememberMe
        autoLogin.value = form.autoLogin
    }

    window.addEventListener('game:player-registration', onPlayerRegistration)
    window.requestAnimationFrame(setSharedDialogHeight)
})

onUnmounted(() => {
    window.removeEventListener('game:player-registration', onPlayerRegistration)
})

const showLoadingBeforeRequest = async () => {
    emit('login-requested')
    await nextTick()

    // The local server can answer quickly enough that processing its initial
    // world batch starts before the browser paints Vue's loading state. Queue
    // the request after a rendered frame so the progress UI is visible first.
    await new Promise((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
    })
}

const doLogin = async () => {
    const form = {
        login: login.value,
        password: password.value,
        charName: charName.value,
        rememberMe: rememberMe.value,
        autoLogin: rememberMe.value && autoLogin.value
    }

    if (form.rememberMe) {
        localStorage.setItem('DARKENLIGHT_LOGIN_FORM', JSON.stringify(form))
    } else {
        localStorage.removeItem('DARKENLIGHT_LOGIN_FORM')
    }

    if (accountLoginReady.value && accountPasswordReady.value) {
        await showLoadingBeforeRequest()
        Connector.sendLoginRequest(form.login, form.password)
    } else if (guestLoginReady.value) {
        await showLoadingBeforeRequest()
        Connector.checkGuestCharacterName(form.charName)
    } else {
        alert(t('login.missingCredentials'))
    }
}

const clearCharName = () => {
    charName.value = ''
}

const clearLoginAndPassword = () => {
    login.value = ''
    password.value = ''
}

const setSharedDialogHeight = () => {
    if (useMobileLoginLayout) {
        return
    }

    const dialogSurface = gameDialog.value?.windowRef?.querySelector('.dialog-surface')
    if (dialogSurface) {
        document.documentElement.style.setProperty('--login-dialog-desktop-height', `${Math.ceil(dialogSurface.getBoundingClientRect().height)}px`)
    }
}

const openRegistration = () => {
    const dialogSurface = gameDialog.value?.windowRef?.querySelector('.dialog-surface')
    if (!useMobileLoginLayout && dialogSurface) {
        dialogSurface.style.minHeight = `${Math.ceil(dialogSurface.getBoundingClientRect().height)}px`
    }
    registrationEmail.value = login.value.trim()
    dialogMode.value = 'register'
    registrationMessage.value = ''
    registrationSucceeded.value = false
}

const returnToLogin = () => {
    const dialogSurface = gameDialog.value?.windowRef?.querySelector('.dialog-surface')
    if (dialogSurface) {
        dialogSurface.style.minHeight = ''
    }
    if (registrationSucceeded.value) {
        login.value = registrationEmail.value.trim()
    }
    dialogMode.value = 'login'
    registrationMessage.value = ''
    registrationSucceeded.value = false
}

const doRegister = () => {
    if (!canRegister.value) {
        return
    }

    registrationSubmitting.value = true
    registrationMessage.value = ''
    Connector.registerPlayer(registrationEmail.value.trim(), registrationPassword.value)
}

const onPlayerRegistration = (event) => {
    const detail = event.detail
    registrationSubmitting.value = false
    registrationSucceeded.value = detail?.success === true
    registrationMessage.value = registrationSucceeded.value
        ? t('login.registrationComplete')
        : detail?.message || t('login.registrationFailed')
}

</script>

<style>
.dialog-backdrop.login-screen-backdrop {
    background: #050709 url('/images/screen/splash1.jpg') center center / cover no-repeat;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
}

.dialog-window.login-dialog-window {
    width: 600px;
    max-width: calc(100vw - 32px);
}

.dialog-window.login-dialog-window--mobile {
    position: fixed;
    top: calc(var(--app-viewport-top, 0px) + var(--login-viewport-top-inset, 1vh));
    bottom: auto;
    left: 10vw;
    width: 80vw;
    max-width: 80vw;
    box-sizing: border-box;
    height: calc(var(--app-viewport-height, 100vh) - var(--login-viewport-top-inset, 1vh) - var(--login-viewport-bottom-inset, 4vh));
    max-height: none;
    min-height: 0;
    padding: 5px;
    border-bottom: 2px ridge rgba(0, 0, 0, 0.4);
    border-right: 2px ridge rgba(0, 0, 0, 0.4);
    box-shadow: 0 0 20px rgb(var(--ui-darkest)), 0 0 40px rgba(0, 0, 0, 0.4);
}

.login-dialog-window > .dialog-surface {
    height: 100%;
    min-height: 100%;
    display: flex;
    flex-direction: column;
}

.login-dialog-window:not(.login-dialog-window--mobile) > .dialog-surface {
    height: auto;
    min-height: var(--login-dialog-desktop-height, 0px);
}

.login-dialog-window > .dialog-surface > .login-dialog-content {
    display: block;
    flex: 1 1 0;
    min-height: 0;
    box-sizing: border-box;
    max-height: none;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: none;
    padding: 0 12px 12px;
}

.login-dialog-window:not(.login-dialog-window--mobile) > .dialog-surface > .login-dialog-content {
    flex: 0 0 auto;
    min-height: auto;
    overflow: visible;
}

.login-dialog-window > .dialog-surface > .login-dialog-content::-webkit-scrollbar {
    display: none;
}

.login-dialog-window > .dialog-surface > .dialog-header {
    padding: 5px;
    font-size: 1.28rem;
}

.login-dialog-title {
    letter-spacing: 0.08em;
    text-shadow: none;
}

.login-guest-section {
    max-width: 420px;
    margin: 4px auto 0;
    text-align: left;
}

.login-section-copy {
    margin-bottom: 12px;
    text-align: center;
}

.login-section-title {
    font-size: 0.98rem;
    font-weight: 700;
    line-height: 1.2;
}

.login-section-description {
    color: rgb(var(--ui-base));
    font-size: 0.86rem;
    line-height: 1.35;
}

.login-guest-description {
    margin: 5px 0 0 130px;
    color: rgb(var(--ui-dark));
    font-style: italic;
    text-align: left;
    white-space: nowrap;
}

.login-field,
.login-checkbox-field {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    color: rgb(var(--ui-base));
    font-size: 0.88rem;
}

.login-field > span,
.login-checkbox-field > span {
    text-align: right;
}

.login-field-label--ready {
    color: rgb(var(--ui-accent-blue));
    text-shadow: 0 0 4px rgba(var(--ui-accent-blue), 0.34);
}

.login-checkbox-field > span {
    text-align: left;
    white-space: nowrap;
}

.login-checkbox-field {
    width: calc(100% - 130px);
    margin-left: 130px;
    grid-template-columns: minmax(0, 1fr) auto;
}

.login-checkbox-field,
.login-checkbox-field .p-checkbox,
.login-checkbox-field .p-checkbox-input {
    cursor: url('/images/cursor-pointer.png') 0 10, pointer !important;
}

.login-dialog-content .login-field input {
    box-sizing: border-box;
    width: 100%;
    height: 1.75rem;
    color: rgb(var(--ui-attribute-agility));
    caret-color: rgb(var(--ui-attribute-agility));
    border: 1px solid rgba(176, 143, 86, 0.78);
    background: rgba(var(--ui-darkest), 0.62);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.38), 0 0 4px rgba(176, 143, 86, 0.12);
}

.login-dialog-content .login-field input:focus {
    border-color: rgb(var(--ui-base));
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.38), 0 0 7px rgba(176, 143, 86, 0.28);
}

.login-dialog-content .login-field input[type="text"],
.login-dialog-content .login-field input[type="email"],
.login-dialog-content .login-field input[type="password"] {
    color: rgb(var(--ui-attribute-agility)) !important;
    -webkit-text-fill-color: rgb(var(--ui-attribute-agility));
}

.login-section-divider {
    max-width: 420px;
    margin: 16px auto 14px;
    border-top: 1px solid rgba(176, 143, 86, 0.5);
}

.login-account-section {
    max-width: 420px;
    margin: 0 auto;
    text-align: left;
}

.login-account-section .login-section-title {
    margin-bottom: 8px;
    text-align: center;
}

.login-account-form {
    display: grid;
    gap: 8px;
}

.login-registration-section {
    max-width: 420px;
    margin: 20px auto 0;
    text-align: left;
}

.login-registration-section .login-section-title {
    text-align: center;
}

.login-registration-description {
    margin: 8px 0 16px;
    text-align: center;
}

.login-registration-message {
    margin: 16px auto 0;
    color: rgb(var(--ui-accent-red));
    font-size: 0.9rem;
    line-height: 1.4;
    text-align: center;
}

.login-registration-message--success {
    color: rgb(var(--ui-attribute-agility));
}

.login-dialog-actions {
    margin-top: 12px;
    padding-bottom: 4px;
}

@media (orientation: portrait) {
    .dialog-window.login-dialog-window--mobile {
        top: calc(var(--app-viewport-top, 0px) + (var(--app-viewport-height, 100vh) / 2));
        left: 2vw;
        width: 96vw;
        max-width: 96vw;
        height: auto;
        max-height: calc(var(--app-viewport-height, 100vh) - var(--login-viewport-top-inset, 1vh) - var(--login-viewport-bottom-inset, 4vh));
        transform: translateY(-50%);
    }

    .login-dialog-window--mobile > .dialog-surface {
        height: auto;
        min-height: 0;
        max-height: inherit;
    }

    .login-dialog-window--mobile > .dialog-surface > .dialog-header {
        padding: 8px 5px;
        font-size: 1.55rem;
    }

    .login-dialog-window--mobile > .dialog-surface > .login-dialog-content {
        flex: 0 1 auto;
        padding: 2px 8px 10px;
    }

    .login-dialog-window--mobile .login-guest-section,
    .login-dialog-window--mobile .login-account-section,
    .login-dialog-window--mobile .login-registration-section,
    .login-dialog-window--mobile .login-section-divider {
        box-sizing: border-box;
        width: 100%;
        max-width: none;
    }

    .login-dialog-window--mobile .login-section-title {
        font-size: 1.2rem;
    }

    .login-dialog-window--mobile .login-section-description {
        font-size: 1rem;
    }

    .login-dialog-window--mobile .login-field {
        grid-template-columns: minmax(0, 1fr);
        gap: 6px;
        font-size: 1.1rem;
    }

    .login-dialog-window--mobile .login-field > span {
        text-align: left;
    }

    .login-dialog-window--mobile .login-checkbox-field {
        width: 100%;
        margin-left: 0;
        grid-template-columns: minmax(0, 1fr) auto;
        font-size: 1.05rem;
    }

    .login-dialog-window--mobile .login-guest-description {
        margin-left: 0;
        white-space: normal;
    }

    .login-dialog-window--mobile .login-dialog-content .login-field input {
        height: 3.5rem;
        padding: 10px 12px;
        font-size: 1.25rem;
    }

    .login-dialog-window--mobile .login-account-form {
        gap: 12px;
    }

    .login-dialog-window--mobile .login-section-divider {
        margin: 12px auto;
    }

    .login-dialog-window--mobile .login-checkbox-field .p-checkbox-box {
        width: 26px;
        height: 26px;
    }

    .login-dialog-window--mobile .login-checkbox-field .p-checkbox-icon {
        font-size: 19px;
    }

    .login-dialog-window--mobile .login-dialog-actions {
        gap: 8px;
        margin-top: 24px;
        flex-wrap: wrap;
    }

    .login-dialog-window--mobile .login-dialog-actions .dialog-button {
        flex: 1 1 130px;
        padding: 12px 14px;
        font-size: 1.05rem;
    }

    .login-dialog-window--mobile .login-submit-button {
        font-size: 1.25rem;
    }

    .dialog-window.login-dialog-window--phone {
        padding: 1vw;
    }

    .login-dialog-window--phone > .dialog-surface > .dialog-header {
        padding: 2vw 1vw;
        font-size: 6vw;
    }

    .login-dialog-window--phone > .dialog-surface > .login-dialog-content {
        padding: 1vw 2vw 3vw;
    }

    .login-dialog-window--phone .login-section-copy {
        margin-bottom: 3vw;
    }

    .login-dialog-window--phone .login-section-title {
        font-size: 5vw;
    }

    .login-dialog-window--phone .login-section-description {
        font-size: 4vw;
    }

    .login-dialog-window--phone .login-field {
        gap: 1.5vw;
        font-size: 4.8vw;
    }

    .login-dialog-window--phone .login-dialog-content .login-field input {
        height: 14vw;
        padding: 2.5vw 3vw;
        font-size: 5vw;
    }

    .login-dialog-window--phone .login-account-form {
        gap: 3vw;
    }

    .login-dialog-window--phone .login-section-divider {
        margin: 4vw auto;
    }

    .login-dialog-window--phone .login-checkbox-field {
        font-size: 4.5vw;
    }

    .login-dialog-window--phone .login-checkbox-field .p-checkbox-box {
        width: 9vw;
        height: 9vw;
    }

    .login-dialog-window--phone .login-checkbox-field .p-checkbox-icon {
        font-size: 6vw;
    }

    .login-dialog-window--phone .login-dialog-actions {
        gap: 2vw;
        margin-top: 6vw;
    }

    .login-dialog-window--phone .login-dialog-actions .dialog-button {
        padding: 3vw 3.5vw;
        font-size: 4.8vw;
    }

    .login-dialog-window--phone .login-submit-button {
        font-size: 5.5vw;
    }
}

</style>
