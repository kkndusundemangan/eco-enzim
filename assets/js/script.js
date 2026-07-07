document.addEventListener('DOMContentLoaded', function () {
  const ownerMode = new URLSearchParams(window.location.search).get('owner') === 'demangan2026' || sessionStorage.getItem('ecoEnzimAdmin') === 'true' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const ownerTools = document.getElementById('owner-tools');
  const fileInput = document.getElementById('img-file-input');
  const saveStatus = document.getElementById('save-status');
  let currentTarget = null;
  let editingText = false;
  let saveTimer = null;
  const state = {
    texts: {},
    images: {}
  };

  // GitHub API Configuration
  const GITHUB_CONFIG = {
    owner: 'kkndusudemangan',
    repo: 'eco-enzim',
    branch: 'main',
    path: 'data/content.json',
    token: '' // Akan diisi dari localStorage jika ada
  };

  const getGitHubToken = () => {
    return localStorage.getItem('githubToken') || GITHUB_CONFIG.token;
  };

  if (ownerTools) {
    ownerTools.hidden = !ownerMode;
  }

  const clearAdminSession = () => {
    sessionStorage.removeItem('ecoEnzimAdmin');
    localStorage.removeItem('ecoEnzimAdmin');
  };

  const setSaveStatus = (message, isError = false) => {
    if (saveStatus) {
      saveStatus.textContent = message;
      saveStatus.style.color = isError ? '#b45309' : '#0f766e';
    }
  };

  const setEditingState = () => {
    document.querySelectorAll('.editable-text').forEach((el) => {
      el.contentEditable = editingText && ownerMode ? 'true' : 'false';
      el.classList.toggle('is-editing', editingText && ownerMode);
    });
    const toggleBtn = document.getElementById('toggle-edit-text');
    if (toggleBtn) {
      toggleBtn.textContent = editingText && ownerMode ? 'Selesai edit narasi' : 'Edit narasi';
    }
  };

  const buildDefaultState = () => {
    document.querySelectorAll('.editable-text').forEach((el) => {
      const key = el.getAttribute('data-edit-key');
      if (key) {
        state.texts[key] = el.innerHTML;
      }
    });

    document.querySelectorAll('.editable-image').forEach((img) => {
      const key = img.getAttribute('data-image-key');
      if (key) {
        state.images[key] = img.getAttribute('src') || '';
      }
    });
  };

  const mergeState = (payload) => {
    if (payload && payload.texts) {
      state.texts = { ...state.texts, ...payload.texts };
    }
    if (payload && payload.images) {
      state.images = { ...state.images, ...payload.images };
    }
  };

  const applyStateToDom = () => {
    document.querySelectorAll('.editable-text').forEach((el) => {
      const key = el.getAttribute('data-edit-key');
      if (key && state.texts[key] !== undefined) {
        el.innerHTML = state.texts[key];
      }
    });

    document.querySelectorAll('.editable-image').forEach((img) => {
      const key = img.getAttribute('data-image-key');
      if (key && state.images[key]) {
        img.src = state.images[key];
      }
    });
  };

  const persistLocalFallback = () => {
    Object.entries(state.texts).forEach(([key, value]) => {
      localStorage.setItem(`ecoEnzimText:${key}`, value);
    });
    Object.entries(state.images).forEach(([key, value]) => {
      localStorage.setItem(`ecoEnzimAsset:${key}`, value);
    });
  };

  const saveContent = async () => {
    const payload = {
      texts: state.texts,
      images: state.images,
      updatedAt: new Date().toISOString()
    };

    setSaveStatus('Menyimpan ke GitHub...');

    try {
      const token = getGitHubToken();
      if (!token) {
        throw new Error('GitHub token tidak ditemukan. Pastikan Anda sudah set GITHUB_TOKEN di localStorage');
      }

      const apiUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;
      
      // 1. GET current file sha
      const getResponse = await fetch(apiUrl + `?ref=${GITHUB_CONFIG.branch}`, {
        headers: { Authorization: `token ${token}` },
        cache: 'no-store'
      });

      if (!getResponse.ok) {
        throw new Error('Gagal membaca file dari GitHub');
      }

      const fileData = await getResponse.json();
      const currentSha = fileData.sha;

      // 2. PUT updated content
      const newContent = btoa(JSON.stringify(payload, null, 2));
      const putResponse = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Update content at ${new Date().toISOString()}`,
          content: newContent,
          sha: currentSha,
          branch: GITHUB_CONFIG.branch
        }),
        cache: 'no-store'
      });

      if (!putResponse.ok) {
        throw new Error('Gagal menyimpan ke GitHub');
      }

      persistLocalFallback();
      setSaveStatus('Tersimpan ke GitHub dan siap dipakai di semua perangkat.');
      return true;
    } catch (error) {
      persistLocalFallback();
      setSaveStatus(`Gagal menyimpan ke GitHub: ${error.message}. Periksa GitHub token.`, true);
      return false;
    }
  };

  const scheduleSave = () => {
    if (!ownerMode) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveContent();
    }, 400);
  };

  const loadContent = async () => {
    buildDefaultState();

    try {
      const token = getGitHubToken();
      if (!token) {
        throw new Error('GitHub token tidak ditemukan');
      }

      const apiUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;
      const response = await fetch(apiUrl + `?ref=${GITHUB_CONFIG.branch}`, {
        headers: { Authorization: `token ${token}` },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error('Tidak bisa membaca dari GitHub');
      }

      const fileData = await response.json();
      const content = JSON.parse(atob(fileData.content));
      
      if (content && content.texts) {
        mergeState(content);
      }
    } catch (error) {
      setSaveStatus('Mode preview lokal aktif: GitHub token belum dikonfigurasi.', true);
      const legacyTexts = {};
      const legacyImages = {};
      document.querySelectorAll('.editable-text').forEach((el) => {
        const key = el.getAttribute('data-edit-key');
        if (!key) return;
        const savedText = localStorage.getItem(`ecoEnzimText:${key}`);
        if (savedText) {
          legacyTexts[key] = savedText;
        }
      });
      document.querySelectorAll('.editable-image').forEach((img) => {
        const key = img.getAttribute('data-image-key');
        if (!key) return;
        const savedValue = localStorage.getItem(`ecoEnzimAsset:${key}`);
        if (savedValue) {
          legacyImages[key] = savedValue;
        }
      });
      mergeState({ texts: legacyTexts, images: legacyImages });
    }

    applyStateToDom();
  };

  if (ownerMode) {
    document.querySelectorAll('.owner-trigger').forEach((button) => {
      button.addEventListener('click', () => {
        currentTarget = button.dataset.target;
        fileInput.click();
      });
    });

    const toggleBtn = document.getElementById('toggle-edit-text');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async () => {
        editingText = !editingText;
        setEditingState();
        if (!editingText) {
          const saved = await saveContent();
          if (saved) {
            alert('Perubahan narasi dan gambar sudah disimpan untuk publik.');
          } else {
            alert('Penyimpanan online gagal. Periksa konfigurasi hosting/serverless dan deploy ulang. Perubahan hanya tersimpan di browser Anda saat ini.');
          }
        }
      });
    }
  }

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !currentTarget) return;
    const ext = file.name.split('.').pop().toLowerCase();
    const safeName = `${currentTarget}-${Date.now()}.${ext}`;
    const reader = new FileReader();
    reader.onload = function (ev) {
      const dataUrl = ev.target.result;
      const targetElement = document.querySelector(`[data-image-key="${currentTarget}"]`) || document.getElementById(currentTarget);
      if (targetElement) {
        targetElement.src = dataUrl;
        targetElement.dataset.previewName = safeName;
        targetElement.setAttribute('title', `Preview: ${safeName}`);
      }
      state.images[currentTarget] = dataUrl;
      persistLocalFallback();
      scheduleSave();
      alert(`Gambar siap dipakai. Nama preview otomatis: ${safeName}`);
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  document.querySelectorAll('.editable-text').forEach((el) => {
    const key = el.getAttribute('data-edit-key');
    if (!key) return;
    el.addEventListener('input', () => {
      state.texts[key] = el.innerHTML;
      scheduleSave();
    });
    el.addEventListener('blur', () => {
      state.texts[key] = el.innerHTML;
      saveContent();
    });
  });

  const revealElements = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
      }
    });
  }, { threshold: 0.12 });

  revealElements.forEach((el) => observer.observe(el));

  const waBtn = document.getElementById('whatsapp-btn');
  if (waBtn) {
    waBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const phone = waBtn.dataset.phone || '+628xxxxxxxxxx';
      const text = encodeURIComponent('Halo, saya ingin mendapat informasi pembagian Eco Enzim gratis.');
      const link = `https://wa.me/${phone.replace(/[^0-9+]/g, '')}?text=${text}`;
      window.open(link, '_blank');
    });
  }

  const clearBtn = document.getElementById('clear-preview');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearAdminSession();
      Object.keys(localStorage).filter((k) => k.startsWith('ecoEnzimAsset:') || k.startsWith('ecoEnzimText:') || k.startsWith('ecoEnzimAssetName:')).forEach((k) => localStorage.removeItem(k));
      alert('Mode admin dan preview lokal berhasil dihapus. Halaman akan dimuat ulang.');
      location.reload();
    });
  }

  const logoutBtn = document.getElementById('logout-admin');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearAdminSession();
      window.location.href = 'index.html';
    });
  }

  loadContent().then(() => {
    setEditingState();
  });
});
