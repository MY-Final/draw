import { defineStore } from 'pinia'
import {
  loadPresets, savePreset, deletePreset, getActivePresetId, setActivePresetId, clearAllKeys,
  PROTOCOL_IMAGES,
} from '../lib/presets.js'
import { listAssets, getAsset, deleteAssets, toggleFavorite, clearAllAssets, putAsset } from '../lib/assetRepo.js'
import { listGenerations, deleteGenerations, clearAllGenerations, updateGeneration } from '../lib/generationRepo.js'
import { runGeneration } from '../lib/generationService.js'
import { checkConnectivity } from '../lib/connectivity.js'
import { getStorageUsage } from '../lib/storageUsage.js'
import {
  deriveConversations, groupConversationsByDate, convIdOf,
  loadTitleOverrides, saveTitleOverrides,
} from '../lib/conversations.js'
import { collectDeletableOutputs, collectReferencedAssetIds } from '../lib/deletion.js'
import { getDB, newId, STORE_WORKSPACES, STORE_ASSETS } from '../lib/db.js'
import { listWorkspaces, createWorkspace as repoCreateWs, updateWorkspace, deleteWorkspace as repoDeleteWs } from '../lib/workspaceRepo.js'
import { migrateLegacyPrompts, savePrompts } from '../lib/promptLibrary.js'
import { checkReminder } from '../lib/backupReminder.js'

// 生成队列上限:图片生成很慢(30-120s),排太多只会让等待失控;满额后明确告知用户。
export const MAX_GENERATION_QUEUE = 5

