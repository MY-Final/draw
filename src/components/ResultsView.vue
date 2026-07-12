<script setup>
// 中栏对话流:每条生成 = 用户请求气泡(右)+ AI 回复卡(左),左右明显错开。
import { computed, ref, watch, nextTick, onUnmounted } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AssetImage from './AssetImage.vue'
import AppIcon from './AppIcon.vue'
import { exportRecipe } from '../lib/share.js'
import { downloadBlob, downloadJson } from '../lib/download.js'

const store = useWorkbenchStore()
const emit = defineEmits(['use-as-reference', 'preview'])
const scroller = ref(null)

// 时间正序(旧→新);只显示当前会话。
const feed = computed(() => [...store.canvasGenerations].reverse())

function assetById(id) { return store.assets.find((a) => a.id === id) }
function outputsOf(gen) { return gen.outputImageIds.map(assetById).filter(Boolean) }
function refsOf(gen) { return (gen.refImageIds || []).map(assetById).filter(Boolean) }
function modelOf(gen) { return gen.params?.model || '模型' }

// ── 生成耗时:pending 轮实时跳秒、完成后定格(design D3)──
const nowTick = ref(Date.now())
let ticker = null
const hasPending = computed(() => feed.value.some((g) => g.status === 'pending'))
watch(hasPending, (on) => {
  if (on && !ticker) {
    nowTick.value = Date.now()
    ticker = setInterval(() => { nowTick.value = Date.now() }, 100)
  } else if (!on && ticker) {
    clearInterval(ticker); ticker = null
  }
}, { immediate: true })
onUnmounted(() => { if (ticker) clearInterval(ticker) })

// 返回该轮耗时文案(秒);pending 用实时差值,否则用落库的 elapsedMs。
function elapsedText(gen) {
  const ms = gen.status === 'pending'
    ? nowTick.value - gen.createdAt
    : (gen.elapsedMs ?? null)
  if (ms == null) return ''
  return (Math.max(0, ms) / 1000).toFixed(1) + 's'
}

async function shareRecipe(gen) { downloadJson(await exportRecipe(gen), `recipe-${gen.id}.json`) }
function downloadImage(a) {
  const ext = (a.mime.split('/')[1] || 'png').replace('jpeg', 'jpg')
  downloadBlob(a.blob, `${a.id}.${ext}`)
}

// 删除单条:延迟提交,给撤销窗口(design D3)。
const UNDO_MS = 5000
const undoToast = ref(null) // { genId, timer }
function deleteGen(gen) {
  const r = store.deleteGenerationSoft(gen.id, UNDO_MS)
  if (!r.ok) return
  if (undoToast.value) clearTimeout(undoToast.value.timer)
  const timer = setTimeout(() => { undoToast.value = null }, UNDO_MS)
  undoToast.value = { genId: gen.id, timer }
}
function undoDelete() {
  if (!undoToast.value) return
  store.undoDeleteGeneration(undoToast.value.genId)
  clearTimeout(undoToast.value.timer)
  undoToast.value = null
}

watch(() => [feed.value.length, store.generating], async () => {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
})
</script>

