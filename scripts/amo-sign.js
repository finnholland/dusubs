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

  // Step 1: upload the XPI file to get an upload uuid
  const uploadForm = new FormData();
  uploadForm.append('upload', new Blob([fs.readFileSync(xpiPath)], { type: 'application/zip' }), xpiFiles[0]);
  uploadForm.append('channel', 'listed');

  const uploadResp = await fetch(
    'https://addons.mozilla.org/api/v5/addons/upload/',
    { method: 'POST', headers: { Authorization: `JWT ${makeJWT()}` }, body: uploadForm }
  );
  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    console.error(`Upload failed (HTTP ${uploadResp.status}): ${text}`);
    process.exit(1);
  }
  const uploadData = await uploadResp.json();
  const uploadUuid = uploadData.uuid;
  console.log(`Upload UUID: ${uploadUuid} — waiting for validation...`);

  // Step 2: poll until upload is validated
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const pollResp = await fetch(
      `https://addons.mozilla.org/api/v5/addons/upload/${uploadUuid}/`,
      { headers: { Authorization: `JWT ${makeJWT()}` } }
    );
    const pollData = await pollResp.json();
    console.log(`  [${i + 1}/12] processed=${pollData.processed} valid=${pollData.valid}`);
    if (pollData.processed) {
      if (!pollData.valid) {
        console.error('Validation failed:', JSON.stringify(pollData.validation));
        process.exit(1);
      }
      break;
    }
    if (i === 11) { console.error('Timed out waiting for validation'); process.exit(1); }
  }

  // Step 3: create the version using the upload uuid
  // Look up the addon's numeric ID first, as AMO's version creation endpoint
  // returns 404 when addressed by GUID in some cases.
  const addonResp = await fetch(
    `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(guid)}/`,
    { headers: { Authorization: `JWT ${makeJWT()}` } }
  );
  if (!addonResp.ok) {
    const text = await addonResp.text();
    console.error(`Addon lookup failed (HTTP ${addonResp.status}): ${text}`);
    process.exit(1);
  }
  const addonData = await addonResp.json();
  const addonId = addonData.id;
  console.log(`Addon numeric ID: ${addonId}`);

  const versionResp = await fetch(
    `https://addons.mozilla.org/api/v5/addons/addon/${addonId}/versions/`,
    {
      method: 'POST',
      headers: { Authorization: `JWT ${makeJWT()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload: uploadUuid }),
    }
  );
  if (!versionResp.ok) {
    const text = await versionResp.text();
    console.error(`Version creation failed (HTTP ${versionResp.status}): ${text}`);
    process.exit(1);
  }
  const versionData = await versionResp.json();
  console.log(`Version ${versionData.version} created — polling for signing...`);

  // Step 4: poll for signed file
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const resp = await fetch(
      `https://addons.mozilla.org/api/v5/addons/addon/${addonId}/versions/${encodeURIComponent(version)}/`,
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
