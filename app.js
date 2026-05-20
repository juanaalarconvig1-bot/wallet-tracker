const SOL_ADDR = '3haEN5yaXJjaDEisdNBWVU8CFUGccvgEVGw7EoJyYAyg';
const ETH_ADDR = '0x4647fc3bd5ddEd9b88b3DC677779a23a1ffE55C2';
const TRC_ADDR = 'TPxwVSUYcxhAn2NtYPwyJMMdFgUSYvQn6M';
const USDT_SOL = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const USDT_ETH = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const USDT_TRC = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const WALLETS = [
  { id:'sol', net:'SOL',   label:'Solana',         addr:SOL_ADDR, explorer:`https://solscan.io/account/${SOL_ADDR}`,            txUrl:h=>`https://solscan.io/tx/${h}` },
  { id:'eth', net:'ETH',   label:'Ethereum (USDT)', addr:ETH_ADDR, explorer:`https://etherscan.io/address/${ETH_ADDR}`,           txUrl:h=>`https://etherscan.io/tx/${h}` },
  { id:'trc', net:'TRC20', label:'TRON (USDT)',     addr:TRC_ADDR, explorer:`https://tronscan.org/#/address/${TRC_ADDR}`,         txUrl:h=>`https://tronscan.org/#/transaction/${h}` },
];

const AUTO_REFRESH_SEC = 120;
let liveData    = { sol:[], eth:[], trc:[] };
let liveErrors  = { sol:false, eth:false, trc:false };
let liveLoading = { sol:true, eth:true, trc:true };
let manualTxs   = loadManual();
let countdown   = AUTO_REFRESH_SEC;
let cdTimer     = null;

function loadManual() { try { return JSON.parse(localStorage.getItem('wt_manual')||'{}'); } catch { return {}; } }
function saveManual()  { try { localStorage.setItem('wt_manual', JSON.stringify(manualTxs)); } catch {} }

function short(s, n=8) {
  if (!s||s==='—') return '—';
  return s.length>n*2+3 ? s.slice(0,n)+'…'+s.slice(-4) : s;
}
function fmtDate(ts) {
  if (!ts) return '—';
  const ms = ts<1e12 ? ts*1000 : ts;
  const d = new Date(ms);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit'})
    +' '+d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
}
function fmtAmt(val, dec=2) { const n=parseFloat(val); return isNaN(n)?'—':parseFloat(n.toFixed(dec)).toString(); }
function nowHM() { return new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}); }
async function safeFetch(url, opts={}) {
  const ctrl=new AbortController();
  const tid=setTimeout(()=>ctrl.abort(),15000);
  try { const r=await fetch(url,{...opts,signal:ctrl.signal}); clearTimeout(tid); return r; }
  catch(e) { clearTimeout(tid); throw e; }
}

// ─── FETCHERS — llamadas directas al browser, sin proxy ───

async function fetchSolana(w) {
  const RPC = 'https://api.mainnet-beta.solana.com';
  const sigRes = await safeFetch(RPC, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getSignaturesForAddress',
      params:[w.addr,{limit:30,commitment:'finalized'}]})
  });
  if (!sigRes.ok) throw new Error('solana rpc '+sigRes.status);
  const {result:sigs,error} = await sigRes.json();
  if (error) throw new Error(error.message);
  const good = (sigs||[]).filter(s=>!s.err).slice(0,15);
  if (!good.length) return [];

  const batch = good.map((s,i)=>({jsonrpc:'2.0',id:i,method:'getTransaction',
    params:[s.signature,{encoding:'jsonParsed',maxSupportedTransactionVersion:0}]}));
  const txRes = await safeFetch(RPC, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(batch)
  });
  if (!txRes.ok) throw new Error('solana batch '+txRes.status);
  const txArr = await txRes.json();

  const results=[];
  for (const r of (Array.isArray(txArr)?txArr:[txArr])) {
    const tx=r?.result; if (!tx) continue;
    const sig=tx.transaction?.signatures?.[0];
    const pre=tx.meta?.preTokenBalances||[];
    const post=tx.meta?.postTokenBalances||[];
    for (const preB of pre) {
      if (preB.mint!==USDT_SOL||preB.owner!==w.addr) continue;
      const postB=post.find(p=>p.accountIndex===preB.accountIndex);
      const diff=parseFloat(preB.uiTokenAmount?.uiAmount||0)-parseFloat(postB?.uiTokenAmount?.uiAmount||0);
      if (diff>0.009) results.push({hash:sig,amount:fmtAmt(diff,2),token:'USDT',
        date:fmtDate(tx.blockTime),status:'ok',to:'Solana tx'});
    }
  }
  return results;
}

