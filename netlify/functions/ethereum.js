const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const addr = event.queryStringParameters?.addr || '';
    if (!addr.match(/^0x[0-9a-fA-F]{40}$/))
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'invalid address' }) };

    // Blockscout: token transfers for this address (includes USDT)
    let res = await fetch(
      `https://eth.blockscout.com/api/v2/addresses/${addr}/token-transfers?filter=from&token=${USDT}&page_size=50`
    );

    if (!res.ok) {
      // Fallback: Blockscout general token transfers
      res = await fetch(
        `https://eth.blockscout.com/api/v2/addresses/${addr}/token-transfers?filter=from&page_size=50`
      );
    }

    if (!res.ok) {
      // Fallback: Ethplorer token history
      res = await fetch(
        `https://api.ethplorer.io/getAddressHistory/${addr}?apiKey=freekey&type=transfer&token=${USDT}&limit=50`
      );
    }

    const data = await res.text();
    return { statusCode: 200, headers: CORS, body: data };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
