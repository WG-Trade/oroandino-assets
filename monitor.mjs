// Monitor de solo lectura: compara el estado real del token con lo esperado.
// No usa claves. Si algo cambia, termina con error y GitHub avisa por correo.
const RPC = "https://api.mainnet-beta.solana.com";
const MINT = "GJWpbjqmS5rm6bQ6bWt7aKuAuzZccZAvzrKaXCEonV35";
const META = "5wM3okb8ozC2sqFWwByigBtd4brKDjK2xHEidBszStLD"; // cuenta de metadata del token
const SEGURA = "9f9pZ74F8kHAEsvTSPDDkaD7Z7V9RbW7j7cRuf1qxjXe";

// Si emites tokens a propósito, actualiza "supply" aquí (queda registrado en el historial del repo).
const ESPERADO = { supply: "500000000000000", mintAuthority: SEGURA, freezeAuthority: null, updateAuthority: SEGURA };

const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(buf) {
  let n = BigInt("0x" + Buffer.from(buf).toString("hex"));
  let s = "";
  while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = "1" + s; else break; }
  return s;
}
async function rpc(params) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params }) });
      const j = await r.json();
      if (j.result) return j.result.value;
    } catch {}
    await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
  }
  return undefined; // red no disponible: no es una alerta
}

const mintAcc = await rpc([MINT, { encoding: "jsonParsed" }]);
const metaAcc = await rpc([META, { encoding: "base64" }]);
if (mintAcc === undefined || metaAcc === undefined) {
  console.log("No se pudo consultar la red. Se reintentará en la próxima ejecución.");
  process.exit(0);
}
if (!mintAcc || !metaAcc) { console.error("ALERTA: no se encontró la cuenta del token o de su metadata."); process.exit(1); }

const info = mintAcc.data.parsed.info;
const update = b58(Buffer.from(metaAcc.data[0], "base64").subarray(1, 33));
const actual = { supply: info.supply, mintAuthority: info.mintAuthority ?? null, freezeAuthority: info.freezeAuthority ?? null, updateAuthority: update };

const cambios = Object.keys(ESPERADO).filter((k) => actual[k] !== ESPERADO[k]);
console.log(new Date().toISOString(), JSON.stringify(actual));
if (cambios.length) {
  for (const k of cambios) console.error(`ALERTA: ${k} cambió. Esperado: ${ESPERADO[k]} | Actual: ${actual[k]}`);
  process.exit(1);
}
console.log("Todo coincide con lo esperado.");
