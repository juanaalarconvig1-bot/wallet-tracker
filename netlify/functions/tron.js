const USDT_TRC = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const addr = event.queryStringParameters?.addr || '';
    if (!addr) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'missing addr' }) };

    // Tronscan: TRC20 token transfers OUT for USDT specifically
    let res = await fetch(
      `https://apilist.tronscanapi.com/api/token_trc20/transfers?limit=50&start=0&sort=-timestamp&count=true&filterTokenValue=1&relatedAddress=${addr}&contract_address=${USDT_TRC}&direction=out`
    );

    if (!res.ok) {
      // Fallback: general transfers filtered by token
      res = await fetch(
        `https://apilist.tronscanapi.com/api/transaction?address=${addr}&count=50&start=0&token=${USDT_TRC}`
      );
    }

    if (!res.ok) {
      // Fallback: Trongrid TRC20 transfers
      res = await fetch(
        `https://api.trongrid.io/v1/accounts/${addr}/transactions/trc20?limit=50&contract_address=${USDT_TRC}&only_from=true`
      );
    }

    const data = await res.text();
    return { statusCode: 200, headers: CORS, body: data };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
