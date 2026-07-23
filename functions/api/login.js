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

function base64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJWT(payload, secret) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  const data = `${header}.${payloadStr}`;
  
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const signatureBytes = new Uint8Array(signatureBuffer);
  const signatureBase64 = btoa(String.fromCharCode(...signatureBytes));
  const signature = signatureBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  
  return `${data}.${signature}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
    });
  }

  const { username, password } = body;
  if (!username || !password) {
    return new Response(JSON.stringify({ error: 'Username and password required' }), { 
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
    });
  }

  const githubToken = env.GITHUB_TOKEN;
  const githubOwner = env.GITHUB_OWNER;
  const githubRepo = env.GITHUB_REPO;
  const githubBranch = env.GITHUB_BRANCH || 'main';

  if (!githubToken || !githubOwner || !githubRepo) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { 
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
    });
  }

  const usersUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/data/users.json?ref=${githubBranch}`;
  let users = [];
  try {
    const usersResponse = await fetch(usersUrl, { 
      headers: { 
        Authorization: `token ${githubToken}`,
        'User-Agent': 'Cloudflare-Pages-eco-enzim'
      },
      cache: 'no-store'
    });
    
    if (usersResponse.ok) {
      const data = await usersResponse.json();
      const content = atob(data.content);
      users = JSON.parse(content);
    }
  } catch (e) {
    console.error("Failed to read users.json", e);
  }

  const user = users.find(u => u.username === username);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), { 
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
    });
  }

  const hashedPassword = await sha256(password);
  if (user.hash !== hashedPassword) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), { 
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } 
    });
  }

  const jwtSecret = env.JWT_SECRET || await sha256(githubToken);
  const token = await signJWT({
    username: user.username,
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24)
  }, jwtSecret);

  return new Response(JSON.stringify({ token, message: 'Login successful' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}
