import { defineStore } from 'pinia'
import {
  loadPresets, savePreset, deletePreset, getActivePresetId, setActivePresetId, clearAllKeys,
  PROTOCOL_IMAGES,
} from '../lib/presets.js'
import { listAssets, deleteAssets, toggleFavorite, clearAllAssets } from '../lib/assetRepo.js'
import { listGenerations, deleteGenerations, clearAllGenerations } from '../lib/generationRepo.js'
import { runGeneration } from '../lib/generationService.js'
import { checkConnectivity } from '../lib/connectivity.js'
import { getStorageUsage } from '../lib/storageUsage.js'
import {
  deriveConversations, groupConversationsByDate, convIdOf,
  loadTitleOverrides, saveTitleOverrides,
} from '../lib/conversations.js'
import { collectDeletableOutputs } from '../lib/deletion.js'

export const useWorkbenchStore = defineStore('workbench', {
  state: () => ({
    presets: [],
    activePresetId: null,
    assets: [],
    generations: [],
    usage: null,
    generating: false,
    lastError: null,
    // 当前会话(新建创作 = 新会话)。会话只是视图分组,持久保留,可在左侧导航切回。
    conversationId: null,
    favoritesOnly: false,
    // 会话标题手动覆盖(design D4)。
    titleOverrides: {},
    // 单条删除的待落库定时器:genId -> { timer, record }(延迟提交,可撤销)。
    pendingDeletes: {},
  }),

  getters: {
    activePreset(state) {
      return state.presets.find((p) => p.id === state.activePresetId) || state.presets[0] || null
    },
    isChatProtocol() {
      return this.activePreset?.protocol === 'chat'
    },
    // 当前会话可见的生成(旧记录用 canvasId 回退,不丢失)。
    canvasGenerations(state) {
      if (!state.conversationId) return state.generations
      return state.generations.filter((g) => convIdOf(g) === state.conversationId)
    },
    // 派生的会话列表(供左侧导航)。手动重命名优先。
    conversations(state) {
      return deriveConversations(state.generations, state.titleOverrides)
    },
    conversationGroups() {
      return groupConversationsByDate(this.conversations)
    },
    // 素材库视图(可按收藏筛选)。
    visibleAssets(state) {
      return state.favoritesOnly ? state.assets.filter((a) => a.favorite) : state.assets
    },
  },

  actions: {
    async init() {
      this.presets = loadPresets()
      this.activePresetId = getActivePresetId() || this.presets[0]?.id || null
      this.titleOverrides = loadTitleOverrides()
      await this.refreshAll()
      // 恢复上次会话;没有则挂到最近一次生成的会话,再没有就新开一个。
      if (!this.conversationId) {
        this.conversationId = localStorage.getItem('workbench.conversationId')
          || convIdOf(this.generations[0])
          || this.newConversationId()
      }
    },

    newConversationId() {
      return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    },

    // 新建创作 = 开一段空白会话(非破坏:旧会话与图仍完整保留、可切回)。
    newConversation() {
      this.conversationId = this.newConversationId()
      localStorage.setItem('workbench.conversationId', this.conversationId)
      this.lastError = null
    },

    // 切到某段历史会话。
    switchConversation(id) {
      this.conversationId = id
      localStorage.setItem('workbench.conversationId', id)
      this.lastError = null
    },

    async refreshAll() {
      const [assets, generations, usage] = await Promise.all([
        listAssets(), listGenerations(), getStorageUsage(),
      ])
      this.assets = assets
      this.generations = generations
      this.usage = usage
    },

    // ── 预设 ──
    upsertPreset(preset) {
      const saved = savePreset(preset)
      this.presets = loadPresets()
      if (!this.activePresetId) this.selectPreset(saved.id)
      return saved
    },
    removePreset(id) {
      deletePreset(id)
      this.presets = loadPresets()
      this.activePresetId = getActivePresetId() || this.presets[0]?.id || null
    },
    selectPreset(id) {
      setActivePresetId(id)
      this.activePresetId = id
    },
    clearKeys() {
      clearAllKeys()
      this.presets = loadPresets()
    },
    async testConnection(preset) {
      return checkConnectivity(preset || this.activePreset)
    },

    // ── 生成 ──
    async generate({ prompt, fullPrompt, refImageIds = [], params = {} }) {
      if (!this.activePreset) {
        this.lastError = '请先在左侧添加并选择一个接口预设。'
        return { ok: false }
      }
      this.generating = true
      this.lastError = null
      try {
        // 把当前会话 id 记进这次生成,供会话视图分组与导航。
        const gen = await runGeneration({
          preset: this.activePreset, prompt, refImageIds,
          fullPrompt: fullPrompt || prompt, // quality 追加后的完整 prompt
          params: { ...params, conversationId: this.conversationId },
          params: { ...params, conversationId: this.conversationId },
          // 乐观上屏:pending 记录落库后立即插入内存,请求瞬间可见(请求即时上屏)。
          onPending: (pending) => {
            if (!this.generations.some((g) => g.id === pending.id)) {
              this.generations = [pending, ...this.generations]
            }
          },
        })
        await this.refreshAll()
        if (gen.status === 'empty') {
          this.lastError = '接口返回了内容,但未能识别出图片(已保留响应片段供诊断)。'
        }
        return { ok: gen.status === 'success', generation: gen }
      } catch (e) {
        this.lastError = String(e?.message || e)
        await this.refreshAll()
        return { ok: false, error: this.lastError }
      } finally {
        this.generating = false
      }
    },

    // 重新生成:复制某条生成的入参,起一次新事件(落当前会话)。
    async regenerate(genId) {
      const g = this.generations.find((x) => x.id === genId)
      if (!g) return { ok: false }
      return this.generate({
        prompt: g.prompt,
        fullPrompt: g.fullPrompt,
        refImageIds: [...(g.refImageIds || [])],
        params: { size: g.params?.size, ratio: g.params?.ratio, resolution: g.params?.resolution, n: g.params?.n },
      })
    },

    // ── 删除单条生成(延迟提交,可撤销)──
    // 立即从内存移除并暂存记录;窗口结束才真正落库删除 + 连带删图。
    deleteGenerationSoft(genId, delayMs = 5000) {
      const idx = this.generations.findIndex((x) => x.id === genId)
      if (idx < 0) return { ok: false }
      const [record] = this.generations.splice(idx, 1)
      const timer = setTimeout(() => { this.commitDelete(genId) }, delayMs)
      this.pendingDeletes = { ...this.pendingDeletes, [genId]: { timer, record } }
      return { ok: true }
    },

    // 撤销:清定时器 + 恢复内存条目,不触碰素材。
    undoDeleteGeneration(genId) {
      const p = this.pendingDeletes[genId]
      if (!p) return
      clearTimeout(p.timer)
      // 恢复到列表并按 createdAt 倒序(与 listGenerations 一致)
      this.generations = [...this.generations, p.record].sort((a, b) => b.createdAt - a.createdAt)
      const { [genId]: _drop, ...rest } = this.pendingDeletes
      this.pendingDeletes = rest
    },

    // 落库删除:删记录 + 按引用感知规则连带删产出图。
    async commitDelete(genId) {
      const p = this.pendingDeletes[genId]
      const { [genId]: _drop, ...rest } = this.pendingDeletes
      this.pendingDeletes = rest
      // 连带删图:候选来自被删记录的产出图,需连全量(含已从内存移除的)判定。
      // 用被删记录 + 当前存活记录组成全量集合。
      const full = p?.record ? [p.record, ...this.generations] : this.generations
      await this._deleteGensAndOrphans([genId], full)
      await this.refreshAll()
    },

    // 内部:删除一批 generation 及其可连带删除的产出图。
    //   fullGenerations:用于引用判定的全量集合(默认取 store.generations)。
    async _deleteGensAndOrphans(genIds, fullGenerations = null) {
      const all = fullGenerations || this.generations
      const deletable = collectDeletableOutputs({
        deletingGenIds: genIds,
        generations: all,
        assets: this.assets,
      })
      await deleteGenerations(genIds)
      if (deletable.length) await deleteAssets(deletable)
    },

    // ── 删除整段会话(立即,连带删图)──
    async deleteConversation(id) {
      const ids = this.generations.filter((g) => convIdOf(g) === id).map((g) => g.id)
      await this._deleteGensAndOrphans(ids)
      // 清除该会话的标题覆盖
      if (this.titleOverrides[id]) {
        const { [id]: _drop, ...rest } = this.titleOverrides
        this.titleOverrides = rest
        saveTitleOverrides(this.titleOverrides)
      }
      await this.refreshAll()
      // 若删的是当前会话,切到最近的其他会话;无则新建空会话
      if (this.conversationId === id) {
        const next = this.conversations[0]?.id
        if (next) this.switchConversation(next)
        else this.newConversation()
      }
    },

    // ── 重命名会话 ──
    renameConversation(id, title) {
      const t = (title || '').trim()
      if (t) this.titleOverrides = { ...this.titleOverrides, [id]: t }
      else { const { [id]: _drop, ...rest } = this.titleOverrides; this.titleOverrides = rest }
      saveTitleOverrides(this.titleOverrides)
    },

    // ── 清空全部(删所有生成 + 素材,保留预设/Key)──
    async resetWorkbench() {
      // 先落库任何待删项,避免定时器残留
      for (const id of Object.keys(this.pendingDeletes)) clearTimeout(this.pendingDeletes[id].timer)
      this.pendingDeletes = {}
      await clearAllGenerations()
      await clearAllAssets()
      this.titleOverrides = {}
      saveTitleOverrides({})
      await this.refreshAll()
      this.newConversation()
    },

    // ── 素材 ──
    async removeAssets(ids) {
      await deleteAssets(ids)
      await this.refreshAll()
    },
    async toggleAssetFavorite(id) {
      await toggleFavorite(id)
      await this.refreshAll()
    },
    setFavoritesOnly(v) {
      this.favoritesOnly = v
    },

    defaultProtocolLabel() {
      return PROTOCOL_IMAGES
    },
  },
})
