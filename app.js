// ─── CONFIG ───────────────────────────────────────────────
const SOL_ADDR = '3haEN5yaXJjaDEisdNBWVU8CFUGccvgEVGw7EoJyYAyg';
const ETH_ADDR = '0x4647fc3bd5ddEd9b88b3DC677779a23a1ffE55C2';
const TRC_ADDR = 'TPxwVSUYcxhAn2NtYPwyJMMdFgUSYvQn6M';

const WALLETS = [
  {
    id: 'sol', net: 'SOL', label: 'Solana', addr: SOL_ADDR,
    explorer: `https://solscan.io/account/${SOL_ADDR}`,
    txUrl: h => `https://solscan.io/tx/${h}`,
  },
  {
    id: 'eth', net: 'ETH', label: 'Ethereum', addr: ETH_ADDR,
    explorer: `https://etherscan.io/address/${ETH_ADDR}`,
    txUrl: h => `https://etherscan.io/tx/${h}`,
  },
  {
    id: 'trc', net: 'TRC20', label: 'TRON', addr: TRC_ADDR,
    explorer: `https://tronscan.org/#/address/${TRC_ADDR}`,
    txUrl: h => `https://tronscan.org/#/transaction/${h}`,
  },
];

const AUTO_REFRESH_SEC = 60;

// ─── STATE ────────────────────────────────────────────────
let liveData    = { sol: [], eth: [], trc: [] };
let liveErrors  = { sol: false, eth: false, trc: false };
let liveLoading = { sol: true, eth: true, trc: true };
let manualTxs   = loadManual();
let countdown   = AUTO_REFRESH_SEC;
let cdTimer     = null;

// ─── STORAGE ──────────────────────────────────────────────
function loadManual() {
  try { return JSON.parse(localStorage.getItem('wt_manual') || '{}'); }
  catch { return {}; }
}
function saveManual() {
  try { localStorage.setItem('wt_manual', JSON.stringify(manualTxs)); } catch {}
}

// ─── HELPERS ──────────────────────────────────────────────
function short(s, n = 8) {
  if (!s || s === '—') return '—';
  return s.length > n * 2 + 3 ? s.slice(0, n) + '…' + s.slice(-4) : s;
}
function fmtDate(ts) {
  if (!ts) return '—';
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  return isNaN(d) ? '—' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtAmt(val, dec = 6) {
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  return parseFloat(n.toFixed(dec)).toString();
}
function nowHM() {
  return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
async function safeFetch(url, opts = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(id);
    return r;
  } catch(e) {
    clearTimeout(id);
    throw e;
  }
}

// ─── FETCHERS ─────────────────────────────────────────────
// All calls go through /api/* which are Netlify Functions (server-side proxies).
// This eliminates CORS completely — the proxy fetches on the server and returns to the browser.

// SOLANA — via /api/solana (proxy → api.mainnet-beta.solana.com)
async function fetchSolana(w) {
  // Get signatures
  const sigRes = await safeFetch('/api/solana', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'getSignaturesForAddress',
      params: [w.addr, { limit: 15, commitment: 'finalized' }]
    })
  });
  if (!sigRes.ok) throw new Error('proxy ' + sigRes.status);
  const sigJson = await sigRes.json();
  if (sigJson.error) throw new Error(sigJson.error.message);
  const sigs = sigJson.result || [];
  if (!sigs.length) return [];

  // Batch getTransaction for first 8
  const batch = sigs.slice(0, 8).map((s, i) => ({
    jsonrpc: '2.0', id: i,
    method: 'getTransaction',
    params: [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
  }));
  let txDetails = {};
  try {
    const txRes = await safeFetch('/api/solana', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch)
    });
    if (txRes.ok) {
      const txArr = await txRes.json();
      (Array.isArray(txArr) ? txArr : [txArr]).forEach(r => {
        if (r?.result) txDetails[r.result.transaction?.signatures?.[0]] = r.result;
      });
    }
  } catch(_) {}

  return sigs.map(sig => {
    const tx = txDetails[sig.signature];
    let amount = null;
    if (tx?.meta) {
      const diff = Math.abs(
        (tx.meta.preBalances?.[0] || 0) -
        (tx.meta.postBalances?.[0] || 0) -
        (tx.meta.fee || 0)
      );
      if (diff > 5000) amount = fmtAmt(diff / 1e9, 6);
    }
    return {
      hash:   sig.signature,
      amount: amount,
      token:  'SOL',
      date:   fmtDate(sig.blockTime),
      status: sig.err ? 'fail' : 'ok',
      from:   short(sig.signature, 6),
    };
  });
}