async function fetchEth(w) {
  // Etherscan tokentx — CORS abierto, sin key funciona con límite generoso
  const url=`https://api.etherscan.io/api?module=account&action=tokentx`
    +`&contractaddress=${USDT_ETH}&address=${w.addr}&sort=desc&offset=50&page=1`;
  const res=await safeFetch(url);
  if (!res.ok) throw new Error('etherscan '+res.status);
  const data=await res.json();
  if (data.status!=='1') {
    if (data.message==='No transactions found') return [];
    throw new Error(data.message||data.result);
  }
  return data.result
    .filter(tx=>tx.from.toLowerCase()===w.addr.toLowerCase())
    .slice(0,30)
    .map(tx=>({
      hash:tx.hash,
      amount:fmtAmt(parseInt(tx.value)/1e6,2),
      token:tx.tokenSymbol||'USDT',
      date:fmtDate(tx.timeStamp),
      status:tx.isError==='0'?'ok':'fail',
      to:short(tx.to,7),
    }));
}

async function fetchTron(w) {
  // Trongrid TRC20 — CORS abierto, no necesita key
  const url=`https://api.trongrid.io/v1/accounts/${w.addr}/transactions/trc20`
    +`?limit=50&contract_address=${USDT_TRC}&only_from=true`;
  const res=await safeFetch(url);
  if (!res.ok) throw new Error('trongrid '+res.status);
  const data=await res.json();
  if (!Array.isArray(data.data)) throw new Error('trongrid bad response');
  return data.data.slice(0,30).map(tx=>({
    hash:tx.transaction_id,
    amount:fmtAmt(parseFloat(tx.value)/1e6,2),
    token:tx.token_info?.symbol||'USDT',
    date:fmtDate(tx.block_timestamp),
    status:'ok',
    to:short(tx.to,7),
  }));
}

const FETCHERS={sol:fetchSolana,eth:fetchEth,trc:fetchTron};

async function fetchAll() {
  if (cdTimer) clearInterval(cdTimer);
  const btn=document.getElementById('refreshBtn');
  btn.classList.add('loading'); btn.disabled=true;
  WALLETS.forEach(w=>{liveLoading[w.id]=true;liveErrors[w.id]=false;});
  renderAll();
  await Promise.all(WALLETS.map(async w=>{
    try { liveData[w.id]=await FETCHERS[w.id](w)||[]; liveErrors[w.id]=false; }
    catch(e) { console.error('['+w.id+']',e.message); liveErrors[w.id]=true; if(!liveData[w.id]) liveData[w.id]=[]; }
    liveLoading[w.id]=false; renderWallet(w); updateStats();
  }));
  btn.classList.remove('loading'); btn.disabled=false;
  document.getElementById('lastUpdated').textContent='Actualizado '+nowHM();
  startCountdown();
}

function startCountdown() {
  countdown=AUTO_REFRESH_SEC; updateCdUI();
  cdTimer=setInterval(()=>{countdown--;updateCdUI();if(countdown<=0)fetchAll();},1000);
}
function updateCdUI() { const el=document.getElementById('statCountdown'); if(el) el.textContent=countdown+'s'; }

function renderAll() {
  document.getElementById('walletsArea').innerHTML=WALLETS.map(w=>buildWalletHTML(w)).join('');
  updateStats();
}
function renderWallet(w) {
  const el=document.getElementById('section-'+w.id);
  if(el) el.outerHTML=buildWalletHTML(w); else renderAll();
  updateStats();
}

