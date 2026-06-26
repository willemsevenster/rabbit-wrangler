import { useEffect } from 'react'
import { useAppStore } from './store/app-store'
import { ActivityBar } from './components/ActivityBar'
import { SideBar } from './components/SideBar'
import { EditorArea } from './components/EditorArea'
import { StatusBar } from './components/StatusBar'
import { ConnectionDialog } from './components/ConnectionDialog'
import { ImportConnectionsDialog } from './components/ImportConnectionsDialog'
import { MoveMessagesDialog } from './components/MoveMessagesDialog'
import { PublishMessageDialog } from './components/PublishMessageDialog'
import { CreateQueueDialog } from './components/CreateQueueDialog'
import { DeleteQueueDialog } from './components/DeleteQueueDialog'
import { CreateExchangeDialog } from './components/CreateExchangeDialog'
import { AddBindingDialog } from './components/AddBindingDialog'
import { PolicyDialog } from './components/PolicyDialog'
import { MenuBar } from './components/MenuBar'
import { Resizer } from './components/Resizer'
import { UpdateButton } from './components/UpdateButton'
import { useFocusCycle } from './lib/use-focus-cycle'
import { useTabCycle } from './lib/use-tab-cycle'
import { useSearchHotkey } from './lib/use-search-hotkey'
import { SearchDialog } from './components/SearchDialog'
import { Toaster } from './components/Toaster'
import { ConfirmDialog } from './components/ConfirmDialog'
import { AboutDialog } from './components/AboutDialog'
import { SettingsDialog } from './components/SettingsDialog'

function App() {
  const init = useAppStore((s) => s.init)
  const dialogOpen = useAppStore((s) => s.dialogOpen)
  const moveDialog = useAppStore((s) => s.moveDialog)
  const publishDialog = useAppStore((s) => s.publishDialog)
  const createQueueDialog = useAppStore((s) => s.createQueueDialog)
  const deleteQueueDialog = useAppStore((s) => s.deleteQueueDialog)
  const createExchangeDialog = useAppStore((s) => s.createExchangeDialog)
  const bindingDialog = useAppStore((s) => s.bindingDialog)
  const policyDialog = useAppStore((s) => s.policyDialog)
  const importDialog = useAppStore((s) => s.importDialog)
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const sidebarVisible = useAppStore((s) => s.sidebarVisible)

  useFocusCycle()
  useTabCycle()
  useSearchHotkey()

  useEffect(() => {
    void init()
  }, [init])

  const columns = `48px ${sidebarVisible ? sidebarWidth : 0}px 1fr`

  return (
    <div className="app-shell">
      <div className="titlebar">
        <div className="titlebar__left">
          <span className="titlebar__icon">🐰</span>
          <MenuBar />
          <UpdateButton />
        </div>
        <span className="titlebar__title">Rabbit Wrangler</span>
      </div>
      <div className="app-body" style={{ gridTemplateColumns: columns }}>
        <ActivityBar />
        {sidebarVisible ? <SideBar /> : <div />}
        <EditorArea />
        {sidebarVisible && <Resizer />}
      </div>
      <StatusBar />
      {dialogOpen && <ConnectionDialog />}
      {importDialog && <ImportConnectionsDialog />}
      {/* Mounted before move/confirm dialogs so those stack on top when opened from search. */}
      <SearchDialog />
      {moveDialog && <MoveMessagesDialog />}
      {publishDialog && <PublishMessageDialog />}
      {createQueueDialog && <CreateQueueDialog />}
      {deleteQueueDialog && <DeleteQueueDialog />}
      {createExchangeDialog && <CreateExchangeDialog />}
      {bindingDialog && <AddBindingDialog />}
      {policyDialog && <PolicyDialog />}
      <ConfirmDialog />
      <AboutDialog />
      <SettingsDialog />
      <Toaster />
    </div>
  )
}

export default App