// ETHEREUM — via /api/ethereum (proxy → Blockscout → Ethplorer fallback)
async function fetchEth(w) {
  const res = await safeFetch(`/api/ethereum?addr=${w.addr}`);
  if (!res.ok) throw new Error('proxy ' + res.status);
  const data = await res.json();

  // Blockscout format
  if (data.items) {
    return data.items.slice(0, 15).map(tx => ({
      hash:   tx.hash,
      amount: tx.value ? fmtAmt(parseFloat(tx.value) / 1e18, 6) : '0',
      token:  'ETH',
      date:   tx.timestamp ? fmtDate(new Date(tx.timestamp).getTime() / 1000) : '—',
      status: tx.status === 'ok' ? 'ok' : tx.status === 'error' ? 'fail' : 'pend',
      from:   tx.from?.hash ? short(tx.from.hash, 6) : '—',
    }));
  }

  // Ethplorer format (array)
  if (Array.isArray(data)) {
    return data.slice(0, 15).map(tx => ({
      hash:   tx.hash,
      amount: tx.value != null ? fmtAmt(tx.value, 6) : '—',
      token:  'ETH',
      date:   fmtDate(tx.timestamp),
      status: tx.success !== false ? 'ok' : 'fail',
      from:   tx.from ? short(tx.from, 6) : '—',
    }));
  }

  throw new Error('unexpected format');
}

// TRON — via /api/tron (proxy → Tronscan → Trongrid fallback)
async function fetchTron(w) {
  const res = await safeFetch(`/api/tron?addr=${w.addr}`);
  if (!res.ok) throw new Error('proxy ' + res.status);
  const data = await res.json();

  // Tronscan format
  if (data.data) {
    return data.data.slice(0, 15).map(tx => {
      const raw = tx.amount || tx.contractData?.amount || 0;
      return {
        hash:   tx.hash,
        amount: raw ? fmtAmt(raw / 1e6, 2) : null,
        token:  tx.tokenInfo?.tokenAbbr || 'TRX',
        date:   tx.timestamp ? fmtDate(Math.floor(tx.timestamp / 1000)) : '—',
        status: tx.contractRet === 'SUCCESS' ? 'ok' : 'pend',
        from:   tx.ownerAddress ? short(tx.ownerAddress, 6) : '—',
      };
    });
  }

  // Trongrid format
  if (Array.isArray(data.data) || data.meta) {
    return (data.data || []).slice(0, 15).map(tx => ({
      hash:   tx.txID,
      amount: tx.raw_data?.contract?.[0]?.parameter?.value?.amount
                ? fmtAmt(tx.raw_data.contract[0].parameter.value.amount / 1e6, 2) : null,
      token:  'TRX',
      date:   tx.block_timestamp ? fmtDate(Math.floor(tx.block_timestamp / 1000)) : '—',
      status: tx.ret?.[0]?.contractRet === 'SUCCESS' ? 'ok' : 'pend',
      from:   tx.raw_data?.contract?.[0]?.parameter?.value?.owner_address
                ? short(tx.raw_data.contract[0].parameter.value.owner_address, 6) : '—',
    }));
  }

  throw new Error('unexpected format');
}

const FETCHERS = { sol: fetchSolana, eth: fetchEth, trc: fetchTron };

// ─── FETCH ALL ────────────────────────────────────────────
async function fetchAll() {
  if (cdTimer) clearInterval(cdTimer);
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  WALLETS.forEach(w => { liveLoading[w.id] = true; liveErrors[w.id] = false; });
  renderAll();

  await Promise.all(WALLETS.map(async w => {
    try {
      const res = await FETCHERS[w.id](w);
      liveData[w.id] = res || [];
      liveErrors[w.id] = false;
    } catch(e) {
      console.error(`[${w.id}]`, e.message);
      liveErrors[w.id] = true;
      if (!liveData[w.id]) liveData[w.id] = [];
    }
    liveLoading[w.id] = false;
    renderWallet(w);
    updateStats();
  }));

  btn.classList.remove('loading');
  btn.disabled = false;
  document.getElementById('lastUpdated').textContent = 'Actualizado ' + nowHM();
  startCountdown();
}

// ─── COUNTDOWN ────────────────────────────────────────────
function startCountdown() {
  countdown = AUTO_REFRESH_SEC;
  updateCdUI();
  cdTimer = setInterval(() => {
    countdown--;
    updateCdUI();
    if (countdown <= 0) fetchAll();
  }, 1000);
}
function updateCdUI() {
  const el = document.getElementById('statCountdown');
  if (el) el.textContent = countdown + 's';
}

// ─── RENDER ───────────────────────────────────────────────
function renderAll() {
  document.getElementById('walletsArea').innerHTML =
    WALLETS.map(w => buildWalletHTML(w)).join('');
  updateStats();
}

function renderWallet(w) {
  const el = document.getElementById('section-' + w.id);
  if (el) el.outerHTML = buildWalletHTML(w);
  else renderAll();
  updateStats();
}