function buildWalletHTML(w) {
  const search=   (document.getElementById('searchBox')?.value||'').toLowerCase();
  const filterNet=document.getElementById('filterNet')?.value||'all';
  const filterSt= document.getElementById('filterStatus')?.value||'all';
  if(filterNet!=='all'&&filterNet!==w.id) return '';

  const manual=(manualTxs[w.id]||[]).map(t=>({...t,_manual:true}));
  let all=[...manual,...(liveData[w.id]||[])];
  if(filterSt!=='all') all=all.filter(t=>t.status===filterSt);
  if(search) all=all.filter(t=>(t.hash||'').toLowerCase().includes(search)||(t.amount||'').toString().includes(search)||(t.to||'').toLowerCase().includes(search));

  const loading=liveLoading[w.id], error=liveErrors[w.id];
  const confirmed=all.filter(t=>t.status==='ok').length;
  const totalUsdt=all.filter(t=>t.status==='ok').reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
  const STS={ok:'badge-ok',pend:'badge-pend',fail:'badge-fail'};
  const STL={ok:'Confirmado',pend:'Pendiente',fail:'Fallido'};

  let body='';
  if(loading) {
    body='<div class="loading-state"><div class="spinner"></div>Consultando blockchain…</div>';
  } else if(error&&!all.length) {
    body='<div class="error-state">No se pudo obtener datos.<br/><a href="'+w.explorer+'" target="_blank">Ver en '+w.label+' Explorer →</a></div>';
  } else if(!all.length) {
    body='<div class="empty-state">Sin retiros de USDT encontrados.</div>';
  } else {
    const rows=all.map(tx=>{
      const hCell=(tx.hash&&tx.hash!=='—')?'<a href="'+w.txUrl(tx.hash)+'" target="_blank">'+short(tx.hash,8)+'</a>':'<span>—</span>';
      const action=tx._manual
        ?'<button class="del-btn" onclick="removeMtx(\''+w.id+'\',\''+tx._id+'\')" title="Eliminar"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
        :'<a href="'+w.txUrl(tx.hash)+'" target="_blank" style="color:var(--text3);display:flex;align-items:center"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>';
      return '<div class="tx-row'+(tx._manual?' manual-row':'')+'"><div class="cell-hash">'+(tx._manual?'<span class="badge badge-manual">manual</span>':'')+hCell+'</div><div class="cell-from">'+(tx.to||'—')+'</div><div><span class="cell-amount">'+(tx.amount||'—')+'</span> <span class="cell-token">USDT</span></div><div><span class="badge '+(STS[tx.status]||'badge-pend')+'">'+(STL[tx.status]||'Pendiente')+'</span></div><div class="cell-date">'+(tx.date||'—')+'</div><div>'+action+'</div></div>';
    }).join('');
    body='<div class="tx-table"><div class="tx-head"><span>Hash / TxID</span><span>Destino</span><span>Monto</span><span>Estado</span><span>Fecha y hora</span><span></span></div>'+rows+'</div>';
    if(error) body+='<div style="padding:8px 18px;font-size:12px;color:#f87171;border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px">⚠ Datos parciales. <a href="'+w.explorer+'" target="_blank">Ver en explorer</a></div>';
  }

  const summary=all.length+' retiros · '+confirmed+' ✓'+(totalUsdt>0?' · $'+fmtAmt(totalUsdt,2)+' USDT':'');
  return '<div class="wallet-section" id="section-'+w.id+'"><div class="wallet-header"><span class="net-badge '+w.id+'">'+w.net+'</span><span class="wallet-addr" title="'+w.addr+'">'+w.addr+'</span><span class="wallet-count">'+summary+'</span><a class="wallet-link" href="'+w.explorer+'" target="_blank"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Explorer</a></div>'+body+'</div>';
}

function updateStats() {
  const all=WALLETS.flatMap(w=>[...(manualTxs[w.id]||[]),...(liveData[w.id]||[])]);
  const totalUsdt=all.filter(t=>t.status==='ok').reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
  document.getElementById('statTotal').textContent=all.length;
  document.getElementById('statOk').textContent=all.filter(t=>t.status==='ok').length;
  document.getElementById('statPend').textContent=all.filter(t=>t.status==='pend').length;
  const u=document.getElementById('statUsdt'); if(u) u.textContent='$'+fmtAmt(totalUsdt,2);
  const c=document.getElementById('statCountdown'); if(c) c.textContent=countdown+'s';
  document.getElementById('tickerStats').textContent=all.length+' retiros · $'+fmtAmt(totalUsdt,2)+' USDT total';
}

function addManual() {
  const wid=document.getElementById('mfWallet').value;
  const raw=document.getElementById('mfAmt').value.trim();
  const hash=document.getElementById('mfHash').value.trim();
  const status=document.getElementById('mfStatus').value;
  if(!raw){alert('Ingresá el monto');return;}
  if(!manualTxs[wid]) manualTxs[wid]=[];
  manualTxs[wid].unshift({_id:Date.now().toString(),hash:hash||'—',amount:fmtAmt(raw,2),token:'USDT',status,to:'manual',_manual:true,date:fmtDate(Date.now()/1000)});
  saveManual();
  document.getElementById('mfAmt').value='';
  document.getElementById('mfHash').value='';
  renderWallet(WALLETS.find(x=>x.id===wid));
}
function removeMtx(wid,mid) {
  if(!manualTxs[wid]) return;
  manualTxs[wid]=manualTxs[wid].filter(t=>t._id!==mid);
  saveManual(); renderWallet(WALLETS.find(x=>x.id===wid));
}
function toggleAddForm() { document.getElementById('addFormWrapper').classList.toggle('hidden'); }

renderAll();
fetchAll();
