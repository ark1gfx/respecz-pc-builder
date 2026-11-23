# Ark: ipunin ang mga tanong na hindi nasagot

Kapag hindi nasagot ni Ark ang isang tanong, o pinindot ng visitor ang "Hindi ito ang hinahanap ko", ise-save ang tanong sa isang Google Sheet. Tuwing Lunes, may email ka na may buod ng linggo, para alam mo kung ano ang idadagdag.

Hangga't walang laman ang `LOG_URL` sa `js/contact.js`, **walang pinapadala kahit saan**.

## Ano ang sine-save

| Column | Halimbawa |
|---|---|
| Kailan | 2026-11-24 14:03 |
| Uri | Walang sagot / Hindi sigurado / Hindi nakatulong |
| Tanong | "kaya ba ng 500w ang rx 9070 xt" |
| Part | gpu (kung may napiling part kay Ark) |
| Sagot na lumabas | id ng sagot (para sa "Hindi nakatulong") |
| Page | /troubleshoot/ |
| Tapos | ikaw ang maglalagay ng ✓ kapag naidagdag na |

Walang pangalan at walang IP address. Bago ipadala ang tanong, tinatanggal ng site ang email, numero ng cellphone, mahahabang numero at links.

## Setup (isang beses, mga 5 minuto)

1. Gumawa ng bagong Google Sheet, hal. **"Ark – mga tanong"**.
2. Sa Sheet: **Extensions → Apps Script**. Burahin ang laman ng `Code.gs` at i-paste ang buong laman ng [`Code.gs`](Code.gs) dito. I-save.
3. **Deploy → New deployment → Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
   - I-click ang **Deploy**, at i-allow ang permissions (Sheets at Gmail lang ang hinihingi).
4. Kopyahin ang **Web app URL** (nagtatapos sa `/exec`) at ilagay sa `js/contact.js`:
   ```js
   export const LOG_URL = 'https://script.google.com/macros/s/…/exec';
   ```
5. Sa Apps Script, piliin ang **`installWeeklyTrigger`** sa toolbar at i-click ang **Run** (isang beses lang). Ise-send nito ang buod tuwing Lunes, mga 9 AM, sa Google account na may-ari ng Sheet.
6. Patakbuhin ang `npm run pages` at i-push.

7. *(Para sa ReSpecz Studio → Website view)* Sa Apps Script: **Project Settings → Script properties → Add**, `ARK_KEY` = isang mahabang random na password. Ilagay ang parehong value sa `herk-edit-kit/.env` bilang `ARK_SHEET_KEY=…`. I-deploy ulit bilang **New version**. Ang dashboard lang ang makakabasa ng listahan.

Para ma-test: i-type kay Ark ang isang bagay na wala sa alam niya. Dapat may bagong row sa tab na **Tanong** sa loob ng ilang segundo.

## Lingguhang review

1. Buksan ang email o ang Sheet.
2. Para sa bawat madalas na tanong:
   - May sagot na pero hindi nahanap ni Ark? Idagdag ang salita sa `alt` o `keys` ng entry sa `data/ark.json`.
   - Wala pang sagot? Magdagdag ng bagong entry. Kung problema ito sa PC, idagdag din sa `data/troubleshoot.json`.
3. Patakbuhin ang `npm test`. Sinisigurado nito na walang sirang link, dead end o maling category.
4. Lagyan ng ✓ ang **Tapos** column.

## Kapag binago ang Code.gs

Sa Apps Script: **Deploy → Manage deployments → Edit (lapis) → Version: New version → Deploy**. Hindi magbabago ang URL.
