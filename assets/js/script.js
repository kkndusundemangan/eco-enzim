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

  // UI Elements for Progress and Toolbar
  const progressBar = document.getElementById('save-progress-bar');
  const progressContainer = document.getElementById('save-progress-container');
  const rtToolbar = document.getElementById('rich-text-toolbar');

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
      saveStatus.style.color = isError ? '#e23b3b' : '#0284c7';
    }
  };

  const simulateProgress = (start, duration) => {
    if (!progressBar || !progressContainer) return null;
    progressContainer.hidden = false;
    progressBar.style.width = '0%';
    let startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 90, 90); // Cap at 90% until done
      progressBar.style.width = `${progress}%`;
    }, 50);
    return interval;
  };

  const finishProgress = (interval, success) => {
    if (!progressBar || !progressContainer) return;
    clearInterval(interval);
    progressBar.style.width = '100%';
    progressBar.style.background = success ? 'linear-gradient(90deg,#10b981,#059669)' : 'linear-gradient(90deg,#ef4444,#dc2626)';
    setTimeout(() => {
      progressContainer.hidden = true;
      progressBar.style.width = '0%';
      progressBar.style.background = 'linear-gradient(90deg,#0ea5e9,#0284c7)';
    }, 1500);
  };

  const debounce = (fn, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); }; };

  // Auto-save saat teks editable berubah (tidak perlu editingText aktif)
  const scheduleAutoSave = debounce(() => { if (ownerMode) { saveContent(); } }, 2000);

  // Attach input listeners to all editable-text elements
  function attachAutoSaveListeners() {
    document.querySelectorAll('.editable-text[contenteditable="true"]').forEach(el => {
      el.addEventListener('input', scheduleAutoSave);
    });
  }

  if (editingText && ownerMode) { attachAutoSaveListeners(); }

  // Rich Text Commands
  document.querySelectorAll('.rt-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.execCommand(btn.dataset.command, false, null);
    });
  });
  
  document.getElementById('rt-fontName')?.addEventListener('change', (e) => {
    document.execCommand('fontName', false, e.target.value);
  });
  
  document.getElementById('rt-fontSize')?.addEventListener('change', (e) => {
    document.execCommand('fontSize', false, e.target.value);
  });
  
  document.getElementById('rt-foreColor')?.addEventListener('input', (e) => {
    document.execCommand('foreColor', false, e.target.value);
  });
  
  document.getElementById('rt-hiliteColor')?.addEventListener('input', (e) => {
    document.execCommand('hiliteColor', false, e.target.value); // Use 'backColor' in some browsers, but 'hiliteColor' is standard for HTML5 text highlight
  });

  // Handle preset color swatches
  document.querySelectorAll('#rt-text-presets .rt-color-swatch').forEach(swatch => {
    swatch.addEventListener('click', (e) => {
      e.preventDefault();
      const color = swatch.getAttribute('data-color');
      document.execCommand('foreColor', false, color);
      const picker = document.getElementById('rt-foreColor');
      if (picker) picker.value = color;
    });
  });

  document.querySelectorAll('#rt-bg-presets .rt-color-swatch').forEach(swatch => {
    swatch.addEventListener('click', (e) => {
      e.preventDefault();
      const color = swatch.getAttribute('data-color');
      document.execCommand('hiliteColor', false, color === 'transparent' ? 'rgba(0,0,0,0)' : color);
      const picker = document.getElementById('rt-hiliteColor');
      if (picker && color !== 'transparent') picker.value = color;
    });
  });

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

    const ytIframe = document.getElementById('video-iframe');
    if (ytIframe && state.texts['youtube']) {
      ytIframe.src = state.texts['youtube'];
    }
  };

  // Toggle editing UI state: enable/disable contenteditable on editable elements
  const setEditingState = () => {
    const toggleBtn = document.getElementById('toggle-edit-text');
    const editableEls = document.querySelectorAll('.editable-text');

    if (editingText) {
      // Enable editing
      editableEls.forEach(el => {
        el.setAttribute('contenteditable', 'true');
        el.classList.add('is-editing');
      });
      if (rtToolbar) rtToolbar.hidden = false;
      if (toggleBtn) toggleBtn.textContent = 'Tutup Mode Edit Teks';
      // Attach auto-save listeners for newly editable elements
      attachAutoSaveListeners();
    } else {
      // Disable editing
      editableEls.forEach(el => {
        el.setAttribute('contenteditable', 'false');
        el.classList.remove('is-editing');
      });
      if (rtToolbar) rtToolbar.hidden = true;
      if (toggleBtn) toggleBtn.textContent = '1. Buka Mode Edit Teks';
    }
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

    // PENTING: Simpan ke localStorage TERLEBIH DAHULU sebelum request jaringan
    // Ini menjamin data selalu tersimpan meskipun jaringan gagal
    persistLocalFallback();

    setSaveStatus('Menyimpan...');
    const progressInterval = simulateProgress(true, 3000);

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
      const message = errorBody.error || response.statusText || 'Cloudflare error';
      throw new Error(`Cloudflare gagal: ${message}`);
    };

    try {
      const saved = await saveViaCloudflare();
      finishProgress(progressInterval, true);
      setSaveStatus('Tersimpan ke Cloudflare ✓');
      return saved;
    } catch (cloudError) {
      finishProgress(progressInterval, false);
      setSaveStatus('Tersimpan lokal (Cloudflare tidak tersedia)', true);
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

  // Fungsi untuk membaca semua data dari localStorage
  const getLocalOverrides = () => {
    const localTexts = {};
    const localImages = {};
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('ecoEnzimText:')) {
        const editKey = key.replace('ecoEnzimText:', '');
        const val = localStorage.getItem(key);
        if (val !== null) localTexts[editKey] = val;
      }
      if (key.startsWith('ecoEnzimAsset:')) {
        const imgKey = key.replace('ecoEnzimAsset:', '');
        const val = localStorage.getItem(key);
        if (val !== null) localImages[imgKey] = val;
      }
    });
    return { texts: localTexts, images: localImages };
  };

  const loadContent = async () => {
    buildDefaultState();

    // Langkah 1: Coba ambil content.json sebagai data dasar
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
      setSaveStatus('Konten dimuat.', false);
    } catch (loadError) {
      setSaveStatus('Mode preview lokal aktif.', true);
    }

    // Langkah 2: SELALU terapkan data dari localStorage (menimpa content.json)
    // Ini yang menjamin perubahan admin tetap muncul setelah reload
    const localData = getLocalOverrides();
    if (Object.keys(localData.texts).length > 0 || Object.keys(localData.images).length > 0) {
      mergeState(localData);
    }

    applyStateToDom();

    // Polling content.json untuk sinkronisasi antar perangkat
    setInterval(async () => {
      try {
        const pollUrl = `./data/content.json?ts=${Date.now()}`;
        const r = await fetch(pollUrl, { cache: 'no-store' });
        if (!r.ok) return;
        const latest = await r.json();
        if (latest && latest.updatedAt && latest.updatedAt !== state.updatedAt) {
          mergeState(latest);
          // Terapkan ulang localStorage agar tidak tertimpa oleh polling
          const freshLocal = getLocalOverrides();
          if (Object.keys(freshLocal.texts).length > 0 || Object.keys(freshLocal.images).length > 0) {
            mergeState(freshLocal);
          }
          applyStateToDom();
          state.updatedAt = latest.updatedAt;
          setSaveStatus('Konten diperbarui otomatis.', false);
        }
      } catch (e) {
        // abaikan error polling
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
            // Optional: alert('Tersimpan!');
          }
        }
      });
    }

    const saveBtn = document.getElementById('save-content');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        await saveContent();
      });
    }
    
    // YouTube Logic
    const applyYtBtn = document.getElementById('apply-youtube');
    const ytInput = document.getElementById('youtube-link-input');
    if (applyYtBtn && ytInput) {
      applyYtBtn.addEventListener('click', async () => {
        let link = ytInput.value.trim();
        if (!link) return;
        
        let videoId = '';
        if (link.includes('youtu.be/')) {
          videoId = link.split('youtu.be/')[1].split('?')[0];
        } else if (link.includes('youtube.com/watch')) {
          const urlParams = new URLSearchParams(link.split('?')[1]);
          videoId = urlParams.get('v');
        }
        
        if (videoId) {
          const embedLink = `https://www.youtube.com/embed/${videoId}`;
          state.texts['youtube'] = embedLink;
          const ytIframe = document.getElementById('video-iframe');
          if (ytIframe) ytIframe.src = embedLink;
          
          const saved = await saveContent();
          if (saved) {
            ytInput.value = '';
            ytInput.placeholder = 'Berhasil diterapkan!';
          }
        } else {
          alert('Link YouTube tidak valid. Gunakan format yang benar.');
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
