var exports = {} // we're cheating a whole damn lot.

var last_script = null
window.addEventListener('message', ev => {
  var code = ev.data
  if (last_script) last_script.remove()
  var bod = document.body
  while (bod.firstChild) {
    bod.removeChild(bod.firstChild)
  }

  var sc = document.createElement('script')
  sc.appendChild(document.createTextNode(`(function () {${code}})()`))
  last_script = sc
  document.head.appendChild(sc)
})

// we do that for all the demos.
elt.setup_mutation_observer(document)

function require(name) {
  return window[name]
}

function demo_display(...a) {
  E(document.body, ...a)
}

function DemoBtn(attrs, chld) {
  return E.BUTTON(
    elt.$click(attrs.do),
    attrs.do.toString().trim().replace(/function\s\([\)]*\)\s*\{\s*(?:return\s*)((?:.|\n)*)\s*\}\s*/m, (m, ma) => ma)
      .replace(/\s*\([^\)]*\)\s*=>\s*/, '')
  )
}