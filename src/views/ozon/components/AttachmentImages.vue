<template>
  <div v-if="files.length" class="attachment-images" @click.stop>
    <template v-for="file in files" :key="file.cosUrl">
      <el-image v-if="file.image" class="attachment-thumbnail" :src="file.cosUrl" :alt="file.fileName" :title="file.fileName + ' · 点击放大'" fit="contain" loading="lazy" :preview-src-list="imageUrls" :initial-index="imageUrls.indexOf(file.cosUrl)" preview-teleported hide-on-click-modal>
        <template #error><span class="image-error">图片不可用</span></template>
      </el-image>
      <a v-else :href="file.cosUrl" target="_blank" rel="noopener noreferrer" :title="file.fileName">{{ file.fileName }}</a>
    </template>
  </div>
  <span v-else class="no-attachment">—</span>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { attachmentFiles } from './attachmentFiles';
const props = defineProps<{ value: unknown }>();
const files = computed(() => attachmentFiles(props.value));
const imageUrls = computed(() => files.value.filter(file => file.image).map(file => file.cosUrl));
</script>
<style scoped>
.attachment-images{display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:4px 0;min-height:48px}
.attachment-thumbnail{width:48px;height:48px;flex:0 0 48px;border:1px solid var(--el-border-color-lighter);border-radius:4px;cursor:zoom-in;background:var(--el-fill-color-light)}
.attachment-images a{max-width:100%;overflow-wrap:anywhere;color:var(--el-color-primary)}
.image-error{font-size:11px;line-height:16px;color:var(--el-text-color-secondary);text-align:center}
.no-attachment{color:var(--el-text-color-placeholder)}
</style>
