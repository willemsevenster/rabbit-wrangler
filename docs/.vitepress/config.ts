import { defineConfig } from 'vitepress'

const HOSTNAME = 'https://willemsevenster.github.io'
const BASE = '/rabbit-wrangler/'
const DESCRIPTION =
  'Rabbit Wrangler is a cross-platform desktop app for operating multiple RabbitMQ clusters: non-destructively peek live messages, move dead-letter messages, and purge queues.'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Rabbit Wrangler',
  description: DESCRIPTION,
  lang: 'en-US',
  base: BASE,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: HOSTNAME + BASE },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: BASE + 'favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#f26d21' }],
    ['meta', { name: 'keywords', content: 'RabbitMQ, AMQP, dead-letter queue, DLQ, message queue, desktop, Electron, queue management, peek messages' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Rabbit Wrangler — desktop RabbitMQ operations' }],
    ['meta', { property: 'og:description', content: DESCRIPTION }],
    ['meta', { property: 'og:image', content: HOSTNAME + BASE + 'icon.png' }],
    ['meta', { property: 'og:url', content: HOSTNAME + BASE }],
    ['meta', { name: 'twitter:card', content: 'summary' }]
  ],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'User Manual', link: '/guide/getting-started' },
      { text: 'Reference', link: '/API' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'User Manual',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Connections', link: '/guide/connections' },
            { text: 'Peeking messages', link: '/guide/peeking-messages' },
            { text: 'Moving & purging', link: '/guide/moving-and-purging' },
            { text: 'Dead-letter queues', link: '/guide/dead-letter-queues' },
            { text: 'Exchanges & publishing', link: '/guide/exchanges' },
            { text: 'Administration', link: '/guide/administration' },
            { text: 'Searching messages', link: '/guide/search' },
            { text: 'Keyboard navigation', link: '/guide/keyboard' },
            { text: 'Settings', link: '/guide/settings' }
          ]
        },
        {
          text: 'Reference',
          items: [
            { text: 'API & coverage', link: '/API' },
            { text: 'Test rig', link: '/TESTING' }
          ]
        }
      ]
    },

    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/willemsevenster/rabbit-wrangler' }],
    editLink: {
      pattern: 'https://github.com/willemsevenster/rabbit-wrangler/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © frontforge'
    }
  }
})
