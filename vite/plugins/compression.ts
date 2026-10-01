import { promises as fs } from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import type { Plugin, ResolvedConfig } from 'vite';

const gzip = promisify(zlib.gzip);
const brotliCompress = promisify(zlib.brotliCompress);
const compressibleFileRE = /\.(js|mjs|json|css|html)$/i;
const defaultThreshold = 1025;

type CompressionKind = 'gzip' | 'brotli';

const compressionHandlers: Record<CompressionKind, { ext: string; compress: (content: Buffer) => Promise<Buffer> }> = {
  gzip: {
    ext: '.gz',
    compress: content => gzip(content, { level: zlib.constants.Z_BEST_COMPRESSION })
  },
  brotli: {
    ext: '.br',
    compress: content =>
      brotliCompress(content, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
          [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT
        }
      })
  }
};

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(fullPath);
      }
      return compressibleFileRE.test(entry.name) ? [fullPath] : [];
    })
  );
  return files.flat();
}

function createCompressionPlugin(kind: CompressionKind): Plugin {
  const handler = compressionHandlers[kind];
  let config: ResolvedConfig | undefined;
  let running = false;

  /**
   * rolldown 版的 vite 可能在校验阶段就触发 closeBundle（此时资源尚未落盘），
   * 因此压缩挂在 writeBundle 上，closeBundle 仅作兜底，并对目录未就绪做等待与降级。
   */
  async function run(): Promise<void> {
    if (running) {
      return;
    }
    running = true;
    try {
      const outputDir = path.resolve(process.cwd(), config?.build.outDir ?? 'dist');
      for (let attempt = 0; attempt < 40 && !(await pathExists(outputDir)); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!(await pathExists(outputDir))) {
        config?.logger.warn(`\n[compression:${kind}] 已跳过：找不到输出目录 ${outputDir}`);
        return;
      }
      const files = await collectFiles(outputDir);
      const compressedEntries: Array<{ file: string; originalKb: string; compressedKb: string }> = [];

      await Promise.all(
        files.map(async filePath => {
          const stat = await fs.stat(filePath);
          if (stat.size < defaultThreshold) {
            return;
          }

          const content = await fs.readFile(filePath);
          const compressed = await handler.compress(content);
          const outputFile = `${filePath}${handler.ext}`;

          await fs.writeFile(outputFile, compressed);
          compressedEntries.push({
            file: path.relative(outputDir, outputFile).replaceAll('\\', '/'),
            originalKb: (stat.size / 1024).toFixed(2),
            compressedKb: (compressed.byteLength / 1024).toFixed(2)
          });
        })
      );

      if (!compressedEntries.length) {
        return;
      }

      compressedEntries.sort((a, b) => a.file.localeCompare(b.file));
      config?.logger.info(`\n[compression:${kind}] generated ${compressedEntries.length} files`);
      for (const entry of compressedEntries) {
        config?.logger.info(
          `${path.basename(outputDir)}/${entry.file} ${entry.originalKb}kb -> ${entry.compressedKb}kb`
        );
      }
      config?.logger.info('');
    } catch (error) {
      // 预压缩只是优化，失败不应中断构建。
      config?.logger.warn(
        `\n[compression:${kind}] 压缩失败已跳过：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {
    name: `local:compression:${kind}`,
    apply: 'build',
    enforce: 'post',
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    async writeBundle() {
      await run();
    },
    async closeBundle() {
      await run();
    }
  };
}

export default (env: Record<string, string>) => {
  const { VITE_BUILD_COMPRESS } = env;
  const plugins: Plugin[] = [];
  if (!VITE_BUILD_COMPRESS) {
    return plugins;
  }

  const compressionList = VITE_BUILD_COMPRESS.split(',').map(item => item.trim()) as CompressionKind[];
  if (compressionList.includes('gzip')) {
    plugins.push(createCompressionPlugin('gzip'));
  }
  if (compressionList.includes('brotli')) {
    plugins.push(createCompressionPlugin('brotli'));
  }
  return plugins;
};
