const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions(context) {
  return new Response(null, {
    headers: corsHeaders,
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
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
    updatedAt: new Date().toISOString()
  };

  const encodeUtf8Base64 = (text) => {
    return btoa(unescape(encodeURIComponent(text)));
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
