<template>
  <div class="sidebar-user" :class="{ collapse }">
    <el-dropdown class="sidebar-user-dropdown" trigger="click" placement="bottom-start" @command="handleCommand">
      <div class="sidebar-user-wrapper">
        <img :src="userStore.avatar" class="sidebar-user-avatar" alt="avatar" />
        <div v-if="!collapse" class="sidebar-user-meta">
          <span class="sidebar-user-name">{{ displayName }}</span>
          <span class="sidebar-user-role">Workspace</span>
        </div>
        <el-icon v-if="!collapse" class="sidebar-user-arrow"><caret-bottom /></el-icon>
      </div>
      <template #dropdown>
        <el-dropdown-menu>
          <router-link to="/user/profile">
            <el-dropdown-item>{{ $t('navbar.personalCenter') }}</el-dropdown-item>
          </router-link>
          <el-dropdown-item command="toggleSidebar">
            <span>{{ sidebarOpened ? '收起菜单' : '展开菜单' }}</span>
          </el-dropdown-item>
          <el-dropdown-item v-if="settingsStore.showSettings" command="setLayout">
            <span>{{ $t('navbar.layoutSetting') }}</span>
          </el-dropdown-item>
          <el-dropdown-item divided command="logout">
            <span>{{ $t('navbar.logout') }}</span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import type { ElMessageBoxOptions } from 'element-plus';
import { CaretBottom } from '@element-plus/icons-vue';
import tab from '@/plugins/tab';
import router from '@/router';
import { useAppStore } from '@/store/modules/app';
import { NavTypeEnum } from '@/enums/NavTypeEnum';
import { useSettingsStore } from '@/store/modules/settings';
import { useUserStore } from '@/store/modules/user';

/**
 * 侧边栏顶部的用户面板（原来的 logo 位置）：头像 + 昵称 + 下拉菜单。
 * 顶部导航条（Navbar）已按需求整行移除，所以「个人中心 / 布局设置 / 退出登录」都收在这里，
 * 并额外提供「收起 / 展开菜单」—— 汉堡按钮随导航条一起去掉了，这里是唯一入口。
 */
defineProps<{ collapse: boolean }>();

const appStore = useAppStore();
const userStore = useUserStore();
const settingsStore = useSettingsStore();

const displayName = computed(() => userStore.nickname || '管理员');
const sidebarOpened = computed(() => appStore.sidebar.opened);

// 跟随侧边栏深浅主题（与 Logo 组件同一套取色）
const sideTheme = computed(() => settingsStore.sideTheme);
const isTopNav = computed(() => settingsStore.navType === NavTypeEnum.TOP);
const isDarkSide = computed(() => !isTopNav.value && sideTheme.value === 'theme-dark');
const surface = computed(() => (isDarkSide.value ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc'));
const border = computed(() => (isDarkSide.value ? 'rgba(148, 163, 184, 0.12)' : '#e5e7eb'));
const nameColor = computed(() => (isDarkSide.value ? '#f8fbff' : 'var(--app-text-title)'));
const subColor = computed(() => (isDarkSide.value ? 'rgba(226, 232, 240, 0.66)' : 'var(--el-text-color-secondary)'));

const emit = defineEmits<{ 'set-layout': [] }>();

const logout = async () => {
  await ElMessageBox.confirm('确定注销并退出系统吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  } as ElMessageBoxOptions);
  userStore.logout().then(() => {
    router.replace({
      path: '/login',
      query: {
        redirect: encodeURIComponent(router.currentRoute.value.fullPath || '/')
      }
    });
    tab.closeAllPage();
  });
};

const commandMap: { [key: string]: () => void } = {
  toggleSidebar: () => appStore.toggleSideBar(false),
  setLayout: () => emit('set-layout'),
  logout
};
const handleCommand = (command: string) => {
  commandMap[command]?.();
};
</script>

<style lang="scss" scoped>
.sidebar-user {
  flex-shrink: 0;
  margin-top: 8px;
  overflow: hidden;

  .sidebar-user-dropdown {
    display: block;
    width: 100%;
  }

  .sidebar-user-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 46px;
    padding: 0 10px;
    border-radius: 14px;
    background: v-bind(surface);
    border: 1px solid v-bind(border);
    cursor: pointer;
    overflow: hidden;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;

    &:hover {
      border-color: rgba(64, 158, 255, 0.35);
    }
  }

  :deep(.el-tooltip__trigger:focus-visible) {
    outline: none;
  }

  .sidebar-user-avatar {
    width: 28px;
    height: 28px;
    border-radius: 10px;
    flex-shrink: 0;
    object-fit: cover;
  }

  .sidebar-user-meta {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    line-height: 1.2;
  }

  .sidebar-user-name {
    font-size: 13px;
    font-weight: 600;
    color: v-bind(nameColor);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-user-role {
    font-size: 11px;
    color: v-bind(subColor);
    white-space: nowrap;
  }

  .sidebar-user-arrow {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 12px;
    color: v-bind(subColor);
  }

  &.collapse {
    .sidebar-user-wrapper {
      justify-content: center;
      padding: 0;
    }
  }
}
</style>
