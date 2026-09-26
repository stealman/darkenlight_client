<template>
    <GameDialog
        backdrop-class="inventory-dialog-backdrop"
        :window-class="['login-dialog-window', { 'login-dialog-window--mobile': useMobileLoginLayout }]"
        content-class="login-dialog-content"
        :close-on-backdrop="false"
        :close-on-escape="false"
    >
        <template #header>
            <span class="login-dialog-title ui-text-gradient">Darkenlight</span>
        </template>

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
                    <span :class="{ 'login-field-label--ready': accountLoginReady }">{{ t('login.login') }}</span>
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
            <button class="dialog-button" :disabled="!canSubmit" @click="doLogin()"><span class="ui-text-gradient--button-state">{{ t('login.submit') }}</span></button>
        </div>
    </GameDialog>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import GameDialog from '@/vue/views/GameDialog.vue'
import { Connector } from '@/network/connector'
import { Settings } from '@/settings/settings'
import { useI18n } from '@/i18n'

let rememberMe = ref(false)
let autoLogin = ref(false)
const login = ref('')
const password = ref('')
const charName = ref('')
const useMobileLoginLayout = Settings.isPhoneOrTablet()
const guestLoginReady = computed(() => charName.value.trim().length >= 3)
const accountLoginReady = computed(() => login.value.trim().length >= 3)
const accountPasswordReady = computed(() => password.value.length >= 3)
const canSubmit = computed(() => guestLoginReady.value || (accountLoginReady.value && accountPasswordReady.value))

const emit = defineEmits(['login'])
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
})

const doLogin = () => {
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
        Connector.sendLoginRequest(form.login, form.password)
        emit('login')
    } else if (guestLoginReady.value) {
        Connector.sendLoginRequest(undefined, undefined, form.charName)
        emit('login')
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
</script>

<style>
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
    min-height: 0;
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
    margin: 5px 0 0;
    color: rgb(var(--ui-dark));
    text-align: center;
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

.login-dialog-actions {
    margin-top: 12px;
    padding-bottom: 4px;
}

@media (max-width: 520px) {
    .login-field,
    .login-checkbox-field {
        grid-template-columns: 105px minmax(0, 1fr);
    }

    .login-checkbox-field {
        width: calc(100% - 115px);
        margin-left: 115px;
        grid-template-columns: minmax(0, 1fr) auto;
    }

}

</style>
