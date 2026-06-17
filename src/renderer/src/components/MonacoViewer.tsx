import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import { useAppStore } from '../store/app-store'

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment
  }
}

// Monaco language services run in web workers; point it at the Vite-bundled ones.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new jsonWorker()
    return new editorWorker()
  }
}

/** Read-only Monaco editor for viewing a message payload. */
export function MonacoViewer({ value, language }: { value: string; language: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const theme = useAppStore((s) => s.theme)
  const monacoTheme = theme === 'light' ? 'vs' : 'vs-dark'

  // Create once.
  useEffect(() => {
    if (!hostRef.current) return
    const editor = monaco.editor.create(hostRef.current, {
      value,
      language,
      readOnly: true,
      theme: monacoTheme,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      fontSize: 12,
      lineNumbers: 'on',
      renderLineHighlight: 'none',
      padding: { top: 8, bottom: 8 }
    })
    editorRef.current = editor
    return () => editor.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update content / language reactively.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (editor.getValue() !== value) editor.setValue(value)
    const model = editor.getModel()
    if (model) monaco.editor.setModelLanguage(model, language)
  }, [value, language])

  // Follow the app theme (monaco.editor.setTheme is global to all editors).
  useEffect(() => {
    monaco.editor.setTheme(monacoTheme)
  }, [monacoTheme])

  return <div ref={hostRef} className="monaco-host" />
}
