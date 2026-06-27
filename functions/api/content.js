function toBase64(input) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input).toString('base64');
  }

  const bytes = new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

const DEFAULT_CONTENT = {
  texts: {
    heroBadge: 'Gerakan warga · Ramah lingkungan · Gotong royong',
    heroHeadline: 'Eco Enzim Rumahan: Dari Demangan, Untuk Bumi.',
    heroSubtext: 'Solusi alami dari sisa dapur dan limbah organik yang diolah bersama oleh warga Dusun Demangan, Desa Mojoarum.',
    aboutTitle: 'Eco enzim yang bermanfaat, aman, dan dekat dengan rumah.',
    aboutText: 'Eco enzim adalah cairan serbaguna yang dihasilkan dari fermentasi sisa sayur, buah, gula (molase), dan air. Produk buatan ibu-ibu Dusun Demangan ini membantu membersihkan rumah, menyuburkan tanaman, dan menjaga lingkungan tetap sehat.',
    aboutNote: 'Diproduksi secara gotong royong, aman untuk lingkungan, dan mudah dibuat di skala rumah tangga.',
    quoteText: '“Dari dapur rumah, untuk kebersihan lingkungan.”',
    compositionTitle: 'Dibuat dari 100% Bahan <span class="accent">Alami</span>',
    compositionText: 'Setiap bahan dipilih dengan tujuan sederhana: memanfaatkan limbah organik menjadi sesuatu yang bermanfaat.',
    compositionRatio: 'Rasio umum pembuatan: <strong>1 : 3 : 10</strong> (molase : bahan organik : air)',
    docsTitle: 'Proses gotong royong warga Demangan',
    docsText: 'Melihat langsung proses pemotongan, pencampuran, hingga pengemasan membuat semangat kebersamaan semakin terasa.',
    galleryCaption: 'Klik foto untuk mengganti dengan foto dokumentasi Anda.',
    ctaTitle: 'Program Pembagian <span class="big-red">GRATIS</span> untuk Warga!',
    ctaText: 'Produk ini siap dibagikan khusus untuk masyarakat dan ibu-ibu PKK Dusun Demangan.'
  },
  images: {
    logo: 'assets/images/Logo.png',
    product: 'assets/images/product.jpg',
    gallery1: 'assets/images/galeri-1.jpg',
    gallery2: 'assets/images/galeri-2.jpeg',
    gallery3: 'assets/images/galeri-3.jpg'
  }
};

async function getContentFromGitHub(env) {
  const owner = env.GITHUB_OWNER || env.GITHUB_REPOSITORY_OWNER;
  const repo = env.GITHUB_REPO || env.GITHUB_REPOSITORY;
  const path = env.CONTENT_FILE_PATH || 'data/content.json';
  const branch = env.GITHUB_BRANCH || 'main';

  if (!owner || !repo || !env.GITHUB_TOKEN) {
    return null;
  }

  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const response = await fetch(url, { headers: { 'Accept': 'application/vnd.github.raw+json' } });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data;
}

async function saveContentToGitHub(env, content) {
  const owner = env.GITHUB_OWNER || env.GITHUB_REPOSITORY_OWNER;
  const repo = env.GITHUB_REPO || env.GITHUB_REPOSITORY;
  const path = env.CONTENT_FILE_PATH || 'data/content.json';
  const branch = env.GITHUB_BRANCH || 'main';

  if (!owner || !repo || !env.GITHUB_TOKEN) {
    return null;
  }

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };

  const existing = await fetch(apiUrl, { headers });
  let sha = null;
  if (existing.ok) {
    const data = await existing.json();
    sha = data.sha;
  }

  const body = {
    message: 'Update Eco Enzim content from admin panel',
    content: toBase64(JSON.stringify(content, null, 2)),
    branch
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error('Failed to persist content');
  }

  return await response.json();
}

export async function onRequestGet({ env }) {
  const remoteContent = await getContentFromGitHub(env);
  const content = remoteContent || DEFAULT_CONTENT;
  return new Response(JSON.stringify(content), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const content = body.content || DEFAULT_CONTENT;
    const saved = await saveContentToGitHub(env, content);

    if (!saved) {
      return new Response(JSON.stringify({ error: 'No GitHub storage configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    return new Response(JSON.stringify(content), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