<template>
  <div class="feed" ref="scroller">
    <div class="feed-inner">
      <!-- 空状态 -->
      <div v-if="!feed.length && !store.generating" class="empty">
        <div class="empty-icon"><AppIcon name="sparkles" :size="26" /></div>
        <h1>画点什么?</h1>
        <p>在下方描述你想要的画面,回车即可生成。结果会自动存入本地素材库。</p>
      </div>

      <!-- 每条生成:请求气泡 + 回复卡 -->
      <div v-for="gen in feed" :key="gen.id" class="turn">
        <!-- 用户请求气泡(右) -->
        <div class="row row-user">
          <div class="bubble">
            <p class="bubble-text">{{ gen.prompt }}</p>
            <div v-if="refsOf(gen).length" class="bubble-refs">
              <div v-for="a in refsOf(gen)" :key="a.id" class="bubble-ref">
                <AssetImage :asset="a" alt="参考图" />
              </div>
              <span class="ref-hint">参考图</span>
            </div>
          </div>
          <div class="avatar avatar-user"><AppIcon name="settings" :size="15" /></div>
        </div>

        <!-- AI 回复卡(左) -->
        <div class="row row-ai">
          <div class="avatar avatar-ai"><AppIcon name="sparkles" :size="15" /></div>
          <div class="card">
            <div class="card-head">
              <span class="model">{{ modelOf(gen) }}</span>
              <span v-if="gen.status === 'success'" class="badge badge-ok"><AppIcon name="check" :size="11" /> 已完成</span>
              <span v-else-if="gen.status === 'failed'" class="badge badge-danger">失败</span>
              <span v-else-if="gen.status === 'empty'" class="badge badge-warn">无图片</span>
              <span v-else class="badge"><AppIcon name="refresh" :size="11" class="spin" /> {{ gen.statusMessage || '生成中' }}</span>
              <span v-if="elapsedText(gen)" class="elapsed tnum">{{ elapsedText(gen) }}</span>
            </div>

            <div v-if="gen.status === 'failed'" class="note note-danger">
              <AppIcon name="alert" :size="14" /> <span>{{ gen.error }}</span>
            </div>
            <div v-else-if="gen.status === 'empty'" class="note note-warn">
              <div>接口未返回可识别图片。<code class="snippet">{{ gen.rawResponseSnippet }}</code></div>
            </div>
            <!-- 生成中:本轮自身的骨架占位(不再有独立通用骨架) -->
            <div v-else-if="gen.status === 'pending'" class="skeleton" />

            <div v-if="outputsOf(gen).length" class="imgs" :class="{ single: outputsOf(gen).length === 1 }">
              <figure v-for="a in outputsOf(gen)" :key="a.id" class="fig">
                <button class="fig-img" @click="emit('preview', a)" aria-label="放大预览">
                  <AssetImage :asset="a" :alt="gen.prompt" />
                </button>
                <button
                  class="fav" :class="{ on: a.favorite }"
                  @click.stop="store.toggleAssetFavorite(a.id)"
                  :aria-label="a.favorite ? '取消收藏' : '收藏'"
                >
                  <AppIcon name="heart" :size="14" />
                </button>
              </figure>
            </div>

            <!-- 操作区(生成中不显示) -->
            <div v-if="gen.status !== 'pending'" class="actions">
              <button class="act" @click="emit('use-as-reference', outputsOf(gen)[0]?.id)" :disabled="!outputsOf(gen).length" title="继续创作(设为参考图)">
                <AppIcon name="layers" :size="14" /> 继续创作
              </button>
              <button class="act" @click="store.regenerate(gen.id)" :disabled="store.generating" title="重新生成">
                <AppIcon name="refresh" :size="14" /> 重新生成
              </button>
              <button class="act" @click="downloadImage(outputsOf(gen)[0])" :disabled="!outputsOf(gen).length" title="下载">
                <AppIcon name="download" :size="14" /> 下载
              </button>
              <button class="act" @click="shareRecipe(gen)" title="分享配方(不含 Key)">
                <AppIcon name="share" :size="14" /> 分享
              </button>
              <button class="act act-danger" @click="deleteGen(gen)" title="删除这条生成">
                <AppIcon name="trash" :size="14" /> 删除
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除撤销提示 -->
    <div v-if="undoToast" class="undo-toast" role="status" aria-live="polite">
      <span>已删除该条生成</span>
      <button class="undo-btn" @click="undoDelete">撤销</button>
    </div>
  </div>
</template>

<style scoped>
.feed { height: 100%; overflow-y: auto; }
.feed-inner { max-width: 820px; margin: 0 auto; padding: var(--space-6) var(--space-4) var(--space-8); display: flex; flex-direction: column; gap: var(--space-8); }

