export async function onRequestPost(context) {
  const { request, env } = context;
  const githubToken = env.GITHUB_TOKEN;
  const githubOwner = env.GITHUB_OWNER;
  const githubRepo = env.GITHUB_REPO;
  const githubBranch = env.GITHUB_BRANCH || 'main';
  const contentFilePath = env.CONTENT_FILE_PATH || 'data/content.json';

  if (!githubToken || !githubOwner || !githubRepo) {
    return new Response(JSON.stringify({ error: 'GitHub secrets not configured in Cloudflare.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Request body must be valid JSON.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!body || typeof body !== 'object' || !body.texts || !body.images) {
    return new Response(JSON.stringify({ error: 'Payload must include texts and images.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${contentFilePath}`;
  const headers = {
    Authorization: `token ${githubToken}`,
    'Content-Type': 'application/json'
  };

  const shaResponse = await fetch(apiUrl + `?ref=${githubBranch}`, {
    headers,
    cache: 'no-store'
  });

  if (!shaResponse.ok) {
    const errorData = await shaResponse.json().catch(() => ({}));
    return new Response(JSON.stringify({ error: 'Failed to read content file from GitHub.', details: errorData }), {
      status: shaResponse.status || 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const shaData = await shaResponse.json();
  const sha = shaData.sha;
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
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
