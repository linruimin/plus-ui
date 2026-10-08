<template>
  <section class="app-main">
    <router-view v-slot="{ Component, route }">
      <transition :enter-active-class="animate" mode="out-in">
        <keep-alive :include="tagsViewStore.cachedViews">
          <component :is="Component" v-if="!route.meta.link" :key="route.path" />
        </keep-alive>
      </transition>
    </router-view>
    <iframe-toggle />
  </section>
</template>

<script setup name="AppMain" lang="ts">
import animateConfig from '@/animate';
import { useFullHeightTable } from '@/hooks/table/useFullHeightTable';
import { useSettingsStore } from '@/store/modules/settings';
import { useTagsViewStore } from '@/store/modules/tagsView';
import IframeToggle from './IframeToggle/index.vue';

const route = useRoute();
const tagsViewStore = useTagsViewStore();
useFullHeightTable();

// 随机动画集合
const animate = ref<string>('');
watch(
  () => useSettingsStore().animationEnable,
  (val: boolean) => {
    if (val) {
      animate.value = animateConfig.animateList[Math.floor(Math.random() * animateConfig.animateList.length)] as string;
    } else {
      animate.value = animateConfig.defaultAnimate as string;
    }
  },
  { immediate: true }
);

watchEffect(() => {
  addIframe();
});

function addIframe() {
  if (route.meta.link) {
    useTagsViewStore().addIframeView(route);
  }
}
</script>

<style lang="scss" scoped>
.app-main {
  min-height: 100vh;
  width: 100%;
  position: relative;
  overflow: hidden;
  padding: 12px;

  &:fullscreen,
  &:-webkit-full-screen,
  &:-moz-full-screen,
  &:-ms-fullscreen {
    background: var(--el-bg-color);
    overflow-y: auto;
  }
}

// 顶部导航条（原 64px = 导航条 52 + 上留白 12）已整行移除，内容区直接铺满视口；
// 只有还带标签栏的页面（非 Ozon 页面）才减去标签栏那一行（12 上留白 + 38 标签高 = 50）。
.app-main {
  min-height: 100vh;
}

.app-main.with-tags-view {
  min-height: calc(100vh - 50px);
}

.app-main.with-fixed-header {
  padding-top: 50px;
  min-height: calc(100vh - 50px);
}

.app-main.with-fixed-header.with-tags-view {
  padding-top: 50px;
  min-height: calc(100vh - 50px);
}
</style>
<style lang="scss">
// fix css style bug in open el-dialog
.el-popup-parent--hidden {
  .fixed-header {
    padding-right: 6px;
  }
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background-color: var(--el-fill-color-lighter);
}

::-webkit-scrollbar-thumb {
  background-color: var(--el-text-color-placeholder);
  border-radius: 999px;
}
</style>