.empty { text-align: center; padding: 12vh 0; color: var(--color-fg-muted); display: flex; flex-direction: column; align-items: center; gap: var(--space-2); }
.empty-icon { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--color-surface-2); color: var(--color-primary); border: 1px solid var(--color-border); }
.empty h1 { margin: var(--space-3) 0 0; font-size: 22px; font-weight: 600; color: var(--color-fg); letter-spacing: -0.01em; }
.empty p { max-width: 360px; font-size: 13px; margin: 0; }

.turn { display: flex; flex-direction: column; gap: var(--space-4); }

/* 行:头像 + 内容。用户靠右,AI 靠左,明显错开 */
.row { display: flex; gap: var(--space-3); align-items: flex-start; }
.row-user { flex-direction: row; justify-content: flex-end; padding-left: 15%; }
.row-ai { justify-content: flex-start; padding-right: 12%; }

.avatar { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.avatar-user { background: var(--color-surface-2); color: var(--color-fg-muted); border: 1px solid var(--color-border); }
.avatar-ai { background: color-mix(in srgb, var(--color-primary) 16%, transparent); color: var(--color-primary); border: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent); }

/* 用户气泡:蓝色,右侧 */
.bubble { background: var(--color-primary); color: var(--color-on-primary); padding: var(--space-3) var(--space-4); border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg); max-width: 100%; }
.bubble-text { margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.bubble-refs { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); flex-wrap: wrap; }
.bubble-ref { width: 40px; height: 40px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid rgba(255,255,255,0.4); }
.ref-hint { font-size: 11px; opacity: 0.85; }

/* AI 回复卡:中性表面,左侧 */
.card { flex: 1; min-width: 0; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.card-head { display: flex; align-items: center; gap: var(--space-2); }
.model { font-size: 13px; font-weight: 600; color: var(--color-fg); }
.elapsed { margin-left: auto; font-size: 11px; color: var(--color-fg-subtle); }

.imgs { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-3); }
.imgs.single { grid-template-columns: minmax(0, 380px); }
.fig { margin: 0; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--color-border); background: var(--color-surface-2); position: relative; }
.fig-img { display: block; width: 100%; aspect-ratio: 1; padding: 0; }
.fav { position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(0,0,0,0.5); color: #fff; transition: color var(--dur) var(--ease), background var(--dur) var(--ease); }
.fav:hover { background: rgba(0,0,0,0.7); }
.fav.on { color: #f43f5e; }
.fav.on :deep(svg) { fill: #f43f5e; }

.actions { display: flex; flex-wrap: wrap; gap: var(--space-1); border-top: 1px solid var(--color-border); padding-top: var(--space-2); }
.act { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--color-fg-muted); padding: 6px 10px; border-radius: var(--radius-sm); transition: background var(--dur) var(--ease), color var(--dur) var(--ease); }
.act:hover:not(:disabled) { background: var(--color-surface-2); color: var(--color-fg); }
.act:disabled { opacity: 0.4; cursor: not-allowed; }
.act-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--color-destructive) 12%, transparent); color: var(--color-destructive); }

/* 删除撤销提示(固定于视口底部,抬高避开输入区) */
.undo-toast { position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%); z-index: 60; display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-radius: var(--radius); background: var(--color-elevated); border: 1px solid var(--color-border-strong); box-shadow: var(--shadow-2); font-size: 13px; color: var(--color-fg); }
.undo-btn { font-size: 13px; font-weight: 600; color: var(--color-primary); }
.undo-btn:hover { text-decoration: underline; }

.snippet { display: block; margin-top: 6px; font-size: 11px; max-height: 80px; overflow: auto; opacity: 0.8; white-space: pre-wrap; word-break: break-all; }
.skeleton { aspect-ratio: 1; max-width: 380px; border-radius: var(--radius); background: linear-gradient(90deg, var(--color-surface-2), var(--color-elevated), var(--color-surface-2)); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

@media (max-width: 1024px) {
  .row-user { padding-left: 8%; }
  .row-ai { padding-right: 6%; }
}
</style>
