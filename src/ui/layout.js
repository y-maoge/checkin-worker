// Base HTML / CSS — GitHub-inspired clean dark theme
export const baseCss = `
:root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#e6edf3;--text2:#8b949e;--accent:#58a6ff;--ok:#3fb950;--warn:#d29922;--err:#f85149;--hover:#1f2937}
*{margin:0;padding:0;box-sizing:border-box}
html,body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;font-size:14px;line-height:1.5}
.container{max-width:1012px;margin:0 auto;padding:24px 16px;position:relative}
h1{font-size:20px;font-weight:600;margin-bottom:4px}
h2{font-size:16px;font-weight:600;margin-bottom:12px}
h3{font-size:14px;font-weight:600;margin-bottom:8px}
.sub{color:var(--text2);font-size:12px;margin-bottom:16px}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}

.tabs{display:flex;gap:0;margin-bottom:16px;border-bottom:1px solid var(--border)}
.tab{padding:8px 16px;color:var(--text2);font-size:14px;font-weight:500;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .1s}
.tab:hover{color:var(--text);text-decoration:none}
.tab.active{color:var(--text);border-bottom-color:#f78166}

.card{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:16px;margin-bottom:16px}
.card h2{margin-bottom:12px}

.form-row{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.form-row input,.form-row select{flex:1;min-width:140px;padding:5px 12px;border:1px solid var(--border);background:var(--bg);border-radius:6px;font-size:14px;color:var(--text);outline:none;transition:border-color .1s}
.form-row input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(88,166,255,.1)}
.form-row input::placeholder{color:var(--text2)}

.btn{padding:5px 16px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;color:var(--text);background:var(--surface);transition:background .1s}
.btn:hover{background:var(--hover)}
.btn-primary{background:#238636;border-color:#238636;color:#fff}
.btn-primary:hover{background:#2ea043}
.btn-blue{color:var(--accent);border-color:rgba(88,166,255,.3)}
.btn-blue:hover{background:rgba(88,166,255,.1)}
.btn-amber{color:var(--warn);border-color:rgba(210,153,34,.3)}
.btn-amber:hover{background:rgba(210,153,34,.1)}
.btn-red{color:var(--err);border-color:rgba(248,81,73,.3)}
.btn-red:hover{background:rgba(248,81,73,.1)}
.btn-green{background:#238636;border-color:#238636;color:#fff}
.btn-green:hover{background:#2ea043}
.btn-sm{padding:3px 8px;font-size:12px}
.btn:disabled{opacity:.5;cursor:not-allowed}

.actions{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}

table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:8px 12px;color:var(--text2);font-size:12px;border-bottom:1px solid var(--border);font-weight:500}
td{padding:8px 12px;border-bottom:1px solid var(--border)}
tr:hover td{background:rgba(255,255,255,.02)}
.mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace;font-size:12px}

.badge{padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;display:inline-block}
.badge-ok{background:rgba(63,185,80,.15);color:var(--ok);border:1px solid rgba(63,185,80,.3)}
.badge-off{background:rgba(139,148,158,.1);color:var(--text2);border:1px solid var(--border)}

.toast{position:fixed;top:16px;right:16px;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:500;z-index:100;transition:all .2s;opacity:0;transform:translateY(-8px);pointer-events:none;border:1px solid var(--border)}
.toast.show{opacity:1;transform:translateY(0)}
.toast-ok{background:var(--surface);color:var(--ok);border-color:rgba(63,185,80,.3)}
.toast-err{background:var(--surface);color:var(--err);border-color:rgba(248,81,73,.3)}

.empty{text-align:center;padding:24px;color:var(--text2);font-size:13px}
.log-table{max-height:400px;overflow-y:auto}
.log-level-warn td:nth-child(2){color:var(--warn)}
.log-level-error td:nth-child(2){color:var(--err)}

@media (max-width:600px){
  .container{padding:16px 12px}
  th:nth-child(n+5),td:nth-child(n+5){display:none}
}
`;

export function html(body, { title = 'checkin-worker' } = {}) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${baseCss}</style>
</head>
<body>${body}<div class="toast" id="toast"></div>
<script>
function toast(msg, ok){const t=document.getElementById('toast');t.textContent=msg;t.className='toast show '+(ok?'toast-ok':'toast-err');setTimeout(()=>t.className='toast',3000)}
async function api(path,data,method='POST'){const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:method!=='DELETE'?JSON.stringify(data||{}):undefined});const t=await r.text();try{return JSON.parse(t)}catch(e){return {ok:false,message:t||e.message}}}
window.toast=toast;window.api=api;
</script>
</body></html>`;
}

export function tabsHtml(providers, activeId) {
  return `<div class="tabs">
    ${providers.map(p => `<a class="tab ${p.id === activeId ? 'active' : ''}" href="/p/${p.id}">${p.name}</a>`).join('')}
    <a class="tab ${activeId === '_logs' ? 'active' : ''}" href="/logs" style="margin-left:auto">日志</a>
  </div>`;
}
