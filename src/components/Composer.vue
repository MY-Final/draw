<script setup>
// 底部固定输入区(composer,对话式布局)。prompt + 内联参数 + 参考图 chips + 生成。
import { ref, computed } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AppIcon from './AppIcon.vue'
import AssetImage from './AssetImage.vue'

const store = useWorkbenchStore()

const prompt = ref('')
const size = ref('1024x1024')
const n = ref(1)
const refImageIds = ref([])
const showParams = ref(false)

const isChat = computed(() => store.isChatProtocol)
// 参考图现在两种协议都支持(images 走 edits 改图)。多张时 images 只用第一张。
const refAssets = computed(() =>
  refImageIds.value.map((id) => store.assets.find((a) => a.id === id)).filter(Boolean)
)
const multiRefOnImages = computed(() => !isChat.value && refImageIds.value.length > 1)

function addReference(id) {
  if (!refImageIds.value.includes(id)) refImageIds.value = [...refImageIds.value, id]
}
function removeReference(id) {
  refImageIds.value = refImageIds.value.filter((x) => x !== id)
}
function applyPrefill(prefill) {
  if (!prefill) return
  prompt.value = prefill.prompt || ''
  if (prefill.params?.size) size.value = prefill.params.size
  if (prefill.params?.n) n.value = prefill.params.n
  refImageIds.value = Array.isArray(prefill.refImageIds) ? [...prefill.refImageIds] : []
}
function clear() {
  prompt.value = ''
  refImageIds.value = []
}
defineExpose({ addReference, applyPrefill, clear })

async function submit() {
  if (!prompt.value.trim() || store.generating || !store.activePreset) return
  const text = prompt.value.trim()
  const refs = [...refImageIds.value]
  // 立即清空输入:乐观上屏已把本轮请求推上对话流,输入框无需等生成完成(请求即时上屏)。
  clear()
  await store.generate({ prompt: text, refImageIds: refs, params: { size: size.value, n: Number(n.value) } })
}

// Enter 提交,但要避开中文输入法候选确认(isComposing 期间的 Enter 不算提交)。
function onEnter(e) {
  if (e.isComposing || e.keyCode === 229) return
  e.preventDefault()
  submit()
}

function autogrow(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}
</script>

<template>
  <div class="composer-wrap">
    <!-- 无接口时的引导条 -->
    <div v-if="!store.activePreset" class="hint">
      <AppIcon name="alert" :size="14" /> 还没有可用接口 —— 点左侧「设置」添加一个,即可开始。
    </div>

    <!-- 参考图 chips(两种协议均可;images 走 edits 改图) -->
    <div v-if="refAssets.length" class="ref-strip">
      <div v-for="a in refAssets" :key="a.id" class="ref-thumb">
        <AssetImage :asset="a" alt="参考图" />
        <button class="ref-remove" @click="removeReference(a.id)" aria-label="移除参考图">
          <AppIcon name="x" :size="11" />
        </button>
      </div>
      <span class="ref-tip">{{ multiRefOnImages ? '参考图(images 仅用第一张)' : '参考图' }}</span>
    </div>

    <!-- 主输入框 -->
    <div class="composer" :class="{ disabled: !store.activePreset }">
      <textarea
        v-model="prompt" rows="1" class="composer-input"
        :placeholder="isChat ? '描述你想画的,或把图设为参考再改图…' : '描述你想画的,或把图设为参考改图…'"
        @input="autogrow"
        @keydown.enter.exact="onEnter"
        @keydown.shift.enter.stop
      />

      <div class="composer-bar">
        <!-- 参数(折叠,默认收起,保持干净) -->
        <button class="chip" @click="showParams = !showParams" :aria-expanded="showParams">
          <AppIcon name="settings" :size="13" /> {{ size }} · ×{{ n }}
        </button>
        <div v-if="showParams" class="params-pop">
          <label>尺寸
            <select v-model="size">
              <option>1024x1024</option><option>1024x1792</option>
              <option>1792x1024</option><option>512x512</option>
            </select>
          </label>
          <label>数量
            <input class="tnum" type="number" min="1" max="4" v-model="n" />
          </label>
        </div>

        <span v-if="!isChat" class="proto-tip">images 协议 · 改图</span>
        <span v-else class="proto-tip">chat 协议 · 可参考图</span>

        <div class="spacer" />

        <button
          class="btn btn-primary send"
          :disabled="store.generating || !prompt.trim() || !store.activePreset"
          @click="submit" aria-label="生成图片"
        >
          <AppIcon :name="store.generating ? 'refresh' : 'sparkles'" :size="16" :class="{ spin: store.generating }" />
          {{ store.generating ? '生成中' : '生成' }}
        </button>
      </div>
    </div>
    <p class="composer-foot">Enter 生成 · Shift+Enter 换行</p>
  </div>
</template>

<style scoped>
.composer-wrap { width: 100%; max-width: 760px; margin: 0 auto; }
.hint { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-warning); margin-bottom: var(--space-2); }

.ref-strip { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); flex-wrap: wrap; }
.ref-thumb { position: relative; width: 44px; height: 44px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--color-border-strong); }
.ref-remove { position: absolute; top: 1px; right: 1px; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.65); color: #fff; border-radius: 999px; }
.ref-tip { font-size: 11px; color: var(--color-fg-subtle); }

.composer {
  background: var(--color-surface); border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-xl); padding: var(--space-3) var(--space-3) var(--space-2);
  box-shadow: var(--shadow-2); transition: border-color var(--dur) var(--ease);
}
.composer:focus-within { border-color: var(--color-primary); }
.composer.disabled { opacity: 0.7; }
.composer-input {
  border: none; background: transparent; padding: var(--space-1) var(--space-2);
  font-size: 15px; max-height: 200px; overflow-y: auto;
}
.composer-input:focus { outline: none; }

.composer-bar { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-1); position: relative; }
.chip {
  display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--color-fg-muted);
  padding: 4px 10px; border-radius: 999px; border: 1px solid var(--color-border);
  transition: background var(--dur) var(--ease);
}
.chip:hover { background: var(--color-surface-2); }
.params-pop {
  position: absolute; bottom: 40px; left: 0; z-index: 20;
  display: flex; gap: var(--space-3); padding: var(--space-3);
  background: var(--color-elevated); border: 1px solid var(--color-border-strong);
  border-radius: var(--radius); box-shadow: var(--shadow-2);
}
.params-pop label { font-size: 11px; display: flex; flex-direction: column; gap: 4px; }
.params-pop select, .params-pop input { min-width: 90px; }
.proto-tip { font-size: 11px; color: var(--color-fg-subtle); }
.spacer { flex: 1; }
.send { border-radius: 999px; min-height: 38px; padding: 0 var(--space-5); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.composer-foot { text-align: center; font-size: 11px; color: var(--color-fg-subtle); margin: var(--space-2) 0 0; }
</style>
