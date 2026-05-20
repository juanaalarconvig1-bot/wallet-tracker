exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  try {
    const addr = event.queryStringParameters?.addr || '';
    if (!addr.match(/^0x[0-9a-fA-F]{40}$/)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'invalid address' }) };
    }

    // Try Blockscout first
    let res = await fetch(
      `https://eth.blockscout.com/api/v2/addresses/${addr}/transactions?filter=to%20%7C%20from&page_size=20`
    );

    if (!res.ok) {
      // Fallback to Ethplorer
      res = await fetch(
        `https://api.ethplorer.io/getAddressTransactions/${addr}?apiKey=freekey&limit=20&showZeroValues=1`
      );
    }

    const data = await res.text();
    return { statusCode: 200, headers: CORS, body: data };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
