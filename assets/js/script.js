document.addEventListener('DOMContentLoaded', function () {
  const token = sessionStorage.getItem('ecoEnzimToken');
  const ownerMode = !!token;
  const ownerTools = document.getElementById('owner-tools');
  const fileInput = document.getElementById('img-file-input');
  const saveStatus = document.getElementById('save-status');
  let currentTarget = null;
  let editingText = false;
  let saveTimer = null;
  const state = {
    texts: {},
    images: {},
    galleryItems: null,
    videoItems: null
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
    sessionStorage.removeItem('ecoEnzimToken');
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
    state.galleryItems = [{ id: 'gal1', imageKey: 'gallery1', captionKey: 'gallery1Caption' },{ id: 'gal2', imageKey: 'gallery2', captionKey: 'gallery2Caption' },{ id: 'gal3', imageKey: 'gallery3', captionKey: 'gallery3Caption' }];
    state.videoItems = [{ id: 'vid1', urlKey: 'youtube' }];
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
        // preserve inline caption attribute using the image key to avoid id/key collisions
        const capKey = `${key}Caption`;
        if (img.dataset && img.dataset.caption) {
          state.texts[capKey] = img.dataset.caption;
        }
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
    if (payload && payload.galleryItems) state.galleryItems = payload.galleryItems;
    if (payload && payload.videoItems) state.videoItems = payload.videoItems;
    if (payload && payload.updatedAt) {
      state.updatedAt = payload.updatedAt;
    }
  };

  
  const renderDynamicContent = () => {
    const galWrap = document.getElementById('dynamic-gallery-wrap');
    const galBtns = document.getElementById('dynamic-gallery-buttons');
    if (galWrap && state.galleryItems) {
      galWrap.innerHTML = '';
      if (galBtns) galBtns.innerHTML = '';
      state.galleryItems.forEach((item, index) => {
        const figure = document.createElement('figure');
        figure.className = 'gallery-item';
        figure.style.position = 'relative';
        if (ownerMode) {
          figure.innerHTML += '<button class="delete-gal-btn" data-idx="' + index + '" style="position:absolute;top:8px;right:8px;z-index:10;background:red;color:white;border:none;border-radius:50%;width:24px;height:24px;cursor:pointer;">&times;</button>';
          if (galBtns) {
            galBtns.innerHTML += '<button class="btn secondary light owner-trigger" data-target="' + item.imageKey + '" type="button">Ganti Galeri ' + (index+1) + '</button>\n';
          }
        }
        figure.innerHTML += '<img alt="Galeri ' + (index+1) + '" class="editable-image" data-caption="" data-image-key="' + item.imageKey + '" id="' + item.id + '" src="' + (state.images[item.imageKey] || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7') + '"/>';
        figure.innerHTML += '<figcaption class="image-caption editable-text" data-edit-key="' + item.captionKey + '">' + (state.texts[item.captionKey] || 'Teks Galeri '+(index+1)) + '</figcaption>';
        galWrap.appendChild(figure);
      });
      if (ownerMode) {
        if (galWrap) galWrap.innerHTML += '<div style="grid-column: 1 / -1; display:flex; justify-content:center;"><button class="btn secondary light" id="add-gal-btn" type="button" style="margin-top:10px;">+ Tambah Foto Dokumentasi</button></div>';
      }
    }

    const vidWrap = document.getElementById('dynamic-videos-wrap');
    if (vidWrap && state.videoItems) {
      vidWrap.innerHTML = '';
      state.videoItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'video-item';
        div.style.position = 'relative';
        div.style.marginBottom = '20px';
        if (ownerMode) {
          div.innerHTML += '<button class="delete-vid-btn" data-idx="' + index + '" style="position:absolute;top:-10px;right:-10px;z-index:10;background:red;color:white;border:none;border-radius:50%;width:24px;height:24px;cursor:pointer;">&times;</button>';
        }
        div.innerHTML += '<iframe allowfullscreen="" frameborder="0" src="' + (state.texts[item.urlKey] || '') + '" style="width:100%; aspect-ratio:16/9; border-radius:16px;"></iframe>';
        vidWrap.appendChild(div);
      });
      if (ownerMode) {
         vidWrap.innerHTML += '<button class="btn secondary light" id="add-vid-btn" type="button" style="margin-top:10px;">+ Tambah Video</button>';
      }
    }
  };

  const rebindDynamicEvents = () => {
    // update array
    const newGalEls = Array.from(document.querySelectorAll('.gallery .editable-image, #usage-photo'));
    galleryImageElements.length = 0;
    newGalEls.forEach(el => galleryImageElements.push(el));
    
    // Attach gallery click
    document.querySelectorAll('.gallery-item img').forEach((img) => {
      img.addEventListener('click', (event) => {
        event.stopPropagation();
        if (editingText) return;
        const idx = galleryImageElements.indexOf(img);
        if (idx > -1) showImagePreview(idx);
      });
    });

    if (ownerMode) {
      document.querySelectorAll('.delete-gal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (confirm('Hapus foto ini?')) {
            const idx = parseInt(btn.dataset.idx);
            state.galleryItems.pop(idx);
            applyStateToDom();
            scheduleSave();
          }
        });
      });
      document.querySelectorAll('.delete-vid-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (confirm('Hapus video ini?')) {
            const idx = parseInt(btn.dataset.idx);
            state.videoItems.pop(idx);
            applyStateToDom();
            scheduleSave();
          }
        });
      });
      document.querySelectorAll('#dynamic-gallery-buttons .owner-trigger').forEach(btn => {
        btn.addEventListener('click', () => {
          currentTarget = btn.dataset.target;
          fileInput.click();
        });
      });
      const addGal = document.getElementById('add-gal-btn');
      if (addGal) {
        addGal.addEventListener('click', () => {
          const newId = 'gal' + Date.now();
          state.galleryItems.push({ id: newId, imageKey: newId, captionKey: newId + 'Caption' });
          applyStateToDom();
          scheduleSave();
        });
      }
      
      const addVid = document.getElementById('add-vid-btn');
      if (addVid) {
        addVid.addEventListener('click', () => {
          const newId = 'vid' + Date.now();
          state.videoItems.push({ id: newId, urlKey: newId + 'Url' });
          applyStateToDom();
          scheduleSave();
        });
      }
    }
  };

  const applyStateToDom = () => {
    renderDynamicContent();
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
      // apply caption to nearby figcaption if present (use image key)
      const capEl = document.querySelector(`[data-edit-key="${key}Caption"]`);
      if (capEl && state.texts[`${key}Caption`]) {
        capEl.innerHTML = state.texts[`${key}Caption`];
      }
    });

    const ytIframe = document.getElementById('video-iframe');
    if (ytIframe && state.texts['youtube']) {
      ytIframe.src = state.texts['youtube'];
    }
    rebindDynamicEvents();
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
    try {
      Object.entries(state.texts).forEach(([key, value]) => {
        localStorage.setItem(`ecoEnzimText:${key}`, value);
      });
      Object.entries(state.images).forEach(([key, value]) => {
        localStorage.setItem(`ecoEnzimAsset:${key}`, value);
      });
      document.querySelectorAll('.editable-image').forEach((img) => {
        if (img.dataset.previewName) {
          localStorage.setItem(`ecoEnzimAssetName:${img.id}`, img.dataset.previewName);
        }
      });
    } catch (e) {
      console.warn('Gagal menyimpan fallback lokal (mungkin limit size gambar terlalu besar):', e);
    }
  };

  const saveContent = async () => {
    const payload = {
      texts: state.texts,
      images: state.images,
      galleryItems: state.galleryItems,
      videoItems: state.videoItems,
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
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
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

    // Shop Link Logic
    const applyShopBtn = document.getElementById('apply-shop-link');
    const shopInput = document.getElementById('shop-link-input');
    if (applyShopBtn && shopInput) {
      applyShopBtn.addEventListener('click', async () => {
        let link = shopInput.value.trim();
        if (!link) return;
        
        state.texts['shopLink'] = link;
        
        const saved = await saveContent();
        if (saved) {
          shopInput.value = '';
          shopInput.placeholder = 'Link Toko berhasil diterapkan!';
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
        // clear any mismatch where file name might leak into caption dataset
        if (targetElement.dataset && targetElement.dataset.caption && targetElement.dataset.caption.includes('placeholder')) {
          // keep original caption in state instead of overwriting with placeholder
          const capKey = targetElement.id ? `${targetElement.id}Caption` : `${currentTarget}Caption`;
          if (state.texts[capKey]) {
            const capEl = document.querySelector(`[data-edit-key="${capKey}"]`);
            if (capEl) capEl.innerHTML = state.texts[capKey];
          }
        }
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

  const modal = document.getElementById('preview-modal');
  const previewTextView = document.getElementById('preview-text-view');
  const previewImageView = document.getElementById('preview-image-view');
  const previewTitle = document.getElementById('preview-text-title');
  const previewBody = document.getElementById('preview-text-body');
  const previewImage = document.getElementById('preview-image');
  const previewImageCaption = document.getElementById('preview-image-caption');
  const previewClose = document.getElementById('preview-close');
  const previewPrev = document.getElementById('preview-prev');
  const previewNext = document.getElementById('preview-next');

  let galleryImageElements = Array.from(document.querySelectorAll('.gallery .editable-image, #usage-photo'));
  const stepPopupElements = Array.from(document.querySelectorAll('.step-card[data-popup-key]'));
  let currentImageIndex = 0;

  const openModal = () => {
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  const hidePreviewViews = () => {
    if (previewTextView) {
      previewTextView.classList.add('hidden');
      previewTextView.hidden = true;
      previewTextView.style.display = 'none';
    }
    if (previewImageView) {
      previewImageView.classList.add('hidden');
      previewImageView.hidden = true;
      previewImageView.style.display = 'none';
    }
  };

  const showTextPreview = (title, body, popupKey = '') => {
    if (!previewTextView || !previewImageView) return;
    hidePreviewViews();
    previewTitle.textContent = title || 'Detail teks';
    previewBody.innerHTML = body || '';
    previewBody.removeAttribute('contenteditable');
    previewBody.classList.remove('is-editing');
    previewBody.oninput = null;
    previewBody.onblur = null;

    if (ownerMode && editingText) {
      previewBody.setAttribute('contenteditable', 'true');
      previewBody.classList.add('is-editing');
      previewBody.oninput = scheduleAutoSave;
      previewBody.onblur = () => {
        if (popupKey) {
          state.texts[popupKey] = previewBody.innerHTML;
          saveContent();
        }
      };
    }

    previewTextView.classList.remove('hidden');
    previewTextView.hidden = false;
    previewTextView.style.display = 'flex';
    previewImageView.classList.add('hidden');
    previewImageView.hidden = true;
    previewImageView.style.display = 'none';
    openModal();
  };

  const showImagePreview = (index) => {
    if (!previewTextView || !previewImageView || !previewImage) return;
    const imageEl = galleryImageElements[index];
    if (!imageEl) return;
    hidePreviewViews();
    currentImageIndex = index;
    previewImage.src = imageEl.src;
    previewImage.alt = imageEl.alt || 'Preview gambar';
    const imageKey = imageEl.getAttribute('data-image-key');
    const captionKey = imageKey ? `${imageKey}Caption` : '';
    const captionEl = captionKey ? document.querySelector(`[data-edit-key="${captionKey}"]`) : null;
    previewImageCaption.textContent = captionEl ? captionEl.innerHTML : imageEl.dataset.caption || imageEl.alt || '';
    previewTextView.classList.add('hidden');
    previewTextView.hidden = true;
    previewTextView.style.display = 'none';
    previewImageView.classList.remove('hidden');
    previewImageView.hidden = false;
    previewImageView.style.display = 'flex';
    openModal();
  };

  previewClose?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal || event.target.classList.contains('preview-backdrop')) {
      closeModal();
    }
  });

  previewPrev?.addEventListener('click', () => {
    const nextIndex = (currentImageIndex - 1 + galleryImageElements.length) % galleryImageElements.length;
    showImagePreview(nextIndex);
  });

  previewNext?.addEventListener('click', () => {
    const nextIndex = (currentImageIndex + 1) % galleryImageElements.length;
    showImagePreview(nextIndex);
  });

  stepPopupElements.forEach((el) => {
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      if (editingText) return;
      const popupKey = el.getAttribute('data-popup-key');
      if (!popupKey) return;
      const titleEl = el.querySelector('[data-edit-key]');
      const titleKey = titleEl?.getAttribute('data-edit-key') || el.getAttribute('data-edit-key');
      const titleText = titleEl?.textContent?.trim();
      const title = titleText || (titleKey ? titleKey.replace(/([A-Z])/g, ' $1').trim() : 'Detail langkah');
      const popupContent = state.texts[popupKey] || '';
      showTextPreview(title, popupContent, popupKey);
    });
  });

  galleryImageElements.forEach((img, index) => {
    img.addEventListener('click', (event) => {
      event.stopPropagation();
      if (editingText) return;
      showImagePreview(index);
    });
  });

  const waBtn = document.getElementById('whatsapp-btn');
  if (waBtn) {
    waBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (state.texts['shopLink']) {
        window.open(state.texts['shopLink'], '_blank');
      } else {
        const phone = waBtn.dataset.phone || '+628xxxxxxxxxx';
        const text = encodeURIComponent('Halo, saya ingin mendapat informasi pembagian Eco Enzim gratis.');
        const link = `https://wa.me/${phone.replace(/[^0-9+]/g, '')}?text=${text}`;
        window.open(link, '_blank');
      }
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

  // Change Password Logic
  const changePasswordBtn = document.getElementById('change-password-btn');
  const changePasswordModal = document.getElementById('change-password-modal');
  const changePasswordClose = document.getElementById('change-password-close');
  const changePasswordForm = document.getElementById('change-password-form');
  const changePasswordMsg = document.getElementById('change-password-message');

  if (changePasswordBtn && changePasswordModal) {
    changePasswordBtn.addEventListener('click', () => {
      changePasswordModal.classList.remove('hidden');
      changePasswordModal.setAttribute('aria-hidden', 'false');
      changePasswordMsg.textContent = '';
      if (changePasswordForm) changePasswordForm.reset();
    });

    changePasswordClose?.addEventListener('click', () => {
      changePasswordModal.classList.add('hidden');
      changePasswordModal.setAttribute('aria-hidden', 'true');
    });

    changePasswordForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      changePasswordMsg.textContent = 'Menyimpan...';
      changePasswordMsg.style.color = '#0284c7';
      
      const oldPass = document.getElementById('cp-old').value;
      const newPass = document.getElementById('cp-new').value;

      try {
        const response = await fetch('https://eco-enzim.pages.dev/api/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionStorage.getItem('ecoEnzimToken')}`
          },
          body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
        });
        const data = await response.json();
        
        if (response.ok) {
          changePasswordMsg.textContent = 'Password berhasil diubah.';
          changePasswordMsg.style.color = '#10b981';
          setTimeout(() => {
            changePasswordModal.classList.add('hidden');
          }, 2000);
        } else {
          changePasswordMsg.textContent = data.error || 'Gagal mengubah password.';
          changePasswordMsg.style.color = '#e23b3b';
        }
      } catch (err) {
        changePasswordMsg.textContent = 'Terjadi kesalahan jaringan.';
        changePasswordMsg.style.color = '#e23b3b';
      }
    });
  }

  loadContent().then(() => {
    setEditingState();
  });
});
