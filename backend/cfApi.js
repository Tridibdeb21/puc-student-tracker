const crypto = require("crypto");

function generateSig(method, params, apiKey, secret) {
    const rand = Math.random().toString().slice(2, 8);
    const time = Math.floor(Date.now() / 1000);

    params.apiKey = apiKey;
    params.time = time;

    const query = Object.keys(params)
        .sort()
        .map(k => `${k}=${params[k]}`)
        .join("&");

    const base = `${rand}/${method}?${query}#${secret}`;
    const hash = crypto.createHash("sha512").update(base).digest("hex");

    return `${rand}${hash}`;
}

module.exports = generateSig;
