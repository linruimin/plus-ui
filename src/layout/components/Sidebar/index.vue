<template>
  <div class="sidebar-shell" :style="menuStyle">
    <user-panel :collapse="isCollapse" @set-layout="emit('set-layout')" />
    <el-scrollbar :class="sideTheme" wrap-class="scrollbar-wrapper">
      <transition :enter-active-class="animateConfig.menuSearchAnimate.enter" mode="out-in">
        <el-menu
          :default-active="activeMenu"
          :collapse="isCollapse"
          :unique-opened="true"
          :collapse-transition="false"
          :popper-offset="12"
          mode="vertical"
        >
          <sidebar-item v-for="(r, index) in sidebarRouters" :key="r.path + index" :item="r" :base-path="r.path" />
        </el-menu>
      </transition>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { RouteRecordRaw } from 'vue-router';
import animateConfig from '@/animate';
import { useAppStore } from '@/store/modules/app';
import { usePermissionStore } from '@/store/modules/permission';
import { useSettingsStore } from '@/store/modules/settings';
import UserPanel from './UserPanel.vue';
import SidebarItem from './SidebarItem.vue';

const route = useRoute();
const appStore = useAppStore();
const settingsStore = useSettingsStore();
const permissionStore = usePermissionStore();
const sidebarRouters = computed<RouteRecordRaw[]>(() => permissionStore.getSidebarRoutes());
const sideTheme = computed(() => settingsStore.sideTheme);
const theme = computed(() => settingsStore.theme);
const isCollapse = computed(() => !appStore.sidebar.opened);
/** 「布局设置」入口随顶部导航条一起挪到了用户面板里，由 Layout 打开 Settings 抽屉。 */
const emit = defineEmits<{ 'set-layout': [] }>();

const activeMenu = computed(() => {
  const { meta, path } = route;
  // if set path, the sidebar will highlight the path you set
  if (meta.activeMenu) {
    return meta.activeMenu;
  }
  return path;
});

const bgColor = computed(() => (sideTheme.value === 'theme-dark' ? '#111827' : '#ffffff'));
const textColor = computed(() => (sideTheme.value === 'theme-dark' ? '#e5edf8' : '#1f2937'));
const menuStyle = computed(() => ({
  backgroundColor: bgColor.value,
  '--el-menu-bg-color': bgColor.value,
  '--el-menu-text-color': textColor.value,
  '--el-menu-active-color': theme.value
}));
</script>

<style lang="scss" scoped>
.sidebar-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 8px 12px;
  border: 1px solid var(--app-sidebar-border);
  border-radius: var(--app-radius-base);
  box-shadow: var(--app-shadow-sm);
  background: v-bind(bgColor) !important;
  overflow: hidden;
}

:deep(.el-scrollbar__view) {
  min-height: 0;
  padding-bottom: 12px;
}

:deep(.el-scrollbar) {
  flex: 1;
  min-height: 0;
  height: auto !important;
}

:deep(.el-scrollbar__wrap) {
  height: 100%;
  overflow-x: hidden;
}
</style>
