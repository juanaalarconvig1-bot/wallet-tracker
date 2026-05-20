const USDT_TRC = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const addr = event.queryStringParameters?.addr || '';
  if (!addr) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'missing addr' }) };

  const errors = [];

  // 1) Trongrid TRC20 transfers — reliable, no key needed
  try {
    const url = `https://api.trongrid.io/v1/accounts/${addr}/transactions/trc20?limit=50&contract_address=${USDT_TRC}&only_from=true`;
    const r = await fetch(url, { headers: { 'TRON-PRO-API-KEY': '' } });
    const d = await r.json();
    if (Array.isArray(d.data)) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ source: 'trongrid', data: d.data }) };
    }
    errors.push('trongrid: ' + JSON.stringify(d).slice(0, 100));
  } catch(e) { errors.push('trongrid: ' + e.message); }

  // 2) Tronscan token transfers
  try {
    const url = `https://apilist.tronscanapi.com/api/token_trc20/transfers?limit=50&start=0&sort=-timestamp&relatedAddress=${addr}&contract_address=${USDT_TRC}&direction=out`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const d = await r.json();
    if (d.token_transfers || d.data) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ source: 'tronscan', data: d.token_transfers || d.data }) };
    }
    errors.push('tronscan: ' + JSON.stringify(d).slice(0, 100));
  } catch(e) { errors.push('tronscan: ' + e.message); }

  return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'all sources failed', details: errors }) };
};
