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

  const encodeBase64 = (text) => {
    return btoa(unescape(encodeURIComponent(text)));
  };

  const base64ToUtf8 = (b64) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
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
    if (payload && payload.updatedAt) {
      state.updatedAt = payload.updatedAt;
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

    setSaveStatus('Menyimpan ke Cloudflare...');

    const saveViaCloudflare = async () => {
      const response = await fetch('https://eco-enzim.pages.dev/api/save-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        cache: 'no-store'
      });

      if (response.ok) {
        return true;
      }

      const errorBody = await response.json().catch(() => ({}));
      const message = errorBody.error || response.statusText || 'Unknown Cloudflare error';
      throw new Error(`Cloudflare save gagal: ${message}`);
    };

    try {
      const saved = await saveViaCloudflare();
      persistLocalFallback();
      setSaveStatus('Tersimpan lewat Cloudflare dan siap dipakai di semua perangkat.');
      return saved;
    } catch (cloudError) {
      persistLocalFallback();
      const message = cloudError.message || 'Gagal menyimpan ke Cloudflare';
      setSaveStatus(`Gagal menyimpan: ${message}`, true);
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

    const contentUrl = `./data/content.json?ts=${Date.now()}`;
    try {
      const response = await fetch(contentUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Tidak bisa membaca file konten.');
      }
      const jsonContent = await response.json();
      if (jsonContent && jsonContent.texts) {
        mergeState(jsonContent);
      }
      setSaveStatus('Konten dimuat dari data/content.json.', false);
    } catch (loadError) {
      setSaveStatus('Mode preview lokal aktif: tidak bisa memuat content.json.', true);
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

    // Poll content.json periodically so other devices see updates automatically
    setInterval(async () => {
      try {
        const pollUrl = `./data/content.json?ts=${Date.now()}`;
        const r = await fetch(pollUrl, { cache: 'no-store' });
        if (!r.ok) return;
        const latest = await r.json();
        if (latest && latest.updatedAt && latest.updatedAt !== state.updatedAt) {
          mergeState(latest);
          applyStateToDom();
          state.updatedAt = latest.updatedAt;
          setSaveStatus('Konten diperbarui otomatis.', false);
        }
      } catch (e) {
        // ignore polling errors
      }
    }, 30000);
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
            alert('Perubahan narasi dan gambar sudah disimpan. Segarkan halaman lain untuk melihat perubahan.');
          } else {
            alert('Penyimpanan online gagal. Pastikan Cloudflare function `/api/save-content` sudah aktif. Perubahan hanya tersimpan di browser Anda saat ini.');
          }
        }
      });
    }

    const saveBtn = document.getElementById('save-content');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const saved = await saveContent();
        if (saved) {
          alert('Perubahan telah disimpan melalui Cloudflare. Segarkan halaman lain untuk melihat update.');
        } else {
          alert('Gagal menyimpan melalui Cloudflare. Pastikan function `/api/save-content` sudah diterapkan.');
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
