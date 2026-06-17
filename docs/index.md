---
layout: home

hero:
  name: Rabbit Wrangler
  text: Desktop operations for RabbitMQ
  tagline: Peek live messages non-destructively, move dead-letters, and purge queues across every cluster — from one fast native app.
  image:
    src: /icon.png
    alt: Rabbit Wrangler
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/willemsevenster/rabbit-wrangler

features:
  - icon: 👀
    title: Non-destructive peek
    details: Tail live messages with a de-duplicated, read-only view — nothing is consumed. Inspect properties, headers, x-death and the payload in a Monaco editor.
  - icon: ↪️
    title: Move dead-letters
    details: Drain a DLQ back to its source (or anywhere) with publisher confirms — a crash can duplicate but never drop. Move or delete individual messages too.
  - icon: 🧹
    title: Purge with care
    details: Clear a queue in one click, behind a confirmation you can switch off when you know what you're doing.
  - icon: 🗂️
    title: Many clusters, many tabs
    details: Connect multiple clusters at once. Each queue opens its own VS Code-style tab that keeps peeking in the background.
  - icon: 🔎
    title: Cross-tab search
    details: Ctrl+F filters every message you've peeked across all open tabs — plain text or regex, with a live-updating result list.
  - icon: 🔐
    title: Encrypted credentials
    details: Passwords are sealed with the OS keychain and never leave your machine. Export/import connections without secrets.
---
