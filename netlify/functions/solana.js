// Multiple Solana RPC endpoints as fallback
const RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-api.projectserum.com',
  'https://rpc.ankr.com/solana',
];

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const body = event.body;
  let lastError = '';

  for (const rpc of RPC_ENDPOINTS) {
    try {
      const r = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!r.ok) { lastError = `${rpc} HTTP ${r.status}`; continue; }
      const data = await r.text();
      return { statusCode: 200, headers: CORS, body: data };
    } catch(e) {
      lastError = `${rpc}: ${e.message}`;
    }
  }

  return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: lastError }) };
};
