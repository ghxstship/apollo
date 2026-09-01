/* <policy-doc> — renders a markdown policy document VERBATIM, scaled to a frame.
   Attributes: src (md url), frame-w, frame-h (px box), page-w (logical design width: 816 letter, 1008 legal, 1080 social).
   Same source file = same content in every frame; only the scale changes. */
(() => {
if (customElements.get('policy-doc')) return;
const cache = {};
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0, list = null, quote = false;
  const closeList = () => { if (list) { out.push(list === 'ol' ? '</ol>' : '</ul>'); list = null; } };
  const closeQuote = () => { if (quote) { out.push('</blockquote>'); quote = false; } };
  while (i < lines.length) {
    const raw = lines[i];
    const l = raw.trimEnd();
    if (/^\s*$/.test(l)) { closeList(); closeQuote(); i++; continue; }
    if (/^---+$/.test(l.trim())) { closeList(); closeQuote(); out.push('<hr>'); i++; continue; }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); closeQuote(); const n = h[1].length; out.push('<h' + Math.min(n, 4) + '>' + inline(esc(h[2])) + '</h' + Math.min(n, 4) + '>'); i++; continue; }
    if (/^\|.*\|\s*$/.test(l)) {
      closeList(); closeQuote();
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i].trimEnd())) { rows.push(lines[i].trimEnd()); i++; }
      const parse = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      let html = '<table>';
      let start = 0;
      const hasHead = rows.length > 1 && /^\s*\|?[\s:|-]+\|?\s*$/.test(rows[1]) && rows[1].includes('-');
      if (hasHead) { html += '<tr>' + parse(rows[0]).map(c => '<th>' + inline(esc(c)) + '</th>').join('') + '</tr>'; start = 2; }
      for (let r = start; r < rows.length; r++) { if (/^[\s:|-]+$/.test(rows[r].replace(/\|/g, ''))) continue; html += '<tr>' + parse(rows[r]).map(c => '<td>' + inline(esc(c)) + '</td>').join('') + '</tr>'; }
      out.push(html + '</table>'); continue;
    }
    if (/^>\s?/.test(l)) { closeList(); if (!quote) { out.push('<blockquote>'); quote = true; } out.push('<p>' + inline(esc(l.replace(/^>\s?/, ''))) + '</p>'); i++; continue; }
    const li = l.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
    if (li) {
      closeQuote();
      const kind = /^\d+\.$/.test(li[1]) ? 'ol' : 'ul';
      if (list !== kind) { closeList(); out.push(kind === 'ol' ? '<ol>' : '<ul>'); list = kind; }
      let item = li[2];
      const box = item.match(/^\[( |x)\]\s+(.*)$/i);
      if (box) item = '<span class="box">[' + (box[1].trim() ? 'X' : '&nbsp;&nbsp;') + ']</span> ' + box[2];
      out.push('<li>' + inline(box ? item.replace(box[2], inline(esc(box[2]))) : inline(esc(item))) + '</li>'); i++; continue;
    }
    closeList(); closeQuote();
    out.push('<p>' + inline(esc(l)) + '</p>'); i++;
  }
  closeList(); closeQuote();
  return out.join('');
}
const CSS = '.pdoc{font-family:var(--font-body,Georgia,serif);color:#141414;box-sizing:border-box}' +
'.pdoc h1{font:400 1.9em/1.08 var(--font-display,sans-serif);text-transform:uppercase;letter-spacing:.01em;margin:0 0 .4em}' +
'.pdoc h2{font:400 1.3em/1.15 var(--font-display,sans-serif);text-transform:uppercase;letter-spacing:.01em;margin:1.4em 0 .45em}' +
'.pdoc h3{font:700 .74em/1.5 var(--font-mono,monospace);letter-spacing:.12em;text-transform:uppercase;color:#141414;margin:1.5em 0 .4em}' +
'.pdoc h4{font:700 .85em/1.4 var(--font-body,sans-serif);margin:1.2em 0 .3em}' +
'.pdoc p{font-size:.85em;line-height:1.55;margin:.45em 0;max-width:70ch;text-wrap:pretty}' +
'.pdoc li{font-size:.85em;line-height:1.5;margin:.25em 0;max-width:66ch;text-wrap:pretty}' +
'.pdoc ul,.pdoc ol{margin:.4em 0;padding-left:1.4em}' +
'.pdoc hr{border:none;border-top:1px solid rgba(20,20,20,.28);margin:1.1em 0}.pdoc hr+hr{display:none}' +
'.pdoc blockquote{border-left:3px solid #B87508;background:rgba(240,161,28,.14);margin:.9em 0;padding:.15em .9em}.pdoc blockquote p{color:#7A4E06}' +
'.pdoc code{font-family:var(--font-mono,monospace);font-size:.92em;background:rgba(20,20,20,.07);padding:0 .25em;border-radius:2px}' +
'.pdoc table{border-collapse:collapse;width:100%;margin:1em 0 .7em;font-size:.78em;line-height:1.4;word-break:break-word}' +
'.pdoc th{font:700 .82em/1.5 var(--font-mono,monospace);letter-spacing:.08em;text-transform:uppercase;color:#4F4F4C;text-align:left;border-bottom:1px solid rgba(20,20,20,.4);padding:.4em .6em .4em 0}' +
'.pdoc td{border-top:1px solid rgba(20,20,20,.14);padding:.4em .6em .4em 0;vertical-align:top}' +
'.pdoc .box{font-family:var(--font-mono,monospace)}' +
'.pdoc-social table{font-size:.7em}.pdoc-social th,.pdoc-social td{padding-right:.4em}';
class PolicyDoc extends HTMLElement {
  static get observedAttributes() { return ['src', 'framew', 'frameh', 'pagew', 'frame-w', 'frame-h', 'page-w']; }
  attributeChangedCallback() { if (this.isConnected) this.queueRender(); }
  connectedCallback() { this.queueRender(); }
  queueRender() { clearTimeout(this._t); this._t = setTimeout(() => this.render(), 30); }
  async render() {
    const attr = (n, d) => this.getAttribute(n) || this.getAttribute(n.replace(/-/g, '')) || d;
    const src = attr('src'); if (!src) return;
    const key = src + '|' + attr('frame-w', '') + '|' + attr('frame-h', '') + '|' + attr('page-w', '');
    if (key === this._key) return; this._key = key;
    const fw = parseFloat(attr('frame-w', '408'));
    const fh = parseFloat(attr('frame-h', '528'));
    const pw = parseFloat(attr('page-w', '816'));
    this.style.cssText = 'display:block;width:' + fw + 'px;height:' + fh + 'px;background:#F1F1ED;box-shadow:0 12px 36px rgba(0,0,0,.45);overflow:hidden;flex:none;position:relative';
    if (!document.getElementById('pdoc-css')) { const st = document.createElement('style'); st.id = 'pdoc-css'; st.textContent = CSS; document.head.appendChild(st); }
    let md;
    try { md = await (cache[src] || (cache[src] = fetch(src).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }))); }
    catch (e) { this.innerHTML = '<div style="font:700 10px/1.6 var(--font-mono,monospace);color:#C22A12;padding:14px">COULD NOT LOAD ' + esc(src) + '</div>'; return; }
    const fs = Math.max(16 * fw / pw, pw > 900 ? 7 : 0); // social frames stay swipe-readable
    const social = pw > 900;
    const pad = Math.round(fw * 0.088);
    const head = social ? '' : '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:' + pad + 'px ' + pad + 'px 0"><span style="font:400 ' + Math.round(fs * 1.1) + 'px/1 var(--font-display,sans-serif);letter-spacing:.02em;color:#141414">[un]</span><span style="font:700 ' + (fs * 0.42).toFixed(1) + 'px/1.6 var(--font-mono,monospace);letter-spacing:.12em;color:#8A8A85;text-align:right">M/V SEA CHARM II · POLICY LIBRARY v1.0</span></div><div style="height:1px;background:rgba(16,20,24,.2);margin:' + Math.round(pad * 0.5) + 'px ' + pad + 'px 0"></div>';
    const foot = social ? '' : '<div style="height:1px;background:rgba(16,20,24,.2);margin:0 ' + pad + 'px"></div><div style="display:flex;justify-content:space-between;gap:14px;padding:' + Math.round(pad * 0.45) + 'px ' + pad + 'px ' + pad + 'px;font:700 ' + (fs * 0.4).toFixed(1) + 'px/1.6 var(--font-mono,monospace);letter-spacing:.12em;color:#8A8A85"><span>[un]HINGED SOCIAL · DOCKET STANDARD</span><span>WHERE THIS DOCUMENT AND THE COI DISAGREE, THE COI GOVERNS</span></div>';
    this.innerHTML = '<div style="width:100%;height:100%;overflow-y:auto;overflow-x:hidden">' + head + '<div class="pdoc' + (social ? ' pdoc-social' : '') + '" style="font-size:' + fs + 'px;padding:' + (social ? pad : Math.round(pad * 0.55)) + 'px ' + pad + 'px"></div>' + foot + '</div><div style="position:absolute;left:0;right:0;bottom:0;height:18px;background:linear-gradient(rgba(241,241,237,0),#F1F1ED);pointer-events:none"></div>';
    this.querySelector('.pdoc').innerHTML = mdToHtml(md);
  }
}
customElements.define('policy-doc', PolicyDoc);
})();
