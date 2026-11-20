<script setup lang="ts">
defineOptions({ name: 'Profile' });

import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import AppDialog from '@/components/AppDialog/index.vue';
import UploadImage from '@/components/UploadImage/index.vue';
import { changePassword, updateProfile, type ProfilePayload } from '@/api/profile';
import { useUserStore } from '@/stores/user';
import { formatDateTime } from '@/utils/datetime';

const router = useRouter();
const user = useUserStore();

const avatar = ref<string | null>(user.profile?.avatar ?? null);
const basicFormRef = ref<FormInstance>();
const basicSaving = ref(false);
const basicForm = reactive({
  nickname: user.profile?.nickname ?? '',
  email: user.profile?.email ?? '',
  phone: user.profile?.phone ?? '',
});

const basicRules: FormRules = {
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
  email: [
    {
      validator: (_rule, value: string, callback) => {
        if (value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
          callback(new Error('邮箱格式不正确'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

async function handleSaveBasic(): Promise<void> {
  if (!basicFormRef.value) return;
  const valid = await basicFormRef.value.validate().catch(() => false);
  if (!valid) return;

  basicSaving.value = true;
  try {
    const payload: ProfilePayload = {
      nickname: basicForm.nickname.trim(),
      avatar: avatar.value,
      email: basicForm.email || null,
      phone: basicForm.phone || null,
    };
    await updateProfile(payload);
    await user.fetchProfile();
    ElMessage.success('资料已更新');
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    basicSaving.value = false;
  }
}

const passwordFormRef = ref<FormInstance>();
const passwordSaving = ref(false);
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });

const passwordRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '新密码至少 8 位', trigger: 'blur' },
  ],
  confirmPassword: [
    {
      validator: (_rule, value: string, callback) => {
        if (!value) {
          callback(new Error('请再次输入新密码'));
          return;
        }
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的密码不一致'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

const passwordDialogVisible = ref(false);

function openPasswordDialog(): void {
  passwordForm.oldPassword = '';
  passwordForm.newPassword = '';
  passwordForm.confirmPassword = '';
  passwordFormRef.value?.clearValidate();
  passwordDialogVisible.value = true;
}

async function handleChangePassword(): Promise<void> {
  if (!passwordFormRef.value) return;
  const valid = await passwordFormRef.value.validate().catch(() => false);
  if (!valid) return;

  passwordSaving.value = true;
  try {
    await changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    });
    passwordDialogVisible.value = false;
    ElMessage.success('密码已修改，请重新登录');
    user.clearSession();
    await router.replace('/login');
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    passwordSaving.value = false;
  }
}

const roleText = computed(() => {
  const roles = user.profile?.roles ?? [];
  return roles.length > 0 ? roles.map((role) => role.name).join('、') : '未分配角色';
});
</script>

<template>
  <div class="profile">
    <aside class="profile__side">
      <div class="profile__avatar-wrap">
        <UploadImage v-model="avatar" width="104px" height="104px" tip="更换头像" />
      </div>
      <h3 class="profile__name">{{ user.profile?.nickname || '-' }}</h3>
      <p class="profile__account">@{{ user.profile?.username }}</p>
      <el-tag v-if="user.profile?.isSuperAdmin" type="danger" effect="plain">超级管理员</el-tag>
      <el-tag v-else effect="plain">{{ roleText }}</el-tag>
      <div class="profile__meta">
        <span>最近登录：{{ formatDateTime(user.profile?.lastLoginAt) }}</span>
        <span>创建时间：{{ formatDateTime(user.profile?.createdAt) }}</span>
      </div>
    </aside>

    <section class="profile__main">
      <div class="profile__card">
        <h3 class="profile__card-title">基本资料</h3>
        <el-form ref="basicFormRef" :model="basicForm" :rules="basicRules" label-width="90px" class="profile__form">
          <el-form-item label="登录账号">
            <el-input :model-value="user.profile?.username" disabled />
          </el-form-item>
          <el-form-item label="昵称" prop="nickname">
            <el-input v-model="basicForm.nickname" maxlength="50" />
          </el-form-item>
          <el-form-item label="邮箱" prop="email">
            <el-input v-model="basicForm.email" maxlength="100" />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="basicForm.phone" maxlength="20" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="basicSaving" @click="handleSaveBasic">保存资料</el-button>
          </el-form-item>
        </el-form>
      </div>

      <div class="profile__card">
        <div class="profile__card-head">
          <h3 class="profile__card-title">账号安全</h3>
          <el-button type="warning" plain @click="openPasswordDialog">修改密码</el-button>
        </div>
        <p class="profile__tip">修改密码后当前登录状态会退出，需要使用新密码重新登录。</p>
      </div>
    </section>

    <AppDialog v-model="passwordDialogVisible" title="修改密码" width="460px">
      <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="90px">
        <el-form-item label="原密码" prop="oldPassword">
          <el-input v-model="passwordForm.oldPassword" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="passwordForm.newPassword" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password autocomplete="new-password" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="handleChangePassword">确认修改</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped lang="scss">
.profile {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.profile__side {
  display: flex;
  flex: 0 0 280px;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  padding: 32px 24px;
  background: #fff;
  border-radius: 10px;
}

.profile__avatar-wrap {
  margin-bottom: 6px;
}

.profile__name {
  margin: 0;
  font-size: 20px;
  color: #1f2d3d;
}

.profile__account {
  margin: 0;
  font-size: 13px;
  color: #8a94a6;
}

.profile__meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 18px;
  font-size: 12px;
  color: #a0a9b8;
  text-align: center;
}

.profile__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.profile__card {
  padding: 24px;
  background: #fff;
  border-radius: 10px;
}

.profile__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.profile__card-title {
  margin: 0 0 18px;
  font-size: 16px;
  color: #1f2d3d;
}

.profile__form {
  max-width: 520px;
}

.profile__tip {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #8a94a6;
}

@media (max-width: 900px) {
  .profile {
    flex-direction: column;
  }

  .profile__side {
    flex: none;
    width: 100%;
  }
}
</style>