function buildWalletHTML(w) {
  const search      = (document.getElementById('searchBox')?.value || '').toLowerCase();
  const filterNet   = document.getElementById('filterNet')?.value || 'all';
  const filterSt    = document.getElementById('filterStatus')?.value || 'all';

  if (filterNet !== 'all' && filterNet !== w.id) return '';

  const manual = (manualTxs[w.id] || []).map(t => ({ ...t, _manual: true }));
  let all = [...manual, ...(liveData[w.id] || [])];
  if (filterSt !== 'all')  all = all.filter(t => t.status === filterSt);
  if (search)              all = all.filter(t =>
    (t.hash   || '').toLowerCase().includes(search) ||
    (t.amount || '').toString().includes(search)    ||
    (t.token  || '').toLowerCase().includes(search)
  );

  const loading   = liveLoading[w.id];
  const error     = liveErrors[w.id];
  const confirmed = all.filter(t => t.status === 'ok').length;

  const STS = { ok:'badge-ok', pend:'badge-pend', fail:'badge-fail' };
  const STL = { ok:'Confirmado', pend:'Pendiente', fail:'Fallido' };

  let body = '';
  if (loading) {
    body = `<div class="loading-state"><div class="spinner"></div>Consultando blockchain…</div>`;
  } else if (error && !all.length) {
    body = `<div class="error-state">
      No se pudo obtener datos (CORS o rate limit).<br/>
      <a href="${w.explorer}" target="_blank">Ver en ${w.label} Explorer →</a>
    </div>`;
  } else if (!all.length) {
    body = `<div class="empty-state">Sin transacciones que coincidan.</div>`;
  } else {
    const rows = all.map(tx => {
      const hCell = (tx.hash && tx.hash !== '—')
        ? `<a href="${w.txUrl(tx.hash)}" target="_blank">${short(tx.hash, 8)}</a>`
        : '<span>—</span>';
      const action = tx._manual
        ? `<button class="del-btn" onclick="removeMtx('${w.id}','${tx._id}')" title="Eliminar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
           </button>`
        : `<a href="${w.txUrl(tx.hash)}" target="_blank" title="Ver tx" style="color:var(--text3);display:flex;align-items:center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
           </a>`;
      return `<div class="tx-row${tx._manual ? ' manual-row' : ''}">
        <div class="cell-hash">${tx._manual ? '<span class="badge badge-manual">manual</span>' : ''}${hCell}</div>
        <div class="cell-from">${tx.from || '—'}</div>
        <div><span class="cell-amount">${tx.amount || '—'}</span> <span class="cell-token">${tx.token || ''}</span></div>
        <div><span class="badge ${STS[tx.status] || 'badge-pend'}">${STL[tx.status] || 'Pendiente'}</span></div>
        <div class="cell-date">${tx.date || '—'}</div>
        <div>${action}</div>
      </div>`;
    }).join('');

    body = `<div class="tx-table">
      <div class="tx-head">
        <span>Hash / TxID</span><span>Origen</span><span>Monto</span><span>Estado</span><span>Fecha</span><span></span>
      </div>${rows}
    </div>`;
    if (error) body += `<div style="padding:8px 18px;font-size:12px;color:#f87171;border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px">
      ⚠ API con errores — algunos datos pueden faltar. <a href="${w.explorer}" target="_blank">Ver en explorer</a>
    </div>`;
  }

  return `<div class="wallet-section" id="section-${w.id}">
    <div class="wallet-header">
      <span class="net-badge ${w.id}">${w.net}</span>
      <span class="wallet-addr" title="${w.addr}">${w.addr}</span>
      <span class="wallet-count">${all.length} txs · ${confirmed} ✓</span>
      <a class="wallet-link" href="${w.explorer}" target="_blank">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Explorer
      </a>
    </div>
    ${body}
  </div>`;
}

function updateStats() {
  const all = WALLETS.flatMap(w => [
    ...(manualTxs[w.id] || []),
    ...(liveData[w.id] || []),
  ]);
  document.getElementById('statTotal').textContent    = all.length;
  document.getElementById('statOk').textContent       = all.filter(t => t.status === 'ok').length;
  document.getElementById('statPend').textContent     = all.filter(t => t.status === 'pend').length;
  document.getElementById('tickerStats').textContent  =
    `${all.length} retiros totales · ${all.filter(t => t.status === 'ok').length} confirmados`;
}

// ─── MANUAL TXS ───────────────────────────────────────────
function addManual() {
  const wid    = document.getElementById('mfWallet').value;
  const raw    = document.getElementById('mfAmt').value.trim();
  const hash   = document.getElementById('mfHash').value.trim();
  const status = document.getElementById('mfStatus').value;
  if (!raw) { alert('Ingresá el monto y token (ej: 100 USDT)'); return; }
  const [amount, ...rest] = raw.split(' ');
  const token = rest.join(' ') || 'USDT';
  if (!manualTxs[wid]) manualTxs[wid] = [];
  manualTxs[wid].unshift({
    _id: Date.now().toString(), hash: hash || '—',
    amount, token, status, from: 'manual', _manual: true,
    date: new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' }),
  });
  saveManual();
  document.getElementById('mfAmt').value = '';
  document.getElementById('mfHash').value = '';
  renderWallet(WALLETS.find(x => x.id === wid));
}

function removeMtx(wid, mid) {
  if (!manualTxs[wid]) return;
  manualTxs[wid] = manualTxs[wid].filter(t => t._id !== mid);
  saveManual();
  renderWallet(WALLETS.find(x => x.id === wid));
}

function toggleAddForm() {
  document.getElementById('addFormWrapper').classList.toggle('hidden');
}

// ─── INIT ─────────────────────────────────────────────────
renderAll();
fetchAll();
