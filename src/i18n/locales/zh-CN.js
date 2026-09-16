import composer from './parts/composer.js'
import results from './parts/results.js'
import library from './parts/library.js'
import presets from './parts/presets.js'
import backup from './parts/backup.js'
import search from './parts/search.js'
import lightbox from './parts/lightbox.js'
import dialogs from './parts/dialogs.js'
import lib from './parts/lib.js'

export default {
  app: {
    title: 'AI 绘画工作台',
    brand: '绘画工作台',
    brandSub: '本地 · 零后端',
    search: '搜索',
    openMenu: '打开菜单',
    closeMenu: '关闭菜单',
    nav: '导航',
    assetsLibrary: '素材库',
    openAssets: '打开素材库',
    collapseAssets: '收起素材库',
    expandAssets: '展开素材库',
    loading: '正在加载工作台',
    loadFailed: '本地数据加载失败',
    loadFailedDefault: '本地数据初始化失败，请重试。',
    retry: '重试',
    undo: {
      conversationOne: '已删除会话「{title}」',
      conversationMany: '已删除 {count} 段会话',
      assets: '已移除 {count} 张素材',
      workspace: '已删除工作区「{name}」',
    },
    recipeOverwriteTitle: '导入配方将覆盖当前输入',
    recipeOverwriteMessage: '当前输入框已有 prompt 或参考图，导入配方会覆盖它们。确定导入吗？',
    recipeOverwriteConfirm: '覆盖导入',
  },
  locale: {
    label: '语言',
    switch: '切换语言',
  },
  common: {
    cancel: '取消',
    delete: '删除',
    rename: '重命名',
    close: '关闭',
    confirm: '确认',
    workspaceActions: '工作区操作',
    conversationActions: '会话操作',
  },
  sidebar: {
    newCanvas: '新建创作',
    newConversation: '新创作',
    collapseWorkspace: '折叠工作区',
    expandWorkspace: '展开工作区',
    workspaceAria: '{name}工作区',
    draft: '草稿',
    deleteConversation: '删除会话',
    deleteConversationFailed: '删除会话失败：{message}',
    deleteWorkspaceFailed: '删除工作区失败：{message}',
    retryHint: '请重试',
    deleteConversationMessage: '将删除会话「{title}」及其全部生成记录。未收藏且未被引用的产出图会一并删除,此操作不可撤销。',
    deleteWorkspace: '删除工作区',
    deleteWorkspaceMessage: '将删除工作区「{name}」及其全部生成记录和素材（收藏的图片也会一并删除）。删除后 5 秒内可以撤销。',
    newWorkspace: '新建工作区',
    noConversations: '还没有会话。点上方「新建创作」开始。',
    noWorkspaces: '还没有工作区。新建一个工作区开始创作。',
    dataProtection: '数据保护',
    apiSettings: '接口设置',
    lightMode: '浅色模式',
    darkMode: '深色模式',
    github: '在 GitHub 打开',
  },
  dates: {
    today: '今天',
    yesterday: '昨天',
    thisMonthEarlier: '本月更早',
  },
  composer: composer.zh,
  results: results.zh,
  library: library.zh,
  presets: presets.zh,
  backup: backup.zh,
  search: search.zh,
  lightbox: lightbox.zh,
  dialogs: dialogs.zh,
  lib: lib.zh,
}
