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
import { MenuBar } from './components/MenuBar'
import { Resizer } from './components/Resizer'
import { UpdateButton } from './components/UpdateButton'
import { useFocusCycle } from './lib/use-focus-cycle'
import { Toaster } from './components/Toaster'
import { ConfirmDialog } from './components/ConfirmDialog'
import { AboutDialog } from './components/AboutDialog'

function App() {
  const init = useAppStore((s) => s.init)
  const dialogOpen = useAppStore((s) => s.dialogOpen)
  const moveDialog = useAppStore((s) => s.moveDialog)
  const publishDialog = useAppStore((s) => s.publishDialog)
  const importDialog = useAppStore((s) => s.importDialog)
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const sidebarVisible = useAppStore((s) => s.sidebarVisible)

  useFocusCycle()

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
      {moveDialog && <MoveMessagesDialog />}
      {publishDialog && <PublishMessageDialog />}
      <ConfirmDialog />
      <AboutDialog />
      <Toaster />
    </div>
  )
}

export default App
