import { html, tabsHtml } from './layout.js';

// ---------- Login Page ----------

export function loginPage(error) {
  const errHtml = error ? `<p style="color:var(--err);font-size:13px;margin-bottom:8px">${error}</p>` : '';
  return html(`
<div class="container" style="max-width:340px;margin-top:100px">
  <div style="text-align:center;margin-bottom:24px">
    <h1 style="font-size:24px">checkin-worker</h1>
    <p class="sub">Sign in to continue</p>
  </div>
  <div class="card">
    ${errHtml}
    <form method="POST" action="/login">
      <div class="form-row"><input type="password" name="password" placeholder="Password" required autofocus></div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px;padding:8px" type="submit">Sign in</button>
    </form>
  </div>
</div>`, { title: 'Sign in' });
}

// ---------- Add Account Section ----------

function registrationFormHtml(pid) {
  return `
<div class="card">
  <h2>订阅地址</h2>
  <p style="font-size:13px;color:var(--text2);margin-bottom:16px">在代理工具中添加对应模块，打开 WeTalk / PingMe 后自动抓取账号数据。</p>

  <div style="margin-bottom:12px">
    <h3>Surge / Egern</h3>
    <a id="sub-surge" href="#" class="mono" style="font-size:13px;word-break:break-all"></a>
  </div>

  <div style="margin-bottom:12px">
    <h3>Quantumult X</h3>
    <a id="sub-qx" href="#" class="mono" style="font-size:13px;word-break:break-all"></a>
  </div>

  <div style="margin-bottom:12px">
    <h3>Loon</h3>
    <a id="sub-loon" href="#" class="mono" style="font-size:13px;word-break:break-all"></a>
  </div>

  <hr style="border:0;border-top:1px solid var(--border);margin:16px 0">

  <p style="font-size:13px;color:var(--text2);line-height:1.8">
    Surge: 首页 - 模块 - 安装新模块 - 粘贴地址<br>
    Loon: 配置 - 插件 - + - 粘贴地址<br>
    QX: 风车 - 重写 - 引用 - 粘贴地址<br>
    Shadowrocket: 配置 - 模块 - + - 使用 Surge 地址
  </p>
</div>

<div class="card">
  <h2>手动导入</h2>
  <p style="font-size:13px;color:var(--text2);margin-bottom:12px">直接输入从 APP 获取的账号数据</p>
  <div class="form-row">
    <input type="text" id="import-callpin" placeholder="callpin (必填)" autocomplete="off">
    <input type="text" id="import-email" placeholder="邮箱 (选填)" autocomplete="off">
  </div>
  <div class="form-row">
    <input type="text" id="import-phone" placeholder="手机号 (选填)" autocomplete="off">
    <input type="text" id="import-device-uid" placeholder="deviceUID (选填)" autocomplete="off">
  </div>
  <button class="btn btn-primary" onclick="manualImport()" style="margin-top:4px">导入</button>
</div>

<script>
const PID = '${pid}';

(function(){
  const origin = location.origin;
  const surge = document.getElementById('sub-surge');
  const loon = document.getElementById('sub-loon');
  const qx = document.getElementById('sub-qx');
  surge.href = origin + '/sub/checkin.sgmodule';
  surge.textContent = origin + '/sub/checkin.sgmodule';
  loon.href = origin + '/sub/checkin.lpx';
  loon.textContent = origin + '/sub/checkin.lpx';
  qx.href = origin + '/sub/checkin.conf';
  qx.textContent = origin + '/sub/checkin.conf';
})();

async function manualImport() {
  const callpin = document.getElementById('import-callpin').value.trim();
  if (!callpin) { toast('请输入 callpin', false); return; }
  const email = document.getElementById('import-email').value.trim();
  const phone = document.getElementById('import-phone').value.trim();
  const deviceUID = document.getElementById('import-device-uid').value.trim();
  try {
    const r = await api('/api/accounts/import', {
      provider: PID, callpin, email: email || '', phone: phone || '',
      device: deviceUID ? { deviceUID } : {}
    });
    if (r.ok) { toast(r.message || '导入成功', true); setTimeout(() => location.reload(), 1000); }
    else { toast(r.message || '导入失败', false); }
  } catch(e) { toast('请求失败: ' + e.message, false); }
}
</script>`;
}

