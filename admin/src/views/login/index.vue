<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { getCaptcha } from '@/api/auth';
import { useAppStore } from '@/stores/app';
import { useUserStore } from '@/stores/user';

const route = useRoute();
const router = useRouter();
const app = useAppStore();
const user = useUserStore();

const year = new Date().getFullYear();

const features = [
  { icon: 'Lock', text: 'JWT 双端认证，登录状态自动续期' },
  { icon: 'User', text: '角色与按钮级权限精细控制' },
  { icon: 'Document', text: '写操作全程留痕，可追溯' },
];

const formRef = ref<FormInstance>();
const loading = ref(false);
const form = reactive({ username: '', password: '', captchaCode: '' });
const captcha = reactive({ id: '', image: '', loading: false });

/** 演示账号，与后端 SEED_DEMO_PASSWORD 默认值保持一致 */
const demoAccount = { username: 'demo', password: 'Demo@123456' };

function fillDemoAccount(): void {
  form.username = demoAccount.username;
  form.password = demoAccount.password;
  formRef.value?.clearValidate(['username', 'password']);
}

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  captchaCode: [
    { required: true, message: '请输入验证码', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (!/^\d{4}$/.test(String(value ?? '').trim())) {
          callback(new Error('请输入 4 位数字验证码'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

async function refreshCaptcha(): Promise<void> {
  captcha.loading = true;
  try {
    const data = await getCaptcha();
    captcha.id = data.captchaId;
    captcha.image = data.image;
    form.captchaCode = '';
    formRef.value?.clearValidate('captchaCode');
  } catch {
    captcha.id = '';
    captcha.image = '';
  } finally {
    captcha.loading = false;
  }
}

/** 只接受站内路径；旧版本曾把兜底的 /404 写进 redirect，这里一并忽略 */
function resolveRedirect(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  if (value === '/404' || value.startsWith('/404?') || value === '/login' || value.startsWith('/login?')) {
    return '/';
  }
  return value;
}

async function handleLogin(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  if (!captcha.id) {
    await refreshCaptcha();
    ElMessage.warning('验证码已刷新，请重新输入');
    return;
  }

  loading.value = true;
  try {
    await user.login({
      username: form.username,
      password: form.password,
      captchaId: captcha.id,
      captchaCode: form.captchaCode,
    });
    ElMessage.success('登录成功');
    await router.replace(resolveRedirect(route.query.redirect));
  } catch {
    // 错误文案由 request 拦截器统一提示；验证码一次性使用，失败后换新
    await refreshCaptcha();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void app.loadPublicConfigs();
  void refreshCaptcha();
});
</script>

<template>
  <div class="login">
    <div class="login__card">
      <!-- 左侧品牌区：仅宽屏展示 -->
      <aside class="login__brand">
        <div class="login__brand-top">
          <div class="login__logo-box">
            <img v-if="app.systemLogo" :src="app.systemLogo" alt="logo" class="login__logo" />
            <span v-else class="login__logo-text">{{ app.systemName.slice(0, 1) }}</span>
          </div>
          <span class="login__brand-name">{{ app.systemName }}</span>
        </div>

        <div class="login__brand-main">
          <p class="login__eyebrow">ADMIN CONSOLE</p>
          <h2 class="login__brand-title">让后台管理<br />更安全、更高效</h2>
          <ul class="login__features">
            <li v-for="item in features" :key="item.text" class="login__feature">
              <span class="login__feature-icon">
                <el-icon><component :is="item.icon" /></el-icon>
              </span>
              <span>{{ item.text }}</span>
            </li>
          </ul>
        </div>

        <div class="login__brand-foot">SECURE ACCESS · RBAC · AUDIT</div>
      </aside>

      <!-- 右侧表单区 -->
      <section class="login__panel">
        <div class="login__mobile-brand">
          <div class="login__logo-box login__logo-box--dark">
            <img v-if="app.systemLogo" :src="app.systemLogo" alt="logo" class="login__logo" />
            <span v-else class="login__logo-text">{{ app.systemName.slice(0, 1) }}</span>
          </div>
          <span class="login__mobile-name">{{ app.systemName }}</span>
        </div>

        <div class="login__head">
          <h1 class="login__title">欢迎登录</h1>
          <p class="login__subtitle">请输入账号密码进入管理后台</p>
        </div>

        <div class="login__demo">
          <span class="login__demo-tag">演示</span>
          <span class="login__demo-text">
            账号 <b>{{ demoAccount.username }}</b>
            <i class="login__demo-sep">/</i>
            密码 <b>{{ demoAccount.password }}</b>
          </span>
          <button type="button" class="login__demo-fill" @click="fillDemoAccount">一键填入</button>
        </div>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          size="large"
          class="login__form"
          @keyup.enter="handleLogin"
        >
          <el-form-item prop="username" class="login__item">
            <span class="login__label">账号</span>
            <el-input
              v-model="form.username"
              placeholder="请输入账号"
              autocomplete="username"
              clearable
            >
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>

          <el-form-item prop="password" class="login__item">
            <span class="login__label">密码</span>
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              show-password
              autocomplete="current-password"
            >
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>

          <el-form-item prop="captchaCode" class="login__item">
            <span class="login__label">验证码</span>
            <div class="login__captcha-row">
              <el-input
                v-model="form.captchaCode"
                maxlength="4"
                inputmode="numeric"
                placeholder="请输入 4 位验证码"
                autocomplete="off"
              >
                <template #prefix><el-icon><Key /></el-icon></template>
              </el-input>
              <button
                type="button"
                class="login__captcha"
                :class="{ 'is-loading': captcha.loading }"
                title="看不清？点击刷新验证码"
                @click="refreshCaptcha"
              >
                <img v-if="captcha.image" :src="captcha.image" alt="验证码" class="login__captcha-img" />
                <span v-else class="login__captcha-tip">
                  {{ captcha.loading ? '加载中…' : '点击获取' }}
                </span>
              </button>
            </div>
          </el-form-item>

          <el-button type="primary" class="login__submit" :loading="loading" @click="handleLogin">
            <span>{{ loading ? '登录中' : '登 录' }}</span>
            <el-icon v-if="!loading" class="login__submit-icon"><ArrowRight /></el-icon>
          </el-button>
        </el-form>

        <div v-if="app.loginNotice" class="login__notice">
          <el-icon class="login__notice-icon"><InfoFilled /></el-icon>
          <span>{{ app.loginNotice }}</span>
        </div>

        <p class="login__help">忘记密码或账号异常，请联系系统管理员</p>

        <footer class="login__foot">© {{ year }} {{ app.systemName }} · 后台管理系统</footer>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 32px 20px;
  overflow: hidden;
  background:
    radial-gradient(720px circle at 12% 18%, rgba(64, 158, 255, 0.24), transparent 62%),
    radial-gradient(620px circle at 88% 82%, rgba(0, 209, 178, 0.14), transparent 58%),
    linear-gradient(140deg, #0a1728 0%, #102d4c 52%, #0a1728 100%);
}

/* 淡网格增加层次，不抢内容的视觉焦点 */
.login::before {
  position: absolute;
  inset: 0;
  content: '';
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(circle at center, #000 20%, transparent 78%);
  pointer-events: none;
}

.login__card {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(960px, 100%);
  min-height: 580px;
  overflow: hidden;
  background: #fff;
  border-radius: 22px;
  box-shadow:
    0 32px 90px rgba(2, 10, 22, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.08);
  animation: login-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* ---------- 品牌区 ---------- */
.login__brand {
  position: relative;
  display: flex;
  flex: 0 0 44%;
  flex-direction: column;
  padding: 44px 42px;
  overflow: hidden;
  color: #fff;
  background: linear-gradient(165deg, #103a67 0%, #1b5a9b 54%, #2d7fce 100%);
}

.login__brand::before,
.login__brand::after {
  position: absolute;
  content: '';
  border-radius: 50%;
  pointer-events: none;
}

.login__brand::before {
  top: -110px;
  right: -90px;
  width: 300px;
  height: 300px;
  background: rgba(255, 255, 255, 0.12);
  filter: blur(4px);
}

.login__brand::after {
  bottom: -140px;
  left: -100px;
  width: 320px;
  height: 320px;
  background: rgba(0, 224, 255, 0.14);
  filter: blur(6px);
}

.login__brand-top,
.login__brand-main,
.login__brand-foot {
  position: relative;
  z-index: 1;
}

.login__brand-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.login__logo-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 12px;
  backdrop-filter: blur(6px);
}

.login__logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.login__logo-text {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}

.login__brand-name {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.login__brand-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  padding: 36px 0;
}

.login__eyebrow {
  margin: 0 0 16px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.62);
}

.login__brand-title {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  line-height: 1.45;
  letter-spacing: 1px;
}

.login__features {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin: 40px 0 0;
  padding: 0;
  list-style: none;
}

.login__feature {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.88);
}

.login__feature-icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  font-size: 15px;
  background: rgba(255, 255, 255, 0.14);
  border-radius: 9px;
}

.login__brand-foot {
  font-size: 11px;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.45);
}

/* ---------- 表单区 ---------- */
.login__panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 56px 60px 34px;
}

.login__mobile-brand {
  display: none;
}

.login__head {
  margin-bottom: 32px;
}

.login__title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: #16202f;
}

.login__subtitle {
  margin: 10px 0 0;
  font-size: 14px;
  color: #8a94a6;
}

.login__form {
  display: flex;
  flex-direction: column;
}

.login__demo {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 9px 12px;
  margin-bottom: 22px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 10px;
}

.login__demo-tag {
  flex: none;
  padding: 1px 8px;
  font-size: 12px;
  line-height: 20px;
  color: var(--el-color-primary);
  background: var(--el-bg-color);
  border-radius: 6px;
}

.login__demo-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.login__demo-text b {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.login__demo-sep {
  margin: 0 6px;
  font-style: normal;
  color: var(--el-text-color-placeholder);
}

.login__demo-fill {
  flex: none;
  padding: 0;
  font-size: 13px;
  color: var(--el-color-primary);
  cursor: pointer;
  background: none;
  border: none;
}

.login__demo-fill:hover {
  text-decoration: underline;
}

.login__item {
  display: block;
  margin-bottom: 20px;
}

.login__item :deep(.el-form-item__content) {
  display: block;
  line-height: normal;
}

.login__label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #495468;
}

.login__form :deep(.el-input__wrapper) {
  height: 48px;
  padding: 0 14px;
  background: #f7f9fc;
  border-radius: 10px;
  box-shadow: 0 0 0 1px #e3e8f0 inset;
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.login__form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #c8d4e4 inset;
}

.login__form :deep(.el-input__wrapper.is-focus) {
  background: #fff;
  box-shadow:
    0 0 0 2px rgba(31, 111, 235, 0.35) inset,
    0 6px 16px rgba(31, 111, 235, 0.08);
}

.login__form :deep(.el-input__inner) {
  font-size: 15px;
  color: #16202f;
}

.login__form :deep(.el-input__prefix) {
  color: #93a0b4;
}

.login__form :deep(.el-form-item__error) {
  padding-top: 5px;
  font-size: 12px;
}

.login__captcha-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.login__captcha-row :deep(.el-input) {
  flex: 1;
  min-width: 0;
}

.login__captcha {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 132px;
  height: 48px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  background: #f3f7fc;
  border: 1px solid #e3e8f0;
  border-radius: 10px;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.login__captcha:hover {
  border-color: #a9c2e4;
  box-shadow: 0 4px 12px rgba(31, 111, 235, 0.1);
}

.login__captcha.is-loading {
  cursor: wait;
  opacity: 0.7;
}

.login__captcha-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.login__captcha-tip {
  font-size: 12px;
  color: #8a94a6;
}

.login__submit {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 48px;
  margin-top: 6px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 2px;
  background: linear-gradient(120deg, #1f6feb 0%, #2f8de4 100%);
  border: none;
  border-radius: 10px;
  box-shadow: 0 10px 24px rgba(31, 111, 235, 0.28);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    filter 0.2s ease;
}

.login__submit:hover {
  background: linear-gradient(120deg, #1f6feb 0%, #2f8de4 100%);
  filter: brightness(1.06);
  box-shadow: 0 14px 30px rgba(31, 111, 235, 0.34);
  transform: translateY(-1px);
}

.login__submit:active {
  transform: translateY(0);
}

.login__submit-icon {
  font-size: 16px;
}

.login__notice {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 12px 14px;
  margin-top: 22px;
  font-size: 13px;
  line-height: 1.6;
  color: #6b5a1f;
  background: #fff8e6;
  border: 1px solid #f5e2b3;
  border-radius: 10px;
}

.login__notice-icon {
  flex: none;
  margin-top: 2px;
  color: #c89400;
}

.login__help {
  margin: 18px 0 0;
  font-size: 12px;
  color: #a0a9b8;
  text-align: center;
}

.login__foot {
  margin-top: auto;
  padding-top: 28px;
  font-size: 12px;
  color: #b4bcc9;
  text-align: center;
}

@keyframes login-in {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ---------- 响应式 ---------- */
@media (max-width: 900px) {
  .login {
    padding: 20px 16px;
  }

  .login__brand {
    display: none;
  }

  .login__card {
    width: min(430px, 100%);
    min-height: auto;
    border-radius: 18px;
  }

  .login__panel {
    padding: 30px 26px 26px;
  }

  .login__mobile-brand {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 26px;
  }

  .login__logo-box--dark {
    background: linear-gradient(160deg, #1b5a9b, #2d7fce);
    border: none;
  }

  .login__mobile-name {
    font-size: 16px;
    font-weight: 600;
    color: #16202f;
  }

  .login__head {
    margin-bottom: 24px;
  }

  .login__title {
    font-size: 24px;
  }

  .login__foot {
    padding-top: 22px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login__card {
    animation: none;
  }

  .login__submit {
    transition: none;
  }
}
</style>
