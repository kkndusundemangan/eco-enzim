const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions(context) {
  return new Response(null, {
    headers: corsHeaders,
  });
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
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
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
  } catch (e) { return null; }
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
  const contentFilePath = env.CONTENT_FILE_PATH || 'data/content.json';

  if (!githubToken || !githubOwner || !githubRepo) {
    return new Response(JSON.stringify({ 
      error: 'GitHub secrets not configured in Cloudflare.',
      debug: {
        hasToken: !!githubToken,
        hasOwner: !!githubOwner,
        hasRepo: !!githubRepo,
        envKeys: Object.keys(env || {})
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const jwtSecret = env.JWT_SECRET || await sha256(githubToken);
  const payloadData = await verifyJWT(token, jwtSecret);
  
  if (!payloadData || !payloadData.username) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Request body must be valid JSON.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  if (!body || typeof body !== 'object' || !body.texts || !body.images) {
    return new Response(JSON.stringify({ error: 'Payload must include texts and images.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const apiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${contentFilePath}`;
  const headers = {
    Authorization: `token ${githubToken}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Cloudflare-Pages-eco-enzim'
  };

  const treeUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/git/trees/${githubBranch}?recursive=1`;
  const treeResponse = await fetch(treeUrl, {
    headers,
    cache: 'no-store'
  });

  let sha;
  if (!treeResponse.ok) {
    const rawText = await treeResponse.text().catch(() => '');
    let errorData = {};
    try { errorData = JSON.parse(rawText); } catch(e) {}
    return new Response(JSON.stringify({ 
      error: 'Failed to read repository tree from GitHub.', 
      status: treeResponse.status,
      rawText: rawText.substring(0, 500),
      details: errorData 
    }), {
      status: treeResponse.status || 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } else {
    const treeData = await treeResponse.json();
    const fileNode = treeData.tree.find(node => node.path === contentFilePath);
    if (fileNode) {
      sha = fileNode.sha;
    }
  }

  const payload = {
    texts: body.texts,
    images: body.images,
    galleryItems: body.galleryItems,
    videoItems: body.videoItems,
    updatedAt: new Date().toISOString()
  };

  const encodeUtf8Base64 = (text) => {
    // encodeURIComponent throws on very large strings, and unescape is deprecated.
    // Use TextEncoder and chunked fromCharCode instead.
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const chunk = 0x8000; // 32768
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  };

  const putResponse = await fetch(apiUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Update content from Cloudflare at ${new Date().toISOString()}`,
      content: encodeUtf8Base64(JSON.stringify(payload, null, 2)),
      sha,
      branch: githubBranch
    }),
    cache: 'no-store'
  });

  if (!putResponse.ok) {
    const errorData = await putResponse.json().catch(() => ({}));
    return new Response(JSON.stringify({ error: 'Failed to write content to GitHub.', details: errorData }), {
      status: putResponse.status || 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}
