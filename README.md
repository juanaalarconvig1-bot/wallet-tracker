# Crypto Withdrawal Tracker

Dashboard para seguir retiros de wallets en Solana, Ethereum y TRON.

## Wallets configuradas
- **SOL** → `3haEN5yaXJjaDEisdNBWVU8CFUGccvgEVGw7EoJyYAyg`
- **ETH** → `0x4647fc3bd5ddEd9b88b3DC677779a23a1ffE55C2`
- **TRC20** → `TPxwVSUYcxhAn2NtYPwyJMMdFgUSYvQn6M`

## Cómo deployar en Netlify (gratis)

### Opción A — Drag & Drop (más fácil, sin cuenta GitHub)
1. Entrá a https://app.netlify.com/drop
2. Arrastrá la carpeta `wallet-tracker` completa
3. ¡Listo! Te da una URL tipo `https://nombre-random.netlify.app`

### Opción B — Con cuenta GitHub
1. Subí estos archivos a un repositorio en GitHub
2. Entrá a https://app.netlify.com → "Add new site" → "Import from Git"
3. Seleccioná el repo → dejá todo por defecto → "Deploy"

## Archivos del proyecto
```
wallet-tracker/
├── index.html      ← página principal
├── style.css       ← estilos (tema oscuro)
├── app.js          ← lógica: fetch APIs + auto-refresh
├── netlify.toml    ← config de headers
└── README.md       ← este archivo
```

## Funcionalidades
- Se actualiza automáticamente cada 60 segundos
- Muestra últimas 15 txs por wallet
- Filtros por red y estado
- Búsqueda por hash / token
- Retiros manuales guardados en localStorage
- Links directos a cada explorador (Solscan, Etherscan, Tronscan)

## Nota sobre las APIs
Las APIs públicas tienen límites de tasa (rate limits). Si ves errores,
esperá 1-2 minutos y se recuperan solas. Para mayor confiabilidad podés
registrarte gratis en Etherscan y reemplazar `YourApiKeyToken` en `app.js`.
