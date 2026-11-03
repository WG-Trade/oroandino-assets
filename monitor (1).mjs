// Monitor de solo lectura: compara el estado real del token con lo esperado.
// No usa claves. Si algo cambia (o no se puede consultar la red), termina con error y GitHub avisa por correo.
const RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
];
const MINT = "GJWpbjqmS5rm6bQ6bWt7aKuAuzZccZAvzrKaXCEonV35";
const META = "5wM3okb8ozC2sqFWwByigBtd4brKDjK2xHEidBszStLD"; // cuenta de metadata del token
const SEGURA = "9f9pZ74F8kHAEsvTSPDDkaD7Z7V9RbW7j7cRuf1qxjXe";
const URI = "https://raw.githubusercontent.com/WG-Trade/oroandino-assets/main/metadata.json";

// Si emites tokens o cambias la metadata a propósito, actualiza estos valores aquí (queda registrado en el historial del repo).
const ESPERADO = {
  supply: "500000000000000",
  mintAuthority: SEGURA,
  freezeAuthority: null,
  updateAuthority: SEGURA,
  metadataMint: MINT,
  name: "Oroandino",
  symbol: "OROANDINO",
  uri: URI,
  isMutable: true,
};

const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(buf) {
  let n = BigInt("0x" + Buffer.from(buf).toString("hex"));
  let s = "";
  while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = "1" + s; else break; }
  return s;
}

// Decodifica la cuenta Metaplex Token Metadata (Borsh).
function parseMetadata(base64) {
  const buf = Buffer.from(base64, "base64");
  let o = 1; // byte 0 = key
  const key = () => { const k = b58(buf.subarray(o, o + 32)); o += 32; return k; };
  const str = () => {
    const len = buf.readUInt32LE(o); o += 4;
    const s = buf.subarray(o, o + len).toString("utf8").replace(/\0+$/g, ""); o += len;
    return s;
  };
  const updateAuthority = key();
  const mint = key();
  const name = str();
  const symbol = str();
  const uri = str();
  o += 2; // sellerFeeBasisPoints
  if (buf[o++] === 1) { const n = buf.readUInt32LE(o); o += 4 + n * 34; } // creators
  o += 1; // primarySaleHappened
  const isMutable = buf[o] === 1;
  return { updateAuthority, mint, name, symbol, uri, isMutable };
}

// Consulta una cuenta probando cada RPC con reintentos. Devuelve undefined si ninguno responde.
async function getAccount(params) {
  for (let i = 0; i < 3; i++) {
    for (const url of RPCS) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params }),
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) continue;
        const j = await r.json();
        if (j.result) return j.result.value; // null = la cuenta no existe
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
  }
  return undefined;
}

const mintAcc = await getAccount([MINT, { encoding: "jsonParsed" }]);
const metaAcc = await getAccount([META, { encoding: "base64" }]);
if (mintAcc === undefined || metaAcc === undefined) {
  console.error("ALERTA: no se pudo consultar ningún nodo RPC. No se pudo verificar el estado del token.");
  process.exit(1);
}
if (!mintAcc || !metaAcc) { console.error("ALERTA: no se encontró la cuenta del token o de su metadata."); process.exit(1); }

const info = mintAcc.data?.parsed?.info;
if (!info) { console.error("ALERTA: la cuenta del mint no tiene el formato esperado."); process.exit(1); }

let meta;
try { meta = parseMetadata(metaAcc.data[0]); }
catch { console.error("ALERTA: no se pudo leer la cuenta de metadata."); process.exit(1); }

const actual = {
  supply: info.supply,
  mintAuthority: info.mintAuthority ?? null,
  freezeAuthority: info.freezeAuthority ?? null,
  updateAuthority: meta.updateAuthority,
  metadataMint: meta.mint,
  name: meta.name,
  symbol: meta.symbol,
  uri: meta.uri,
  isMutable: meta.isMutable,
};

const cambios = Object.keys(ESPERADO).filter((k) => actual[k] !== ESPERADO[k]);
console.log(new Date().toISOString(), JSON.stringify(actual));
if (cambios.length) {
  for (const k of cambios) console.error(`ALERTA: ${k} cambió. Esperado: ${ESPERADO[k]} | Actual: ${actual[k]}`);
  process.exit(1);
}
console.log("Todo coincide con lo esperado.");
