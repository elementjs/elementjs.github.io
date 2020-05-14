function scrollToHash(id) {
  var elt = document.getElementById(id)
  if (elt) {
    elt.scrollIntoView()
  }
}

window.addEventListener('hashchange', function (ev) {
  var top = window.location.hash.slice(1)
  scrollToHash(top)
  ev.preventDefault()
})

window.addEventListener('load', function () {
  if (window.location.hash)
    scrollToHash(window.location.hash.slice(1))
})


// First set up the VSCode loader in a script tag
const getLoaderScript = document.createElement('script')
// getLoaderScript.src = 'https://www.typescriptlang.org/v2/js/vs.loader.js'
getLoaderScript.src = './loader.js'
getLoaderScript.src = './monaco/vs/loader.js'
getLoaderScript.async = true
getLoaderScript.onload = () => {
  // Now the loader is ready, tell require where it can get the version of monaco, and the sandbox
  // This version uses the latest version of the sandbox, which is used on the TypeScript website

  // For the monaco version you can use MaxCDN or the TypeSCript web infra CDN
  // You can see the available releases for TypeScript here:
  // https://typescript.azureedge.net/indexes/releases.json
  //
  require.config({
    paths: {
      // vs: 'https://typescript.azureedge.net/cdn/3.7.3/monaco/min/vs',
      vs: './monaco/vs',
      // sandbox: 'https://www.typescriptlang.org/v2/js/sandbox',
      sandbox: './sandbox',
    },
    // This is something you need for monaco to work
    ignoreDuplicateModules: ['vs/editor/editor.main'],
  })

  // Grab a copy of monaco, TypeScript and the sandbox
  require(['vs/editor/editor.main', 'vs/language/typescript/tsWorker', 'sandbox/index', 'sandbox/theme'], (
    main,
    _tsWorker,
    sandbox,
    theme
  ) => {
    const initialCode = `import { e } from "elt"
const p = e.$DIV()
`

    const isOK = main && window.ts && sandbox
    if (isOK) {
      // ??
    } else {
      console.error('Could not get all the dependencies of sandbox set up!')
      console.error('main', !!main, 'ts', !!window.ts, 'sandbox', !!sandbox)
      return
    }

    // Create a sandbox and embed it into the the div #monaco-editor-embed
    const sandboxConfig = {
      text: initialCode,
      // theme: 'sandbox-dark',
      acquireTypes: false,
      compilerOptions: {
        target: 5,
        strict: true,
        lib: ["es6", "dom"],
        jsx: 2,
        jsxFactory: "E",
        module: 1, // amd // https://github.com/microsoft/monaco-typescript/blob/master/src/monaco.d.ts
        types: ["elt"]
      },
      domID: 'st-playground',
    }

    // has getText() and setText()
    var sdb = window.sandbox = sandbox.createTypeScriptSandbox(sandboxConfig, main, window.ts)

    var service = sdb.languageServiceDefaults
    // extra libraries

    service.addExtraLib(
      document.getElementById('elt-d-ts').innerText + `
declare global {
  function demo_display(...a: Renderable[]): void
  function DemoBtn(attrs: Attrs<HTMLButtonElement> & {do: (a?: any) => any}, chld: Renderable[]): HTMLButtonElement
}
      `,
      'file:///node_modules/elt/index.d.ts'
    );

    // sdb.updateCompilerSetting('')
    sdb.updateCompilerSetting('jsxFactory', 'E')
    sdb.updateCompilerSetting('target', 5)
    sdb.updateCompilerSetting('module', 1)

    sdb.monaco.editor.defineTheme('eltdoc', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'elt-function-call', foreground: '8080dd'},
        { token: 'metatag.content', foreground: 'ddaaaa', fontStyle: 'italic' },
        { token: 'attribute.name', foreground: 'dd8080' }
      ]
    })
    sdb.monaco.editor.setTheme('eltdoc')

    // console.log(sdb)
  })
}

document.body.appendChild(getLoaderScript)

const wd = document.getElementById('st-playground-overlay')
wd.addEventListener('click', ev => {
  if (ev.currentTarget === ev.target)
    wd.style.display = 'none'
})
wd.addEventListener('keydown', ev => {
  if (ev.code === 'Enter' && ev.ctrlKey
   || ev.code === 'KeyS' && ev.ctrlKey
  ) {
    ev.preventDefault()
    ev.stopPropagation()
    reload()
  }
}, true)
// wd.style.display = 'none'

const examples = Array.from(document.getElementsByTagName('pre'))
    .filter(n => n.classList.contains('language-tsx'))

for (let e of examples) {
  var next = e.nextSibling
  var div = h('div',
    {class: 'st-example'},
    e,
    h('button', '▶ Run Example', btn => {
      btn.addEventListener('click', ev => {
        sandbox.setText(e.innerText)
        reload()
        wd.style.display = 'flex'
        sandbox.editor.layout() // force repaint of monaco window
      })
    })
  )
  next.parentNode.insertBefore(div, next)
  // For runnable code, do something
}

// HA ! We cheat !
function require(str) {
  return window[str]
}

function h(elt, ...children) {
  var node = typeof elt === 'string' ? document.createElement(elt) : elt
  for (var c of children) {
    if (typeof c === 'string' || typeof c === 'number') {
      node.appendChild(document.createTextNode(c.toString()))
    } else if (c && 'parentNode' in c) {
      node.appendChild(c)
    } else if (typeof c === 'function') {
      c(node)
    } else if (Array.isArray(c)) {
      h(node, ...c)
    } else if (c != null) {
      // object
      var keys = Object.keys(c)
      for (var k of keys) {
        node.setAttribute(k, c[k])
      }
      // ...?
    }
  }
  return node
}

function reload() {
  sandbox.getRunnableJS().then(code => {
    console.log(code.split(/\n/g).map((l, i) => `${i + 1}: ${l}`).join('\n'))
    mkiframe(code)
  })
}

document.getElementById('st-playground-reload').addEventListener('click', ev => {
  reload()
})

var _ifr = null
function mkiframe(code) {
  if (!_ifr) {
    var pifr = document.getElementById('ifr')
    if (pifr) pifr.remove()
    var ifr = document.createElement('iframe')

    ifr.sandbox = 'allow-same-origin allow-scripts allow-popups'
    ifr.id = 'ifr'
    ifr.src = './run.html'

    code = (code || '').replace(/"use strict";/, '')
    code = `
    ${code}
    `

    ifr.addEventListener('load', ev => {
      var cw = ifr.contentWindow
      cw.postMessage(code, '*')
    })

    document.getElementById('st-playground-root').appendChild(ifr)
    _ifr = ifr
  } else {
    _ifr.contentWindow.postMessage(code, '*')
  }


  // var script = document.createelement

  // var script = document.createElement('script')
  // script.src = './elt.js'

}