export const useWorkbenchStore = defineStore('workbench', {
  state: () => ({
    presets: [],
    activePresetId: null,
    assets: [],
    generations: [],
    usage: null,
    generating: false,
    lastError: null,
    // 当前进行中的生成:用于取消(abort)与删除 pending 时中止网络请求。
    activeGeneration: null, // { genId, conversationId, workspaceId, controller, done }
    // 当前会话(新建创作 = 新会话)。会话只是视图分组,持久保留,可在左侧导航切回。
    conversationId: null,
    favoritesOnly: false,
    // 素材来源筛选:'all' | 'generated' | 'reference-uploaded' | 'imported'(与收藏筛选叠加)。
    assetSourceFilter: 'all',
    // 会话标题手动覆盖(design D4)。
    titleOverrides: {},
    // 单条删除的待落库定时器:genId -> { timer, record }(延迟提交,可撤销)。
    pendingDeletes: {},
    // 素材删除撤销批次:{ batchId, ids, records, timer, expiresAt }。
    // 素材在批次期间只从内存隐藏,IndexedDB 数据仍保留,以便撤销。
    pendingAssetDelete: null,
    // 生成队列:生成是单通道的(一次只跑一个请求),排队项要记住发起时的工作区/会话,
    // 否则用户切走上下文后,排队的结果会落到错误的会话里。
    generationQueue: [],
    // 会话删除撤销批次(可合并):{ batchId, entries:[{workspaceId, conversationId, title}], genIds, records, timer }。
    // 窗口期内只从内存移除,IndexedDB 数据保留,撤销即恢复。
    pendingConversationDelete: null,
    // 工作区删除撤销批次:窗口期内工作区从列表隐藏,IndexedDB 数据保留。
    pendingWorkspaceDelete: null,
    // 工作区状态
    workspaces: [],
    activeWorkspaceId: null,
    initialized: false,
  }),

  getters: {
    activePreset(state) {
      return state.presets.find((p) => p.id === state.activePresetId) || state.presets[0] || null
    },
    // 当前会话可见的生成(旧记录用 canvasId 回退,不丢失)。
    canvasGenerations(state) {
      if (!state.activeWorkspaceId || !state.conversationId) return []
      return state.generations.filter((g) =>
        g.workspaceId === state.activeWorkspaceId && convIdOf(g) === state.conversationId,
      )
    },
    // 派生的会话列表(供左侧导航)。手动重命名优先。
    conversations(state) {
      const generations = state.activeWorkspaceId
        ? state.generations.filter((g) => g.workspaceId === state.activeWorkspaceId)
        : []
      return deriveConversations(generations, state.titleOverrides)
    },
    conversationGroups() {
      return groupConversationsByDate(this.conversations)
    },
    // 素材库视图(可按收藏筛选)。
    visibleAssets(state) {
      return state.favoritesOnly ? state.assets.filter((a) => a.favorite) : state.assets
    },
    // 当前工作区对象。
    currentWorkspace(state) {
      return state.workspaces.find((w) => w.id === state.activeWorkspaceId) || null
    },
    // 当前工作区下的会话(继承 conversations 逻辑但加过滤)。
    workspaceConversations() {
      return this.conversations
    },
    workspaceConversationGroups() {
      return groupConversationsByDate(this.workspaceConversations)
    },
    // 当前工作区下的素材。
    workspaceAssets(state) {
      if (!state.activeWorkspaceId) return state.visibleAssets
      if (state.favoritesOnly) return state.assets.filter((a) => a.workspaceId === state.activeWorkspaceId && a.favorite)
      return state.assets.filter((a) => a.workspaceId === state.activeWorkspaceId)
    },
    // 当前工作区下的生成记录(generations 已按 createdAt 倒序,[0] 为最近一次)。
    workspaceGenerations(state) {
      if (!state.activeWorkspaceId) return []
      return state.generations.filter((g) => g.workspaceId === state.activeWorkspaceId)
    },
  },

  actions: {
    async init() {
      this.initialized = false
      this.presets = loadPresets()
      this.activePresetId = getActivePresetId() || this.presets[0]?.id || null
      this.titleOverrides = loadTitleOverrides()
      await this.refreshAll()
      await this.reconcileStalePending()
      await this.initWorkspaces()
      // 只恢复当前工作区内仍存在的会话，非法值回退到最近会话。
      const savedConversationId = localStorage.getItem('workbench.conversationId')
      const savedIsValid = savedConversationId
        && this.workspaceGenerations.some((g) => convIdOf(g) === savedConversationId)
      this.conversationId = savedIsValid
        ? savedConversationId
        : (convIdOf(this.workspaceGenerations[0]) || this.newConversationId())
      localStorage.setItem('workbench.conversationId', this.conversationId)
      this.initialized = true
    },

    newConversationId() {
      return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    },

    // 页面重载后旧请求已不可能继续:AbortController 与 fetch 都已随页面销毁。
    // 因此所有遗留 pending 都应立即收口,不能只处理已超过某个时长的记录，
    // 否则刚开始生成就刷新会留下永久 pending。
    async reconcileStalePending() {
      const now = Date.now()
      const stale = this.generations.filter((g) => g.status === 'pending')
      if (!stale.length) return
      await Promise.all(stale.map((g) => updateGeneration(g.id, {
        status: 'failed',
        error: '生成中断（页面已刷新）',
        elapsedMs: Math.max(0, now - g.createdAt),
      })))
      await this.refreshAll()
    },

    // 新建创作 = 开一段空白会话(非破坏:旧会话与图仍完整保留、可切回)。
    newConversation() {
      this.conversationId = this.newConversationId()
      localStorage.setItem('workbench.conversationId', this.conversationId)
      this.lastError = null
    },

    // 切到某段历史会话。
    switchConversation(id) {
      const valid = this.activeWorkspaceId
        && this.generations.some((g) => g.workspaceId === this.activeWorkspaceId && convIdOf(g) === id)
      if (!valid && id !== this.conversationId) return false
      this.conversationId = id
      localStorage.setItem('workbench.conversationId', id)
      this.lastError = null
      return true
    },

    // ── 工作区 ──
    // 初始化工作区,首次使用时执行迁移。
    async initWorkspaces() {
      const list = await listWorkspaces()
      if (list.length === 0) {
        // 首次运行:创建默认工作区,迁移存量数据。
        const db = await getDB()
        const ws = await repoCreateWs({ name: '我的工作区' })
        // 覆写 id 为固定 ws_default,便于引用。
        await db.delete(STORE_WORKSPACES, ws.id)
        const defaultWs = { ...ws, id: 'ws_default' }
        await db.put(STORE_WORKSPACES, defaultWs)

        // 迁移存量 generations
        const gens = await listGenerations()
        for (const g of gens) {
          if (!g.workspaceId) await updateGeneration(g.id, { workspaceId: 'ws_default' })
        }
        // 迁移存量 assets
        const assets = await listAssets()
        for (const a of assets) {
          if (!a.workspaceId) {
            const full = await getAsset(a.id)
            if (full?.blob) {
              await putAsset({ ...full, workspaceId: 'ws_default' })
            } else {
              await db.put(STORE_ASSETS, { ...a, workspaceId: 'ws_default' })
            }
          }
        }
        // 迁移 promptLibrary
        migrateLegacyPrompts('ws_default')

        this.workspaces = [defaultWs]
        this.activeWorkspaceId = 'ws_default'
        localStorage.setItem('workbench.activeWorkspaceId', 'ws_default')
        // 重新拉取(让 generations/assets 带上 workspaceId)
        await this.refreshAll()
      } else {
        this.workspaces = list
        const saved = localStorage.getItem('workbench.activeWorkspaceId')
        this.activeWorkspaceId = saved && list.some((w) => w.id === saved) ? saved : list[0].id
      }
    },

    async createWorkspace(name) {
      const ws = await repoCreateWs({ name: name || '未命名工作区' })
      this.workspaces = await listWorkspaces()
      await this.switchWorkspace(ws.id)
      return ws
    },

    async renameWorkspace(id, name) {
      const t = (name || '').trim()
      if (!t) return
      await updateWorkspace(id, { name: t })
      this.workspaces = await listWorkspaces()
    },

    // ── 删除工作区(带撤销窗口) ──
    // 工作区删除的破坏面最大(连收藏图一起删),所以和素材/会话一样先隐藏、后落库。
    async deleteWorkspaceWithUndo(id, delayMs = 5000) {
      if (this.workspaces.length <= 1) return { ok: false, reason: 'last' }
      const workspace = this.workspaces.find((w) => w.id === id)
      if (!workspace) return { ok: false, reason: 'missing' }
      // 同一时间只保留一个工作区撤销批次,避免「删两个工作区」时状态互相覆盖。
      if (this.pendingWorkspaceDelete) await this.commitWorkspaceDelete(this.pendingWorkspaceDelete.batchId)
      if (this.pendingAssetDelete) await this.commitAssetDelete(this.pendingAssetDelete.batchId)

      // 属于该工作区的进行中请求先收口,否则删完还会写回结果。
      if (this.activeGeneration?.workspaceId === id) await this.cancelAndWaitActiveGeneration()

      const genRecords = this.generations.filter((g) => g.workspaceId === id)
      const previousActiveWorkspaceId = this.activeWorkspaceId
      const previousConversationId = this.conversationId

      this.workspaces = this.workspaces.filter((w) => w.id !== id)
      this.generations = this.generations.filter((g) => g.workspaceId !== id)
      // 该工作区的排队任务随工作区一起作废,否则删完工作区还会继续往后写结果。
      this.generationQueue = this.generationQueue.filter((item) => item.workspaceId !== id)

      const wait = Math.max(0, Number(delayMs) || 0)
      const batchId = newId('ws-delete')
      const timer = setTimeout(() => { void this.commitWorkspaceDelete(batchId) }, wait)
      this.pendingWorkspaceDelete = {
        batchId,
        id,
        workspace,
        genRecords,
        previousActiveWorkspaceId,
        previousConversationId,
        timer,
        expiresAt: Date.now() + wait,
      }

      if (previousActiveWorkspaceId === id) {
        const next = this.workspaces[0]?.id
        if (next) await this.switchWorkspace(next)
      }
      return { ok: true, batchId, name: workspace.name, count: genRecords.length }
    },

    async undoWorkspaceDelete(batchId) {
      const pending = this.pendingWorkspaceDelete
      if (!pending || pending.batchId !== batchId) return false
      clearTimeout(pending.timer)
      this.pendingWorkspaceDelete = null
      this.workspaces = [pending.workspace, ...this.workspaces]
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      this.generations = [...this.generations, ...pending.genRecords]
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      // 撤销前如果正停在这个工作区,把用户带回原处,避免「撤销了却不知道去哪看」。
      if (pending.previousActiveWorkspaceId === pending.id) {
        await this.switchWorkspace(pending.id)
        if (pending.previousConversationId) this.switchConversation(pending.previousConversationId)
      }
      return true
    },

    async commitWorkspaceDelete(batchId) {
      const pending = this.pendingWorkspaceDelete
      if (!pending || pending.batchId !== batchId) return false
      clearTimeout(pending.timer)
      this.pendingWorkspaceDelete = null
      try {
        await this._commitWorkspaceCascade(pending.id, pending.genRecords.map((g) => g.id))
        return true
      } catch (error) {
        // 落库失败:把工作区放回去,并明确告知,避免「看起来删了其实还在」。
        this.workspaces = [pending.workspace, ...this.workspaces]
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        this.generations = [...this.generations, ...pending.genRecords]
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        this.lastError = `删除工作区失败：${error?.message || error}`
        await this.refreshAll().catch(() => {})
        return false
      }
    },

    // 立即删除(无撤销窗口):软删 + 直接提交,供程序化调用方复用同一套级联逻辑。
    async deleteWorkspace(id) {
      if (this.workspaces.length <= 1) return
      const result = await this.deleteWorkspaceWithUndo(id, 0)
      if (result?.batchId) await this.commitWorkspaceDelete(result.batchId)
    },

    // 级联:删该工作区下全部 generation + 可连带删除的产出图 + 未再被引用的素材。
    // 与确认框文案一致,避免只删元数据留下孤儿数据占空间。
    async _commitWorkspaceCascade(id, genIds) {
      // 清掉该工作区相关的软删定时器,直接提交
      for (const gid of genIds) {
        const p = this.pendingDeletes[gid]
        if (p) {
          clearTimeout(p.timer)
          const { [gid]: _d, ...rest } = this.pendingDeletes
          this.pendingDeletes = rest
        }
      }

      // 引用感知删产出图
      if (genIds.length) {
        await this._deleteGensAndOrphans(genIds, this.generations)
      }

      // 该工作区下剩余素材(上传参考图、导入图等,可能不在任何 generation 产出里)
      // 删 workspaceId 匹配、且未被其他工作区 generation 引用的;收藏也随工作区删(确认框写"全部素材")。
      const remainingAssets = this.assets.filter((a) => a.workspaceId === id)
      if (remainingAssets.length) {
        const otherGens = this.generations.filter((g) => g.workspaceId !== id)
        const stillReferenced = new Set(collectReferencedAssetIds({
          assetIds: remainingAssets.map((a) => a.id),
          generations: otherGens,
        }))
        const favoritesToo = remainingAssets
          .filter((a) => !stillReferenced.has(a.id))
          .map((a) => a.id)
        if (favoritesToo.length) await deleteAssets(favoritesToo)
      }

      // 清该工作区的 prompt 模板
      try { savePrompts([], id) } catch { /* ignore */ }

      await repoDeleteWs(id)
      this.workspaces = await listWorkspaces()
      await this.refreshAll()
    },

    // 切换工作区(刷新中间和右侧视图)。
    async switchWorkspace(id) {
      if (!this.workspaces.some((workspace) => workspace.id === id)) return false
      if (id === this.activeWorkspaceId) return
      this.activeWorkspaceId = id
      localStorage.setItem('workbench.activeWorkspaceId', id)
      // 重置会话:找该工作区最近的会话,无则新建。
      const wsGens = this.generations.filter((g) => g.workspaceId === id)
      const last = wsGens.length ? convIdOf(wsGens[0]) : null
      this.conversationId = last || this.newConversationId()
      localStorage.setItem('workbench.conversationId', this.conversationId)
      this.lastError = null
      return true
    },

    async refreshAll() {
      const [assets, generations, usage] = await Promise.all([
        listAssets(), listGenerations(), getStorageUsage(),
      ])
      const pendingIds = new Set(this.pendingAssetDelete?.ids || [])
      this.assets = assets.filter((asset) => !pendingIds.has(asset.id))
      // 待撤销的会话:库里还在,但界面上必须保持「已删除」,否则一次刷新就会把它带回列表。
      const pendingConv = new Set((this.pendingConversationDelete?.entries || [])
        .map((entry) => `${entry.workspaceId}::${entry.conversationId}`))
      this.generations = pendingConv.size
        ? generations.filter((g) => !pendingConv.has(`${g.workspaceId}::${convIdOf(g)}`))
        : generations
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
    async cancelAndWaitActiveGeneration() {
      const active = this.activeGeneration
      if (!active) return
      this.cancelActiveGeneration()
      try { await active.done } catch { /* generate 已负责落失败态/清理孤儿图 */ }
    },

    cancelActiveGeneration() {
      const ag = this.activeGeneration
      if (!ag) return
      try { ag.controller.abort() } catch { /* ignore */ }
    },

    // context 允许队列把结果写回「发起排队时」的工作区/会话,而不是当前正在看的上下文。
    async generate({ prompt, fullPrompt, refImageIds = [], params = {} }, context = null) {
      if (!this.activePreset) {
        this.lastError = '请先添加并选择一个接口预设。'
        return { ok: false }
      }
      if (!this.activePreset.apiKey) {
        this.lastError = '当前接口缺少 API Key,请先在接口设置中填写。'
        return { ok: false }
      }
      if (this.generating) {
        this.lastError = '已有生成进行中,请等待完成或取消后再试。'
        return { ok: false }
      }
      this.generating = true
      this.lastError = null
      const workspaceId = context?.workspaceId ?? this.activeWorkspaceId
      const conversationId = context?.conversationId ?? this.conversationId
      const controller = new AbortController()
      let resolveDone
      const done = new Promise((resolve) => { resolveDone = resolve })
      this.activeGeneration = {
        genId: null,
        conversationId,
        workspaceId,
        controller,
        done,
      }
      try {
        // 把当前会话 id 和 workspace id 记进这次生成。
        const gen = await runGeneration({
          preset: this.activePreset, prompt, refImageIds,
          fullPrompt: fullPrompt || prompt,
          params: { ...params, conversationId },
          workspaceId,
          signal: controller.signal,
          // 乐观上屏:pending 记录落库后立即插入内存,请求瞬间可见。
          onPending: (pending) => {
            if (this.activeGeneration) this.activeGeneration.genId = pending.id
            if (!this.generations.some((g) => g.id === pending.id)) {
              this.generations = [pending, ...this.generations]
            }
          },
        })
        await this.refreshAll()
        if (gen?.cancelled || gen?.error === '已取消') {
          return { ok: false, cancelled: true, generation: gen }
        }
        if (gen.status === 'empty') {
          this.lastError = '接口返回了内容,但未能识别出图片(已保留响应片段供诊断)。'
        }
        return { ok: gen.status === 'success', generation: gen }
      } catch (e) {
        // abort 已在 generationService 内消化;这里只处理真正的失败
        if (e?.name === 'AbortError' || controller.signal.aborted) {
          await this.refreshAll()
          return { ok: false, cancelled: true }
        }
        this.lastError = String(e?.message || e)
        await this.refreshAll()
        return { ok: false, error: this.lastError }
      } finally {
        resolveDone()
        this.generating = false
        this.activeGeneration = null
        // 队列自动续跑:刻意不 await,避免把调用方挂在下一单任务上。
        void this.processGenerationQueue()
      }
    },

    // ── 生成队列 ──
    // 排队只发生在「已有任务在跑」时;空闲提交仍走 generate(),保持原有即时反馈。
    enqueueGeneration(payload) {
      if (!this.activePreset) return { ok: false, reason: 'no-preset' }
      if (!this.activePreset.apiKey) return { ok: false, reason: 'no-key' }
      const text = String(payload?.prompt || '').trim()
      if (!text) return { ok: false, reason: 'empty-prompt' }
      if (this.generationQueue.length >= MAX_GENERATION_QUEUE) {
        return { ok: false, reason: 'full', max: MAX_GENERATION_QUEUE }
      }
      const item = {
        id: newId('queue'),
        prompt: text,
        fullPrompt: payload.fullPrompt || text,
        refImageIds: [...(payload.refImageIds || [])],
        params: { ...(payload.params || {}) },
        workspaceId: this.activeWorkspaceId,
        conversationId: this.conversationId,
        createdAt: Date.now(),
      }
      this.generationQueue = [...this.generationQueue, item]
      return { ok: true, item, position: this.generationQueue.length }
    },

    removeQueuedGeneration(id) {
      const before = this.generationQueue.length
      this.generationQueue = this.generationQueue.filter((item) => item.id !== id)
      return this.generationQueue.length !== before
    },

    // 把某一项提到最前,让它成为下一单开跑的任务。
    promoteQueuedGeneration(id) {
      const item = this.generationQueue.find((q) => q.id === id)
      if (!item) return false
      this.generationQueue = [item, ...this.generationQueue.filter((q) => q.id !== id)]
      return true
    },

    clearGenerationQueue() {
      this.generationQueue = []
    },

    async processGenerationQueue() {
      if (this.generating) return
      const [next, ...rest] = this.generationQueue
      if (!next) return
      this.generationQueue = rest
      await this.generate(
        {
          prompt: next.prompt,
          fullPrompt: next.fullPrompt,
          refImageIds: next.refImageIds,
          params: next.params,
        },
        { workspaceId: next.workspaceId, conversationId: next.conversationId },
      )
    },

    // 重新生成:复制某条生成的入参,起一次新事件(落当前会话)。
    async regenerate(genId) {
      const g = this.generations.find((x) => x.id === genId)
      if (!g || (this.activeWorkspaceId && g.workspaceId !== this.activeWorkspaceId)) return { ok: false }
      return this.generate({
        prompt: g.prompt,
        fullPrompt: g.fullPrompt,
        refImageIds: [...(g.refImageIds || [])],
        params: {
          size: g.params?.size,
          ratio: g.params?.ratio,
          resolution: g.params?.resolution,
          quality: g.params?.quality,
          n: g.params?.n,
        },
      })
    },

    // 编辑历史消息时保留原记录，创建一条新的生成事件。
    async editPromptAndRegenerate(genId, text) {
      const t = (text || '').trim()
      const g = this.generations.find((x) => x.id === genId)
      if (!g || (this.activeWorkspaceId && g.workspaceId !== this.activeWorkspaceId) || !t || this.generating) return { ok: false }
      return this.generate({
        prompt: t,
        fullPrompt: t,
        refImageIds: [...(g.refImageIds || [])],
        params: {
          size: g.params?.size,
          ratio: g.params?.ratio,
          resolution: g.params?.resolution,
          quality: g.params?.quality,
          n: g.params?.n,
        },
      })
    },

    clearLastError() {
      this.lastError = null
    },

    // ── 删除单条生成(延迟提交,可撤销)──
    // 立即从内存移除并暂存记录;窗口结束才真正落库删除 + 连带删图。
    // 若是进行中的生成:先 abort,再软删(取消后不会再落孤儿图)。
    deleteGenerationSoft(genId, delayMs = 5000) {
      // 进行中 → 取消网络请求
      if (this.activeGeneration?.genId === genId) {
        this.cancelActiveGeneration()
      }
      const idx = this.generations.findIndex((x) => x.id === genId)
      if (idx < 0) return { ok: false }
      if (this.activeWorkspaceId && this.generations[idx].workspaceId !== this.activeWorkspaceId) return { ok: false }
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
      try {
        await this._deleteGensAndOrphans([genId], full)
        await this.refreshAll()
      } catch (error) {
        this.lastError = `删除生成失败：${error?.message || error}`
        await this.refreshAll().catch(() => {})
      }
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

    // ── 删除整段会话(带撤销窗口)──
    // 立即从界面移除并暂存记录,窗口结束才落库删记录 + 连带删图。
    // 与「删除单条生成」「删除素材」保持同一套 5 秒撤销语义。
    async deleteConversationWithUndo(id, delayMs = 5000) {
      if (!id) return { ok: false }
      const targetWorkspaceId = this.activeWorkspaceId
        || this.activeGeneration?.workspaceId
        || this.generations.find((g) => convIdOf(g) === id)?.workspaceId
      let records = this.generations.filter((g) => g.workspaceId === targetWorkspaceId && convIdOf(g) === id)
      // 删除包含活跃生成的会话时先中止并等待；随后重新取列表，覆盖 pending 刚落库的窗口。
      if (this.activeGeneration?.conversationId === id
        || (this.activeGeneration && records.some((g) => g.id === this.activeGeneration.genId))) {
        await this.cancelAndWaitActiveGeneration()
        records = this.generations.filter((g) => g.workspaceId === targetWorkspaceId && convIdOf(g) === id)
      }
      // 该会话排队中的任务一并作废
      this.generationQueue = this.generationQueue.filter(
        (item) => !(item.workspaceId === targetWorkspaceId && item.conversationId === id),
      )

      const title = this.titleOverrides[id]
        || records[0]?.prompt?.slice(0, 24)
        || '新创作'

      // 空会话(草稿)没有记录要删,直接切走即可,不必给一个假的撤销窗口。
      if (!records.length) {
        this._removeConversationTitleOverride(id)
        this._leaveDeletedConversation(id, targetWorkspaceId)
        return { ok: true, batchId: null, genIds: [], empty: true }
      }

      const genIds = records.map((g) => g.id)
      this.generations = this.generations.filter((g) => !genIds.includes(g.id))

      const current = this.pendingConversationDelete
      if (current?.timer) clearTimeout(current.timer)
      const entries = [...(current?.entries || [])]
      if (!entries.some((e) => e.conversationId === id && e.workspaceId === targetWorkspaceId)) {
        entries.push({ workspaceId: targetWorkspaceId, conversationId: id, title })
      }
      const batchId = current?.batchId || newId('conv-delete')
      const mergedRecords = [...(current?.records || []), ...records]
      const mergedGenIds = [...(current?.genIds || []), ...genIds]
      const wait = Math.max(0, Number(delayMs) || 0)
      const timer = setTimeout(() => { void this.commitConversationDelete(batchId) }, wait)
      this.pendingConversationDelete = {
        batchId,
        entries,
        genIds: mergedGenIds,
        records: mergedRecords,
        timer,
        expiresAt: Date.now() + wait,
      }
      this._removeConversationTitleOverride(id)
      if (this.conversationId === id) this._leaveDeletedConversation(id, targetWorkspaceId)
      return { ok: true, batchId, genIds, count: records.length, title }
    },

    _removeConversationTitleOverride(id) {
      if (!this.titleOverrides[id]) return
      const { [id]: _drop, ...rest } = this.titleOverrides
      this.titleOverrides = rest
      saveTitleOverrides(this.titleOverrides)
    },

    // 删掉当前会话后,切到该工作区最近的其他会话;没有就新建空会话。
    _leaveDeletedConversation(deletedId, workspaceId) {
      if (this.conversationId !== deletedId) return
      if (workspaceId && workspaceId !== this.activeWorkspaceId) return
      const next = this.generations
        .filter((g) => g.workspaceId === this.activeWorkspaceId)
        .map((g) => convIdOf(g))
        .find((cid) => cid && cid !== deletedId)
      if (next) this.switchConversation(next)
      else this.newConversation()
    },

    undoConversationDelete(batchId) {
      const pending = this.pendingConversationDelete
      if (!pending || pending.batchId !== batchId) return false
      clearTimeout(pending.timer)
      this.pendingConversationDelete = null
      // 记录回填后按 createdAt 倒序,与 listGenerations 的顺序保持一致。
      this.generations = [...this.generations, ...pending.records]
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      return true
    },

    async commitConversationDelete(batchId) {
      const pending = this.pendingConversationDelete
      if (!pending || pending.batchId !== batchId) return false
      clearTimeout(pending.timer)
      this.pendingConversationDelete = null
      try {
        await this._deleteGensAndOrphans(pending.genIds, [...pending.records, ...this.generations])
        await this.refreshAll()
        return true
      } catch (error) {
        // 落库失败就把记录放回去,不能让用户以为删掉了、数据却还在(或反之)。
        this.generations = [...this.generations, ...pending.records]
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        this.lastError = `删除会话失败：${error?.message || error}`
        await this.refreshAll().catch(() => {})
        return false
      }
    },

    // ── 删除整段会话(立即,连带删图)──
    // 走同一条软删逻辑,只是把窗口压成 0 并立刻提交,避免两套实现漂移。
    async deleteConversation(id) {
      const result = await this.deleteConversationWithUndo(id, 0)
      if (result?.batchId) await this.commitConversationDelete(result.batchId)
      return result
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
      // 清空期间若仍有请求，先中止并等待其清理完成，防止与 clear 交错后又写回。
      await this.cancelAndWaitActiveGeneration()
      // 先落库任何待删项,避免定时器残留
      for (const id of Object.keys(this.pendingDeletes)) clearTimeout(this.pendingDeletes[id].timer)
      this.pendingDeletes = {}
      if (this.pendingAssetDelete) clearTimeout(this.pendingAssetDelete.timer)
      this.pendingAssetDelete = null
      if (this.pendingConversationDelete) clearTimeout(this.pendingConversationDelete.timer)
      this.pendingConversationDelete = null
      if (this.pendingWorkspaceDelete) clearTimeout(this.pendingWorkspaceDelete.timer)
      this.pendingWorkspaceDelete = null
      this.generationQueue = []
      await clearAllGenerations()
      await clearAllAssets()
      this.titleOverrides = {}
      saveTitleOverrides({})
      await this.refreshAll()
      this.newConversation()
    },

    // 仅清理本机图片,保留生成记录 / Prompt / 工作区 / 接口配置。
    // 先收口进行中的生成,避免清空后请求完成又写入新图片。
    async clearStoredImages() {
      await this.cancelAndWaitActiveGeneration()
      if (this.pendingAssetDelete) clearTimeout(this.pendingAssetDelete.timer)
      this.pendingAssetDelete = null
      await clearAllAssets()
      await this.refreshAll()
    },

    // ── 素材 ──
    // 落库一张参考图并刷新响应式 assets(供上传/粘贴使用:putAsset 只写 DB,
    // 不刷新 store.assets 会导致 refAssets 找不到新图 → 缩略图不显示)。
    async addReferenceAsset(file) {
      const asset = await putAsset({ blob: file, mime: file.type, name: file.name, source: 'reference-uploaded', workspaceId: this.activeWorkspaceId })
      await this.refreshAll()
      // listAssets 只返回元数据，但刚粘贴/上传的图片已经在内存中可用。
      // 保留这份 Blob 让参考图立即显示，避免等待下一次 IndexedDB 读取时出现空缩略图。
      this.assets = this.assets.map((item) => item.id === asset.id ? { ...item, blob: asset.blob } : item)
      return asset
    },
    _assetRemovalCandidates(ids) {
      const uniqueIds = [...new Set(ids)].filter((id) => {
        if (!id) return false
        const asset = this.assets.find((item) => item.id === id)
        return !this.activeWorkspaceId || asset?.workspaceId === this.activeWorkspaceId
      })
      // 生成记录/会话软删期间,记录仍在 IndexedDB 里引用素材,所以也必须阻止素材删除。
      const pendingGenerations = [
        ...Object.values(this.pendingDeletes).map((item) => item.record),
        ...(this.pendingConversationDelete?.records || []),
        ...(this.pendingWorkspaceDelete?.genRecords || []),
      ].filter(Boolean)
      const generations = [
        ...this.generations,
        ...pendingGenerations.filter((record) => !this.generations.some((g) => g.id === record.id)),
      ]
      const blockedIds = collectReferencedAssetIds({ assetIds: uniqueIds, generations })
      const blocked = new Set(blockedIds)
      return {
        uniqueIds,
        blockedIds,
        deletableIds: uniqueIds.filter((id) => !blocked.has(id)),
      }
    },
    // 兼容数据保护和已有调用方的立即删除入口。
    async removeAssets(ids) {
      const { blockedIds, deletableIds } = this._assetRemovalCandidates(ids)
      if (deletableIds.length) await deleteAssets(deletableIds)
      await this.refreshAll()
      return { deletedIds: deletableIds, blockedIds }
    },
    // 素材软删:界面立即隐藏,5 秒后才从 IndexedDB 的两个 object store 一起删除。
    // 同一时间窗口内的连续删除复用同一个 batchId,并重置倒计时。
    async removeAssetsWithUndo(ids, delayMs = 5000) {
      const { blockedIds, deletableIds } = this._assetRemovalCandidates(ids)
      if (!deletableIds.length) {
        await this.refreshAll()
        return { deletedIds: [], blockedIds, batchId: null }
      }

      const current = this.pendingAssetDelete
      if (current?.committing) {
        await this.commitAssetDelete(current.batchId)
      }
      const activeBatch = this.pendingAssetDelete
      const newRecords = deletableIds
        .map((id) => this.assets.find((asset) => asset.id === id))
        .filter(Boolean)
      const existingIds = new Set(activeBatch?.ids || [])
      const mergedIds = [...(activeBatch?.ids || []), ...deletableIds.filter((id) => !existingIds.has(id))]
      const mergedRecords = [...(activeBatch?.records || []), ...newRecords]
      const batchId = activeBatch?.batchId || newId('asset-delete')
      if (activeBatch?.timer) clearTimeout(activeBatch.timer)

      // 先更新内存,再刷新用量和列表;refreshAll 会再次过滤同一批次 id。
      this.assets = this.assets.filter((asset) => !deletableIds.includes(asset.id))
      const expiresAt = Date.now() + Math.max(0, Number(delayMs) || 0)
      const timer = setTimeout(() => { void this.commitAssetDelete(batchId) }, Math.max(0, Number(delayMs) || 0))
      this.pendingAssetDelete = {
        batchId,
        ids: mergedIds,
        records: mergedRecords,
        timer,
        expiresAt,
        committing: false,
      }
      await this.refreshAll()
      return { deletedIds: deletableIds, blockedIds, batchId }
    },
    // 撤销只恢复内存列表;数据库元数据和 Blob 在整个窗口内都未删除。
    async undoAssetDelete(batchId) {
      const pending = this.pendingAssetDelete
      if (!pending || pending.batchId !== batchId) return false
      clearTimeout(pending.timer)
      this.pendingAssetDelete = null
      this.assets = [...this.assets, ...pending.records]
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      return true
    },
    // 撤销窗口结束后事务删除 assets 与 assetBlobs,失败时重新显示素材并保留错误提示。
    async commitAssetDelete(batchId) {
      const pending = this.pendingAssetDelete
      if (!pending || pending.batchId !== batchId) return false
      clearTimeout(pending.timer)
      this.pendingAssetDelete = { ...pending, committing: true }
      try {
        await deleteAssets(pending.ids)
        if (this.pendingAssetDelete?.batchId === batchId) this.pendingAssetDelete = null
        await this.refreshAll()
        return true
      } catch (error) {
        if (this.pendingAssetDelete?.batchId === batchId) this.pendingAssetDelete = null
        this.lastError = `删除素材失败：${error?.message || error}`
        await this.refreshAll().catch(() => {})
        return false
      }
    },
    async toggleAssetFavorite(id) {
      await toggleFavorite(id)
      await this.refreshAll()
    },
    setFavoritesOnly(v) {
      this.favoritesOnly = v
    },
    setAssetSourceFilter(v) {
      this.assetSourceFilter = v
    },

    // ── 备份提醒 ──
    async checkBackupReminder() {
      const usage = await getStorageUsage()
      this.usage = usage
      return checkReminder(usage.businessBytes)
    },

    defaultProtocolLabel() {
      return PROTOCOL_IMAGES
    },
  },
})
