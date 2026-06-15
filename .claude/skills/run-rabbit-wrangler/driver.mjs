// REPL driver for the Rabbit Wrangler Electron app.
//
// Launches the BUILT app (out/) via Playwright's Electron driver and exposes a
// line-based command protocol on stdin so an agent can launch / screenshot /
// inspect / click without relaunching the (slow) app each time.
//
// Usage (pipe commands in; one per line):
//   "launch`nss launch`ntext .app-header`nquit" | node .claude/skills/run-rabbit-wrangler/driver.mjs   (PowerShell)
//   printf 'launch\nss launch\nquit\n' | node .claude/skills/run-rabbit-wrangler/driver.mjs              (bash)
//
// Headless Linux: wrap the node call in `xvfb-run -a` (verified on Windows).
import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'
import * as readline from 'node:readline'
import * as fs from 'node:fs'
import * as path from 'node:path'

const APP_DIR = path.resolve(import.meta.dirname, '../../..')
const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(import.meta.dirname, 'shots')
fs.mkdirSync(SHOT_DIR, { recursive: true })

let app = null
let page = null
const consoleErrors = []

const COMMANDS = {
  async launch() {
    if (app) return console.log('already launched')
    app = await electron.launch({
      args: ['.'],
      cwd: APP_DIR,
      executablePath: electronPath
    })
    page = await app.firstWindow()
    // Auto-accept native confirm()/alert() dialogs (e.g. Purge confirmation).
    page.on('dialog', async (d) => {
      console.log('dialog:', d.type(), JSON.stringify(d.message()))
      await d.accept()
    })
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
    await page.waitForLoadState('domcontentloaded')
    // The renderer is mounted once our shell is in the DOM.
    await page.waitForSelector('.titlebar__title', { timeout: 15_000 })
    console.log('launched:', (await page.textContent('.titlebar__title'))?.trim())
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first')
    const f = path.join(SHOT_DIR, (name || `ss-${process.pid}`) + '.png')
    await page.screenshot({ path: f })
    console.log('screenshot:', f)
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first')
    const out = await page.evaluate(
      (s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
      sel || null
    )
    console.log(out)
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first')
    try {
      console.log(JSON.stringify(await page.evaluate(expr)))
    } catch (e) {
      console.log('ERROR:', e.message)
    }
  },

  // fill <selector> <value> — sets a (React-controlled) input via Playwright.
  async fill(rest) {
    if (!page) return console.log('ERROR: launch first')
    const i = rest.indexOf(' ')
    const sel = i === -1 ? rest : rest.slice(0, i)
    const val = i === -1 ? '' : rest.slice(i + 1)
    await page.fill(sel, val)
    console.log('fill', sel, '←', JSON.stringify(val))
  },

  // drag <selector> <dx> — press on the element's center and move dx px right.
  async drag(rest) {
    if (!page) return console.log('ERROR: launch first')
    const i = rest.indexOf(' ')
    const sel = i === -1 ? rest : rest.slice(0, i)
    const dx = i === -1 ? 0 : Number(rest.slice(i + 1))
    const el = await page.$(sel)
    if (!el) return console.log('drag', sel, '→ NOT_FOUND')
    const box = await el.boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + dx, cy, { steps: 10 })
    await page.mouse.up()
    console.log('drag', sel, dx)
  },

  // select <selector> <value> — choose an <option> in a <select>.
  async select(rest) {
    if (!page) return console.log('ERROR: launch first')
    const i = rest.indexOf(' ')
    const sel = i === -1 ? rest : rest.slice(0, i)
    const val = i === -1 ? '' : rest.slice(i + 1)
    await page.selectOption(sel, val)
    console.log('select', sel, '←', JSON.stringify(val))
  },

  // Real left-click (full pointer sequence incl. mousedown) — for outside-close etc.
  async pclick(sel) {
    if (!page) return console.log('ERROR: launch first')
    try {
      await page.click(sel)
      console.log('pclick', sel, '→ OK')
    } catch (e) {
      console.log('pclick', sel, '→', e.message)
    }
  },

  // vdrag <selector> <dy> — press the element's center and move dy px vertically.
  async vdrag(rest) {
    if (!page) return console.log('ERROR: launch first')
    const i = rest.indexOf(' ')
    const sel = i === -1 ? rest : rest.slice(0, i)
    const dy = i === -1 ? 0 : Number(rest.slice(i + 1))
    const el = await page.$(sel)
    if (!el) return console.log('vdrag', sel, '→ NOT_FOUND')
    const box = await el.boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy + dy, { steps: 10 })
    await page.mouse.up()
    console.log('vdrag', sel, dy)
  },

  // Right-click (opens context menus). Uses a real pointer event, not DOM click.
  async rclick(sel) {
    if (!page) return console.log('ERROR: launch first')
    try {
      await page.click(sel, { button: 'right' })
      console.log('rclick', sel, '→ OK')
    } catch (e) {
      console.log('rclick', sel, '→', e.message)
    }
  },

  async click(sel) {
    if (!page) return console.log('ERROR: launch first')
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s)
      if (!el) return 'NOT_FOUND'
      el.click()
      return 'OK'
    }, sel)
    console.log('click', sel, '→', r)
  },

  async 'click-text'(textArg) {
    if (!page) return console.log('ERROR: launch first')
    const r = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')]
      const el = els.find((e) => e.textContent?.trim() === t) ?? els.find((e) => e.textContent?.includes(t))
      if (!el) return 'NOT_FOUND'
      el.click()
      return 'OK: ' + el.tagName
    }, textArg)
    console.log('click-text', JSON.stringify(textArg), '→', r)
  },

  async type(t) {
    if (page) await page.keyboard.type(t, { delay: 30 })
  },
  async press(key) {
    if (page) await page.keyboard.press(key)
  },

  async sleep(ms) {
    await new Promise((r) => setTimeout(r, Number(ms) || 1000))
    console.log('slept', Number(ms) || 1000, 'ms')
  },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first')
    try {
      await page.waitForSelector(sel, { timeout: 10_000 })
      console.log('found:', sel)
    } catch {
      console.log('TIMEOUT:', sel)
    }
  },

  errors() {
    console.log('console errors:', consoleErrors.length)
    for (const e of consoleErrors.slice(-20)) console.log('  ', e)
  },

  async windows() {
    if (!app) return console.log('ERROR: launch first')
    for (const w of app.windows()) console.log(' ', w.url())
  },

  async quit() {
    if (app) await app.close().catch(() => {})
    app = null
    page = null
  },

  help() {
    console.log('commands:', Object.keys(COMMANDS).join(', '))
  }
}

const rl = readline.createInterface({ input: process.stdin })
let hadError = false

for await (const line of rl) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const [cmd, ...rest] = trimmed.split(/\s+/)
  const fn = COMMANDS[cmd]
  if (!fn) {
    console.log('unknown:', cmd, '— try: help')
    continue
  }
  try {
    await fn(rest.join(' '))
  } catch (e) {
    hadError = true
    console.log('ERROR:', e.message)
  }
  if (cmd === 'quit') break
}

await COMMANDS.quit()
process.exit(hadError ? 1 : 0)
