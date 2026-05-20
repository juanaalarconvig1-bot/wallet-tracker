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
    if (!addr) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'missing addr' }) };
    }

    // Try Tronscanapi first
    let res = await fetch(
      `https://apilist.tronscanapi.com/api/transaction?address=${addr}&count=20&start=0&filterTokenValue=0`
    );

    if (!res.ok) {
      // Fallback: Trongrid
      res = await fetch(
        `https://api.trongrid.io/v1/accounts/${addr}/transactions?limit=20&order_by=block_timestamp,desc`
      );
    }

    const data = await res.text();
    return { statusCode: 200, headers: CORS, body: data };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
