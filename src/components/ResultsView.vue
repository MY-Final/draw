<script setup>
// 中栏对话流:每条生成 = 用户请求气泡(右)+ AI 回复卡(左),左右明显错开。
import { computed, ref, watch, nextTick, onUnmounted } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AssetImage from './AssetImage.vue'
import AppIcon from './AppIcon.vue'
import { exportRecipe } from '../lib/share.js'
import { downloadBlob, downloadJson } from '../lib/download.js'

const store = useWorkbenchStore()
const emit = defineEmits(['use-as-reference', 'preview', 'reuse', 'open-settings'])
const scroller = ref(null)
// 用户主动上翻时不抢滚动;仅贴近底部才跟滚。
const stickToBottom = ref(true)
const NEAR_BOTTOM_PX = 120
// 空状态快捷键文案按平台
const searchModKey = (() => {
  if (typeof navigator === 'undefined') return 'Ctrl'
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '') ? '⌘' : 'Ctrl'
})()

// 时间正序(旧→新);只显示当前会话。
const feed = computed(() => [...store.canvasGenerations].reverse())

function assetById(id) { return store.assets.find((a) => a.id === id) }
function outputsOf(gen) { return gen.outputImageIds.map(assetById).filter(Boolean) }
function refsOf(gen) { return (gen.refImageIds || []).map(assetById).filter(Boolean) }
function modelOf(gen) { return gen.params?.model || '模型' }
function qualityOf(gen) {
  const q = gen.params?.quality
  if (q === 'medium') return '中'
  if (q === 'low') return '低'
  if (q === 'high') return '高'
  return ''
}
function isSettingsError(msg) {
  return /API Key|接口|预设|Key|401|403|Unauthorized|鉴权|认证/i.test(String(msg || ''))
}

// 把这条的 prompt/参数/参考图填回输入框,方便改画质后再发。
function reuseInComposer(gen) {
  emit('reuse', {
    prompt: gen.prompt || '',
    refImageIds: [...(gen.refImageIds || [])],
    params: {
      size: gen.params?.size,
      ratio: gen.params?.ratio,
      resolution: gen.params?.resolution,
      quality: gen.params?.quality,
      n: gen.params?.n,
    },
  })
}

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

