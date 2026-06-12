// Signs the Firefox XPI via the AMO REST API, bypassing the local web-ext linter.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.AMO_API_KEY;
const API_SECRET = process.env.AMO_API_SECRET;

if (!API_KEY || !API_SECRET) {
  console.error('AMO_API_KEY and AMO_API_SECRET must be set');
  process.exit(1);
}

function makeJWT() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: API_KEY, jti: crypto.randomUUID(), iat: now, exp: now + 60,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', API_SECRET)
    .update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
  const version = manifest.version;
  const guid = manifest.browser_specific_settings?.gecko?.id;
  if (!guid) { console.error('Missing browser_specific_settings.gecko.id in manifest.json'); process.exit(1); }

  const xpiFiles = fs.readdirSync('./artifacts-firefox').filter(f => f.endsWith('.xpi'));
  if (!xpiFiles.length) { console.error('No XPI in ./artifacts-firefox'); process.exit(1); }
  const xpiPath = path.join('./artifacts-firefox', xpiFiles[0]);
  console.log(`Uploading ${xpiPath} (${guid} v${version})...`);

  const form = new FormData();
  form.append('upload', new Blob([fs.readFileSync(xpiPath)], { type: 'application/zip' }), xpiFiles[0]);

  const uploadResp = await fetch(
    `https://addons.mozilla.org/api/v5/addons/${encodeURIComponent(guid)}/versions/${encodeURIComponent(version)}/`,
    { method: 'PUT', headers: { Authorization: `JWT ${makeJWT()}` }, body: form }
  );
  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    console.error(`Upload failed (HTTP ${uploadResp.status}): ${text}`);
    process.exit(1);
  }
  console.log('Uploaded — polling for signing...');

  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const resp = await fetch(
      `https://addons.mozilla.org/api/v5/addons/${encodeURIComponent(guid)}/versions/${encodeURIComponent(version)}/`,
      { headers: { Authorization: `JWT ${makeJWT()}` } }
    );
    const data = await resp.json();
    const file = data.files?.[0];
    console.log(`  [${i + 1}/24] status=${file?.status ?? 'pending'}`);
    if (file?.status === 'public' && file?.download_url) {
      const dlResp = await fetch(file.download_url, { headers: { Authorization: `JWT ${makeJWT()}` } });
      fs.writeFileSync(xpiPath, Buffer.from(await dlResp.arrayBuffer()));
      console.log(`Signed XPI saved: ${xpiPath}`);
      return;
    }
  }
  console.error('Timed out waiting for signing');
  process.exit(1);
}

main();
