const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const addr = (event.queryStringParameters?.addr || '').toLowerCase();
  if (!addr.match(/^0x[0-9a-f]{40}$/))
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'invalid address' }) };

  const errors = [];

  // 1) Etherscan tokentx — free, no key needed for low volume
  try {
    const url = `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${USDT}&address=${addr}&sort=desc&offset=50&page=1`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const d = await r.json();
    if (d.status === '1' && Array.isArray(d.result)) {
      const out = d.result.filter(tx => tx.from.toLowerCase() === addr);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ source: 'etherscan', items: out }) };
    }
    errors.push('etherscan: ' + (d.message || d.result));
  } catch(e) { errors.push('etherscan: ' + e.message); }

  // 2) Blockscout token-transfers
  try {
    const url = `https://eth.blockscout.com/api/v2/addresses/${addr}/token-transfers?token=${USDT}&filter=from&page_size=50`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.items?.length >= 0) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ source: 'blockscout', items: d.items }) };
    }
    errors.push('blockscout: no items');
  } catch(e) { errors.push('blockscout: ' + e.message); }

  return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'all sources failed', details: errors }) };
};