// 多图时记住每轮「当前图」(hover / 点击选中);操作作用在当前图而非永远第一张。
const focusByGen = ref({}) // genId -> assetId
function focusAsset(genId, assetId) {
  focusByGen.value = { ...focusByGen.value, [genId]: assetId }
}
function activeOutput(gen) {
  const outs = outputsOf(gen)
  if (!outs.length) return null
  const fid = focusByGen.value[gen.id]
  return outs.find((a) => a.id === fid) || outs[0]
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

function onFeedScroll() {
  const el = scroller.value
  if (!el) return
  const dist = el.scrollHeight - el.scrollTop - el.clientHeight
  stickToBottom.value = dist <= NEAR_BOTTOM_PX
}

watch(() => [feed.value.length, store.generating, hasPending.value], async () => {
  if (!stickToBottom.value) return
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
})
</script>

<template>
  <div class="feed" ref="scroller" @scroll.passive="onFeedScroll">
    <div class="feed-inner">
      <!-- 空状态 -->
      <div v-if="!feed.length && !store.generating" class="empty">
        <div class="empty-icon"><AppIcon name="sparkles" :size="26" /></div>
        <h1>画点什么?</h1>
        <p>在下方描述你想要的画面，回车即可生成。结果会自动存入本地素材库。</p>
        <div class="empty-hints">
          <span class="empty-chip"><AppIcon name="image" :size="12" /> 可拖入参考图</span>
          <span class="empty-chip"><AppIcon name="keyboard" :size="12" /> Enter 生成</span>
          <span class="empty-chip"><AppIcon name="search" :size="12" /> {{ searchModKey }}K 搜索</span>
        </div>
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
          <div class="avatar avatar-user"><AppIcon name="user" :size="15" /></div>
        </div>

        <!-- AI 回复卡(左) -->
        <div class="row row-ai">
          <div class="avatar avatar-ai"><AppIcon name="sparkles" :size="15" /></div>
          <div class="card">
            <div class="card-head">
              <span class="model">{{ modelOf(gen) }}</span>
              <span v-if="qualityOf(gen)" class="badge-soft tnum" :title="'画质 ' + qualityOf(gen)">{{ qualityOf(gen) }}</span>
              <span v-if="gen.status === 'success'" class="badge badge-ok"><AppIcon name="check" :size="11" /> 已完成</span>
              <span v-else-if="gen.status === 'failed'" class="badge badge-danger">失败</span>
              <span v-else-if="gen.status === 'empty'" class="badge badge-warn">无图片</span>
              <span v-else class="badge"><AppIcon name="refresh" :size="11" class="spin" /> {{ gen.statusMessage || '生成中' }}</span>
              <span v-if="elapsedText(gen)" class="elapsed tnum">{{ elapsedText(gen) }}</span>
            </div>

            <div v-if="gen.status === 'failed'" class="note note-danger">
              <AppIcon name="alert" :size="14" />
              <span class="note-text">{{ gen.error }}</span>
              <button
                v-if="isSettingsError(gen.error)"
                type="button"
                class="note-action"
                @click="emit('open-settings')"
              >去设置</button>
            </div>
            <div v-else-if="gen.status === 'empty'" class="note note-warn">
              <div>接口未返回可识别图片。<code class="snippet">{{ gen.rawResponseSnippet }}</code></div>
            </div>
            <!-- 生成中:本轮自身的骨架占位 + 取消 -->
            <div v-else-if="gen.status === 'pending'" class="pending-block">
              <div class="skeleton" />
              <div class="pending-actions">
                <button
                  v-if="store.activeGeneration?.genId === gen.id"
                  class="pending-del act"
                  @click="store.cancelActiveGeneration()"
                  title="取消本次生成"
                >
                  <AppIcon name="x" :size="13" /> 取消
                </button>
                <button class="pending-del act act-danger" @click="deleteGen(gen)" title="删除这条卡住的生成">
                  <AppIcon name="trash" :size="13" /> 卡住了?删除
                </button>
              </div>
            </div>

            <div v-if="outputsOf(gen).length" class="imgs" :class="{ single: outputsOf(gen).length === 1 }">
              <figure
                v-for="a in outputsOf(gen)" :key="a.id"
                class="fig" :class="{ focused: activeOutput(gen)?.id === a.id && outputsOf(gen).length > 1 }"
                @mouseenter="focusAsset(gen.id, a.id)"
                @focusin="focusAsset(gen.id, a.id)"
              >
                <button class="fig-img" @click="focusAsset(gen.id, a.id); emit('preview', a)" aria-label="放大预览">
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

            <!-- 操作区(生成中不显示);多图时作用在当前聚焦图 -->
            <div v-if="gen.status !== 'pending'" class="actions">
              <button
                class="act"
                @click="emit('use-as-reference', activeOutput(gen)?.id)"
                :disabled="!activeOutput(gen)"
                :title="outputsOf(gen).length > 1 ? '继续创作(当前选中图)' : '继续创作(设为参考图)'"
              >
                <AppIcon name="layers" :size="14" /> 继续创作
              </button>
              <button class="act" @click="store.regenerate(gen.id)" :disabled="store.generating" title="按原参数再跑一次">
                <AppIcon name="refresh" :size="14" /> 重新生成
              </button>
              <button class="act" @click="reuseInComposer(gen)" title="填回输入框,可改画质/比例后再生成">
                <AppIcon name="message" :size="14" /> 填入输入框
              </button>
              <button
                class="act"
                @click="downloadImage(activeOutput(gen))"
                :disabled="!activeOutput(gen)"
                :title="outputsOf(gen).length > 1 ? '下载当前选中图' : '下载'"
              >
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
.feed { height: 100%; overflow-y: auto; scroll-behavior: smooth; }
.feed-inner {
  max-width: 860px; margin: 0 auto;
  padding: var(--space-6) var(--space-4) var(--space-8);
  display: flex; flex-direction: column; gap: var(--space-8);
}

.empty {
  text-align: center; padding: 14vh 0 8vh; color: var(--color-fg-muted);
  display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
}
.empty-icon {
  width: 64px; height: 64px; border-radius: 20px;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-on-primary);
  background: linear-gradient(145deg, var(--color-primary-hover), var(--color-primary));
  box-shadow: 0 12px 32px color-mix(in srgb, var(--color-primary) 28%, transparent);
}
.empty h1 {
  margin: var(--space-3) 0 0; font-size: 26px; font-weight: 650;
  color: var(--color-fg); letter-spacing: -0.02em;
}
.empty p { max-width: 380px; font-size: 13.5px; margin: 0; line-height: 1.6; }
.empty-hints { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: var(--space-3); }
.empty-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 10px; border-radius: 999px; font-size: 11px;
  color: var(--color-fg-muted); border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 80%, transparent);
}

.turn {
  display: flex; flex-direction: column; gap: var(--space-4);
  animation: turn-in 280ms var(--ease-out);
}
@keyframes turn-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

/* 行:头像 + 内容。用户靠右,AI 靠左,明显错开 */
.row { display: flex; gap: var(--space-3); align-items: flex-start; }
.row-user { flex-direction: row; justify-content: flex-end; padding-left: 15%; }
.row-ai { justify-content: flex-start; padding-right: 12%; }

.avatar {
  width: 32px; height: 32px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.avatar-user {
  background: var(--color-surface-2); color: var(--color-fg-muted);
  border: 1px solid var(--color-border);
}
.avatar-ai {
  background: linear-gradient(145deg, color-mix(in srgb, var(--color-primary) 28%, transparent), color-mix(in srgb, var(--color-primary) 12%, transparent));
  color: var(--color-primary);
  border: 1px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 8%, transparent);
}

