const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions(context) {
  return new Response(null, { headers: corsHeaders });
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payloadStr, signature] = parts;
  
  const data = `${header}.${payloadStr}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  
  let sigBase64 = signature.replace(/-/g, '+').replace(/_/g, '/');
  while (sigBase64.length % 4) sigBase64 += '=';
  const sigBytes = new Uint8Array(atob(sigBase64).split('').map(c => c.charCodeAt(0)));
  
  const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
  if (!isValid) return null;
  
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(payloadStr.replace(/-/g, '+').replace(/_/g, '/')))));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const token = authHeader.split(' ')[1];

  const githubToken = env.GITHUB_TOKEN;
  const githubOwner = env.GITHUB_OWNER;
  const githubRepo = env.GITHUB_REPO;
  const githubBranch = env.GITHUB_BRANCH || 'main';

  if (!githubToken || !githubOwner || !githubRepo) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const jwtSecret = env.JWT_SECRET || await sha256(githubToken);
  const payload = await verifyJWT(token, jwtSecret);
  
  if (!payload || !payload.username) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { oldPassword, newPassword } = body;
  if (!oldPassword || !newPassword) {
    return new Response(JSON.stringify({ error: 'Old and new passwords required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const usersUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/data/users.json?ref=${githubBranch}`;
  const githubHeaders = {
    Authorization: `token ${githubToken}`,
    'User-Agent': 'Cloudflare-Pages-eco-enzim'
  };

  let users = [];
  let fileSha = '';
  
  try {
    const usersResponse = await fetch(usersUrl, { headers: githubHeaders, cache: 'no-store' });
    if (usersResponse.ok) {
      const data = await usersResponse.json();
      fileSha = data.sha;
      const content = atob(data.content);
      users = JSON.parse(content);
    } else {
      return new Response(JSON.stringify({ error: 'Failed to read user data' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to read user data' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const userIndex = users.findIndex(u => u.username === payload.username);
  if (userIndex === -1) {
    return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const oldHashed = await sha256(oldPassword);
  if (users[userIndex].hash !== oldHashed) {
    return new Response(JSON.stringify({ error: 'Incorrect old password' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  users[userIndex].hash = await sha256(newPassword);

  const encodeUtf8Base64 = (text) => btoa(unescape(encodeURIComponent(text)));
  
  const putResponse = await fetch(usersUrl.split('?')[0], {
    method: 'PUT',
    headers: { ...githubHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Update password for ${payload.username} from Cloudflare`,
      content: encodeUtf8Base64(JSON.stringify(users, null, 2)),
      sha: fileSha,
      branch: githubBranch
    }),
    cache: 'no-store'
  });

  if (!putResponse.ok) {
    return new Response(JSON.stringify({ error: 'Failed to save new password to GitHub' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ success: true, message: 'Password updated successfully' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}
