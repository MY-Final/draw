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
    title: 'AI Drawing Workbench',
    brand: 'Drawing Workbench',
    brandSub: 'Local · No backend',
    search: 'Search',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    nav: 'Navigation',
    assetsLibrary: 'Library',
    openAssets: 'Open library',
    collapseAssets: 'Collapse library',
    expandAssets: 'Expand library',
    loading: 'Loading workbench',
    loadFailed: 'Failed to load local data',
    loadFailedDefault: 'Local data failed to initialize. Please retry.',
    retry: 'Retry',
    undo: {
      conversationOne: 'Deleted conversation “{title}”',
      conversationMany: 'Deleted {count} conversations',
      assets: 'Removed {count} asset(s)',
      workspace: 'Deleted workspace “{name}”',
    },
    recipeOverwriteTitle: 'Importing a recipe will overwrite your input',
    recipeOverwriteMessage: 'The composer already has a prompt or reference images. Importing a recipe will replace them. Continue?',
    recipeOverwriteConfirm: 'Overwrite & import',
  },
  locale: {
    label: 'Language',
    switch: 'Switch language',
  },
  common: {
    cancel: 'Cancel',
    delete: 'Delete',
    rename: 'Rename',
    close: 'Close',
    confirm: 'Confirm',
    workspaceActions: 'Workspace actions',
    conversationActions: 'Conversation actions',
  },
  sidebar: {
    newCanvas: 'New creation',
    newConversation: 'New chat',
    collapseWorkspace: 'Collapse workspace',
    expandWorkspace: 'Expand workspace',
    workspaceAria: '{name} workspace',
    draft: 'Draft',
    deleteConversation: 'Delete conversation',
    deleteConversationFailed: 'Failed to delete conversation: {message}',
    deleteWorkspaceFailed: 'Failed to delete workspace: {message}',
    retryHint: 'please retry',
    deleteConversationMessage: 'This deletes “{title}” and all of its generations. Unfavorited, unreferenced output images are removed too. This cannot be undone.',
    deleteWorkspace: 'Delete workspace',
    deleteWorkspaceMessage: 'This deletes “{name}” and all of its generations and assets (favorited images included). You can undo within 5 seconds.',
    newWorkspace: 'New workspace',
    noConversations: 'No conversations yet. Click “New creation” above to start.',
    noWorkspaces: 'No workspaces yet. Create one to start drawing.',
    dataProtection: 'Data & backup',
    apiSettings: 'Endpoint settings',
    lightMode: 'Light mode',
    darkMode: 'Dark mode',
    github: 'Open on GitHub',
    guide: 'Guide',
  },
  dates: {
    today: 'Today',
    yesterday: 'Yesterday',
    thisMonthEarlier: 'Earlier this month',
  },
  composer: composer.en,
  results: results.en,
  library: library.en,
  presets: presets.en,
  backup: backup.en,
  search: search.en,
  lightbox: lightbox.en,
  dialogs: dialogs.en,
  lib: lib.en,
}
