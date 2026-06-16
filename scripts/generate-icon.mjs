// Rasterizes build/icon.svg to build/icon.png (512x512) using Electron's own
// Chromium via offscreen rendering — no extra image tooling needed.
// electron-builder derives the platform icons (.ico/.icns) from build/icon.png.
//
// Run with:  node_modules/.bin/electron scripts/generate-icon.mjs
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const outPng = path.join(root, 'build', 'icon.png')
const logFile = path.join(root, 'build', '_iconlog.txt')

// Software compositing — offscreen capturePage/paint is flaky on the GPU path
// (UnknownVizError) in this kind of one-off headless run.
app.disableHardwareAcceleration()

app.whenReady().then(() => {
  const svg = readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8')

  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;width:512px;height:512px;overflow:hidden}
    svg{display:block;width:512px;height:512px}
  </style></head><body>${svg}</body></html>`

  let done = false
  win.webContents.on('paint', (_e, _dirty, image) => {
    if (done || image.isEmpty() || image.getSize().width < 64) return
    done = true
    let out = image
    const s = image.getSize()
    if (s.width !== 512 || s.height !== 512) out = image.resize({ width: 512, height: 512 })
    writeFileSync(outPng, out.toPNG())
    writeFileSync(logFile, `ok ${JSON.stringify(out.getSize())}\n`)
    app.exit(0)
  })

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

  setTimeout(() => {
    if (!done) {
      writeFileSync(logFile, 'ERROR: no paint within timeout\n')
      app.exit(1)
    }
  }, 9000)
})