/* 用户气泡 */
.bubble {
  background: linear-gradient(160deg, color-mix(in srgb, var(--color-primary) 92%, #fff), var(--color-primary));
  color: var(--color-on-primary);
  padding: var(--space-3) var(--space-4);
  border-radius: 18px 18px 6px 18px;
  max-width: 100%;
  box-shadow: 0 8px 22px color-mix(in srgb, var(--color-primary) 22%, transparent);
}
.bubble-text { margin: 0; font-size: 14px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.bubble-refs { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); flex-wrap: wrap; }
.bubble-ref { width: 42px; height: 42px; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.35); }
.ref-hint { font-size: 11px; opacity: 0.85; }

/* AI 回复卡 */
.card {
  flex: 1; min-width: 0;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  border: 1px solid var(--color-border);
  border-radius: 8px 18px 18px 18px;
  padding: var(--space-4);
  display: flex; flex-direction: column; gap: var(--space-3);
  box-shadow: var(--shadow-1);
  backdrop-filter: blur(8px);
}
.card-head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.model { font-size: 13px; font-weight: 600; color: var(--color-fg); }
.badge-soft {
  font-size: 11px; font-weight: 550; color: var(--color-fg-muted);
  padding: 2px 8px; border-radius: 999px;
  background: var(--color-surface-2); border: 1px solid var(--color-border);
}
.elapsed { margin-left: auto; font-size: 11px; color: var(--color-fg-subtle); }
.note-danger, .note-warn {
  display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap;
}
.note-text { flex: 1; min-width: 0; line-height: 1.45; }
.note-action {
  flex-shrink: 0; font-size: 12px; font-weight: 650;
  color: var(--color-destructive); padding: 4px 10px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-destructive) 30%, transparent);
  background: color-mix(in srgb, var(--color-destructive) 8%, transparent);
}
.note-action:hover { background: color-mix(in srgb, var(--color-destructive) 14%, transparent); }

.imgs { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-3); align-items: start; }
.imgs.single { grid-template-columns: minmax(0, 420px); }
.fig {
  margin: 0; border-radius: 14px; overflow: hidden;
  border: 1px solid var(--color-border); background: var(--color-surface-2);
  position: relative; transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.fig:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 28px rgba(0,0,0,0.22);
}
.fig.focused {
  outline: 2px solid color-mix(in srgb, var(--color-primary) 55%, transparent);
  outline-offset: 2px;
}
/* 结果图按真实宽高比显示;过高时封顶 */
.fig-img { display: block; width: 100%; padding: 0; }
.fig-img :deep(.asset-img) { height: auto; max-height: 70vh; object-fit: contain; }
.fav {
  position: absolute; top: 10px; right: 10px; width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center; border-radius: 50%;
  background: rgba(0,0,0,0.48); color: #fff; backdrop-filter: blur(6px);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease), transform var(--dur) var(--ease);
  opacity: 0;
}
.fig:hover .fav, .fig.focused .fav, .fav.on { opacity: 1; }
/* 触屏无 hover:常显收藏按钮,避免摸不到 */
@media (hover: none) {
  .fav { opacity: 0.92; }
}
.fav:hover { background: rgba(0,0,0,0.7); transform: scale(1.05); }
.fav.on { color: var(--color-heart); }
.fav.on :deep(svg) { fill: var(--color-heart); }

.actions {
  display: flex; flex-wrap: wrap; gap: 4px;
  border-top: 1px solid var(--color-border); padding-top: var(--space-2);
}
.act {
  display: inline-flex; align-items: center; gap: 5px; font-size: 12px;
  color: var(--color-fg-muted); padding: 7px 11px; border-radius: 999px;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.act:hover:not(:disabled) { background: var(--color-surface-2); color: var(--color-fg); }
.act:disabled { opacity: 0.4; cursor: not-allowed; }
.act-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-destructive) 12%, transparent);
  color: var(--color-destructive);
}

/* 删除撤销提示 */
.undo-toast {
  position: fixed; bottom: 128px; left: 50%; transform: translateX(-50%); z-index: 60;
  display: flex; align-items: center; gap: var(--space-3);
  padding: 12px 16px; border-radius: 999px;
  background: var(--color-elevated); border: 1px solid var(--color-border-strong);
  box-shadow: var(--shadow-2); font-size: 13px; color: var(--color-fg);
  backdrop-filter: blur(10px);
}
.undo-btn { font-size: 13px; font-weight: 650; color: var(--color-primary); padding: 4px 8px; border-radius: 999px; }
.undo-btn:hover { background: var(--color-primary-soft); }

.snippet { display: block; margin-top: 6px; font-size: 11px; max-height: 80px; overflow: auto; opacity: 0.8; white-space: pre-wrap; word-break: break-all; }
.skeleton {
  aspect-ratio: 1; max-width: 380px; border-radius: 14px;
  background: linear-gradient(90deg, var(--color-surface-2), var(--color-elevated), var(--color-surface-2));
  background-size: 200% 100%; animation: shimmer 1.4s infinite;
  border: 1px solid var(--color-border);
}
.pending-block { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
.pending-actions { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.pending-del { align-self: flex-start; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

@media (max-width: 1024px) {
  .row-user { padding-left: 4%; }
  .row-ai { padding-right: 2%; }
  .feed-inner { padding-left: var(--space-3); padding-right: var(--space-3); }
  .avatar { display: none; }
}
</style>
