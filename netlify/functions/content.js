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

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  'Content-Type': 'application/json; charset=utf-8'
};

function jsonResponse(body, status = 200) {
  return {
    status,
    headers: NO_STORE_HEADERS,
    body: JSON.stringify(body, null, 2)
  };
}

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

async function getContentFromGitHub(env) {
  const owner = env.GITHUB_OWNER || env.GITHUB_REPOSITORY_OWNER;
  const repo = env.GITHUB_REPO || env.GITHUB_REPOSITORY;
  const path = env.CONTENT_FILE_PATH || 'data/content.json';
  const branch = env.GITHUB_BRANCH || 'main';

  if (!owner || !repo || !env.GITHUB_TOKEN) {
    return null;
  }

  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github.raw+json' } });
  if (!response.ok) {
    return null;
  }

  return response.json();
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
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
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
    const errorText = await response.text();
    throw new Error(`Failed to persist content: ${response.status} ${errorText}`);
  }

  return response.json();
}

exports.handler = async function (event, context) {
  try {
    if (event.httpMethod === 'GET') {
      const remoteContent = await getContentFromGitHub(process.env);
      const content = remoteContent || DEFAULT_CONTENT;
      return jsonResponse(content);
    }

    if (event.httpMethod === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      const content = body.content || DEFAULT_CONTENT;
      const saved = await saveContentToGitHub(process.env, content);

      if (!saved) {
        return jsonResponse({ error: 'No GitHub storage configured' }, 503);
      }

      return jsonResponse(content);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Unexpected error' }, 500);
  }
};