// ---------- Provider Page ----------

export function providerPage({ providers: provs, provider, accounts, logs }) {
  const pid = provider.id;

  const accountRows = accounts.map(a => {
    const d = provider.describeAccount(a);
    const email = a.data?.email || '-';
    const badge = a.enabled
      ? '<span class="badge badge-ok">on</span>'
      : '<span class="badge badge-off">off</span>';
    const escapedId = a.id.replace(/'/g, "\\'");
    return '<tr>' +
      '<td class="mono">' + d.title + '</td>' +
      '<td>' + email + '</td>' +
      '<td>' + badge + '</td>' +
      '<td id="bal-' + a.id + '">-</td>' +
      '<td>' + (a.last_status || '-') + '</td>' +
      '<td class="mono">' + (a.last_run_at || '-') + '</td>' +
      '<td>' +
        '<button class="btn btn-sm btn-blue" onclick="queryBalance(\'' + escapedId + '\')">余额</button> ' +
        '<button class="btn btn-sm btn-amber" onclick="toggleAccount(\'' + escapedId + '\')">' + (a.enabled ? '停用' : '启用') + '</button> ' +
        '<button class="btn btn-sm btn-red" onclick="deleteAccount(\'' + escapedId + '\')">删除</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  const logRows = logs.map(l => {
    const cls = l.level === 'error' ? 'log-level-error' : l.level === 'warn' ? 'log-level-warn' : '';
    return '<tr class="' + cls + '">' +
      '<td class="mono">' + (l.created_at || '') + '</td>' +
      '<td>' + (l.level || 'info') + '</td>' +
      '<td>' + (l.message || '') + '</td>' +
    '</tr>';
  }).join('');

  return html(`
<div class="container">
  <h1>${provider.name}</h1>
  <p class="sub">${provs.length} providers / cron: 20 */3 * * *</p>
  ${tabsHtml(provs, pid)}

  ${registrationFormHtml(pid)}

  <div class="card">
    <h2>账号 (${accounts.length})</h2>
    <div class="actions">
      <button class="btn btn-green" id="run-btn" onclick="runProvider()">执行签到</button>
      <button class="btn" onclick="location.reload()">刷新</button>
    </div>
    ${accounts.length
      ? `<div style="overflow-x:auto"><table><thead><tr><th>别名</th><th>邮箱</th><th>状态</th><th>余额</th><th>结果</th><th>执行时间</th><th>操作</th></tr></thead><tbody>${accountRows}</tbody></table></div>`
      : '<p class="empty">暂无账号，请通过订阅或手动导入添加</p>'}
  </div>

  <div class="card" id="live-log-card" style="display:none">
    <h2>执行日志 <span id="live-log-status" style="font-size:12px;color:var(--text2);margin-left:8px"></span></h2>
    <div class="log-table" id="live-log-body"></div>
  </div>

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h2 style="margin-bottom:0">定时任务日志</h2>
      <button class="btn btn-sm btn-red" onclick="clearLogs()">清空</button>
    </div>
    <div class="log-table">
    ${logs.length
      ? `<table><thead><tr><th>时间</th><th>级别</th><th>内容</th></tr></thead><tbody>${logRows}</tbody></table>`
      : '<p class="empty">暂无日志</p>'}
    </div>
  </div>

  <div class="card">
    <h2>设置</h2>
    <h3>修改管理密码</h3>
    <div class="form-row">
      <input type="password" id="old-pwd" placeholder="当前密码" style="max-width:180px">
      <input type="password" id="new-pwd" placeholder="新密码" style="max-width:180px">
      <button class="btn btn-amber" onclick="changePassword()">修改</button>
    </div>
  </div>
</div>
<script>
async function queryBalance(id){const el=document.getElementById('bal-'+id);if(el)el.textContent='...';const r=await api('/api/accounts/'+encodeURIComponent(id)+'/balance');if(r.ok&&el){el.textContent=r.balance;toast('余额: '+r.balance,true)}else{if(el)el.textContent='-';toast(r.message||'查询失败',false)}}
async function toggleAccount(id){const r=await api('/api/accounts/'+encodeURIComponent(id)+'/toggle');if(r.ok){toast('已切换',true);setTimeout(()=>location.reload(),500)}else{toast(r.message||'失败',false)}}
async function deleteAccount(id){if(!confirm('确认删除?'))return;const r=await api('/api/accounts/'+encodeURIComponent(id),null,'DELETE');if(r.ok){toast('已删除',true);setTimeout(()=>location.reload(),500)}else{toast(r.message||'失败',false)}}
function runProvider(){
  const btn=document.getElementById('run-btn');
  btn.disabled=true;btn.textContent='执行中...';
  const card=document.getElementById('live-log-card');
  card.style.display='block';
  const statusEl=document.getElementById('live-log-status');
  const bodyEl=document.getElementById('live-log-body');
  statusEl.textContent='执行中...';
  bodyEl.innerHTML='<table><thead><tr><th>时间</th><th>级别</th><th>内容</th></tr></thead><tbody id="live-log-tbody"></tbody></table>';
  card.scrollIntoView({behavior:'smooth'});
  const tbody=document.getElementById('live-log-tbody');
  const es=new EventSource('/api/providers/${pid}/run-stream');
  es.addEventListener('log',function(e){
    const d=JSON.parse(e.data);
    const cls=d.level==='error'?'log-level-error':d.level==='warn'?'log-level-warn':'';
    const tr=document.createElement('tr');
    tr.className=cls;
    tr.innerHTML='<td class="mono">'+d.time+'</td><td>'+d.level+'</td><td>'+d.message+'</td>';
    tbody.appendChild(tr);
    tr.scrollIntoView({behavior:'smooth',block:'nearest'});
  });
  es.addEventListener('done',function(e){
    const d=JSON.parse(e.data);
    es.close();
    btn.disabled=false;btn.textContent='执行签到';
    statusEl.textContent=d.ok?'完成: '+d.summary:'失败: '+d.summary;
    toast(d.ok?'完成: '+d.summary:'失败: '+d.summary,d.ok);
  });
  es.onerror=function(){
    es.close();
    btn.disabled=false;btn.textContent='执行签到';
    statusEl.textContent='连接断开';
  };
}
async function clearLogs(){const r=await api('/api/providers/${pid}/logs',null,'DELETE');if(r.ok){toast('已清空',true);setTimeout(()=>location.reload(),500)}else{toast(r.message||'失败',false)}}
async function changePassword(){
  const o=document.getElementById('old-pwd').value,n=document.getElementById('new-pwd').value;
  if(!o||!n){toast('请填写完整',false);return;}
  const r=await api('/api/settings/password',{oldPassword:o,newPassword:n});
  if(r.ok){toast('密码已修改',true);document.getElementById('old-pwd').value='';document.getElementById('new-pwd').value='';}
  else{toast(r.message||'修改失败',false);}
}
</script>`, { title: provider.name });
}

// ---------- All Logs Page ----------

export function logsPage({ providers: provs, logs }) {
  const logRows = logs.map(l => {
    const cls = l.level === 'error' ? 'log-level-error' : l.level === 'warn' ? 'log-level-warn' : '';
    return '<tr class="' + cls + '">' +
      '<td>' + (l.provider || '-') + '</td>' +
      '<td class="mono">' + (l.created_at || '') + '</td>' +
      '<td>' + (l.level || 'info') + '</td>' +
      '<td>' + (l.message || '') + '</td>' +
    '</tr>';
  }).join('');

  return html(`
<div class="container">
  <h1>全部日志</h1>
  <p class="sub">所有应用的执行记录</p>
  ${tabsHtml(provs, '_logs')}
  <div class="card">
    <div class="log-table">
    ${logs.length
      ? `<table><thead><tr><th>应用</th><th>时间</th><th>级别</th><th>内容</th></tr></thead><tbody>${logRows}</tbody></table>`
      : '<p class="empty">暂无日志</p>'}
    </div>
  </div>
</div>`, { title: '日志' });
}
