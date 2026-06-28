// ============================================================
// Poflix — Enhanced Script with Flickv4 Streaming Engine
// ============================================================

// --- Theme Management Engine ---
const themeManager = {
  themes: ['rose', 'emerald', 'ocean', 'sunset', 'amethyst', 'cyberpunk', 'arctic', 'obsidian'],
  init() {
    const saved = localStorage.getItem('poflix-theme') || 'rose';
    this.apply(saved);
  },
  apply(name) {
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem('poflix-theme', name);
    document.querySelectorAll('.theme-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.themeName === name);
    });
  },
  renderSwatches(container) {
    if (!container) return;
    container.innerHTML = this.themes.map(t =>
      `<div class="theme-swatch" data-theme-name="${t}" title="${t.charAt(0).toUpperCase() + t.slice(1)}" role="button" tabindex="0" aria-label="Theme ${t}"></div>`
    ).join('');
    container.querySelectorAll('.theme-swatch').forEach(s => {
      s.onclick = (e) => { e.stopPropagation(); this.apply(s.dataset.themeName); };
      s.onmouseenter = () => document.documentElement.setAttribute('data-theme', s.dataset.themeName);
      s.onmouseleave = () => document.documentElement.setAttribute('data-theme', localStorage.getItem('poflix-theme') || 'rose');
    });
    this.apply(localStorage.getItem('poflix-theme') || 'rose');
  }
};
themeManager.init();

// --- Toast Notifications ---
function showToast(msg, type = 'default', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast${type !== 'default' ? ' ' + type : ''}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(8px)'; setTimeout(() => toast.remove(), 400); }, duration);
}

// --- Google API Initialization ---
let tokenClient;
let gapiInited = false;
let gisInited = false;
let googleUser = null;
let spreadsheetId = localStorage.getItem('poflix_spreadsheet_id');

function initGoogleAuth() {
  const scriptGapi = document.createElement('script');
  scriptGapi.src = "https://apis.google.com/js/api.js";
  scriptGapi.onload = () => gapi.load('client', initializeGapiClient);
  document.head.appendChild(scriptGapi);
  const scriptGis = document.createElement('script');
  scriptGis.src = "https://accounts.google.com/gsi/client";
  scriptGis.onload = initializeGisClient;
  document.head.appendChild(scriptGis);
}

async function initializeGapiClient() {
  try {
    await gapi.client.init({ apiKey: GOOGLE_API_KEY, discoveryDocs: DISCOVERY_DOCS });
    gapiInited = true;
    maybeStartAuth();
  } catch (e) {
    console.warn('Google API init failed (non-critical):', e);
  }
}

function initializeGisClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID, scope: SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse.access_token) {
        localStorage.setItem('poflix_auth_token', tokenResponse.access_token);
        localStorage.setItem('poflix_auth_expires', Date.now() + (tokenResponse.expires_in * 1000));
        gapi.client.setToken(tokenResponse);
        checkUserStatus().then(() => {
          if (window.location.pathname.includes('login.html')) window.location.href = 'profile.html';
        });
      }
    },
  });
  gisInited = true;
  maybeStartAuth();
}

function startGoogleLogin() {
  if (tokenClient) {
    const status = document.getElementById('auth-status');
    if (status) status.innerText = "Waiting for Google authorization...";
    tokenClient.requestAccessToken();
  } else {
    showToast("Google Service is still loading. Please wait.", 'error');
  }
}

function maybeStartAuth() {
  if (gapiInited && gisInited) {
    const savedToken = localStorage.getItem('poflix_auth_token');
    const expires = localStorage.getItem('poflix_auth_expires');
    if (savedToken && expires && Date.now() < parseInt(expires)) {
      gapi.client.setToken({ access_token: savedToken });
      checkUserStatus();
    } else {
      updateNavbarAuth();
    }
  }
}

async function checkUserStatus() {
  try {
    const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${gapi.client.getToken().access_token}` }
    }).then(res => res.json());
    if (userInfo && userInfo.sub) {
      googleUser = userInfo;
      localStorage.setItem('poflix_user_info', JSON.stringify(userInfo));
      updateNavbarAuth();
      if (!spreadsheetId) await findOrCreateSpreadsheet();
      await syncFromSheets('watched');
      await syncFromSheets('wishlist');
      if (!window.syncInterval) {
        window.syncInterval = setInterval(() => { syncFromSheets('watched'); syncFromSheets('wishlist'); }, 60000);
      }
    }
  } catch (e) { console.error("Auth check failed", e); logout(); }
}

function logout() {
  localStorage.removeItem('poflix_auth_token');
  localStorage.removeItem('poflix_user_info');
  localStorage.removeItem('poflix_spreadsheet_id');
  googleUser = null;
  spreadsheetId = null;
  updateNavbarAuth();
  window.location.reload();
}

function updateNavbarAuth() {
  const navContainer = document.getElementById('navbar-nav');
  if (!navContainer) return;
  navContainer.querySelectorAll('li a').forEach(link => {
    if (link.getAttribute('href') === 'profile.html' && !link.classList.contains('nav-user'))
      link.parentElement.style.display = 'none';
  });
  let authLink = navContainer.querySelector('.auth-link');
  if (!authLink) { authLink = document.createElement('li'); authLink.className = 'auth-link'; navContainer.appendChild(authLink); }
  if (googleUser) {
    const firstName = googleUser.given_name || (googleUser.name ? googleUser.name.split(' ')[0] : 'Profile');
    authLink.innerHTML = `
      <div class="nav-auth-group">
        <a href="profile.html" class="nav-user" title="Go to Profile">
          <img src="${googleUser.picture}" alt="User Profile">
          <span>${firstName}</span>
        </a>
        <button onclick="logout()" class="btn-logout-nav" title="Logout">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        </button>
      </div>`;
  } else {
    authLink.innerHTML = `<a href="login.html" class="btn-login-nav">Login</a>`;
  }
}

// Spreadsheet DB Logic (unchanged from original)
async function findOrCreateSpreadsheet() {
  try {
    const listRes = await gapi.client.drive.files.list({ q: "name = 'Poflix_Watched_Data' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false", fields: 'files(id, name)' });
    const files = listRes.result.files;
    if (files && files.length > 0) { spreadsheetId = files[0].id; }
    else {
      const createRes = await gapi.client.sheets.spreadsheets.create({ resource: { properties: { title: 'Poflix_Watched_Data' } }, fields: 'spreadsheetId,sheets(properties(sheetId,title))' });
      spreadsheetId = createRes.result.spreadsheetId;
      await gapi.client.sheets.spreadsheets.values.update({ spreadsheetId, range: 'A1:E1', valueInputOption: 'RAW', resource: { values: [['ID', 'Category', 'Title', 'Poster', 'Timestamp']] } });
    }
    localStorage.setItem('poflix_spreadsheet_id', spreadsheetId);
    const ssMeta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
    const sheets = ssMeta.result.sheets;
    const watchedSheet = sheets[0].properties;
    localStorage.setItem('poflix_watched_title', watchedSheet.title);
    localStorage.setItem('poflix_watched_id', watchedSheet.sheetId);
    let wishlistSheet = sheets.find(s => s.properties.title === 'Wishlist');
    if (!wishlistSheet) {
      const addRes = await gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: [{ addSheet: { properties: { title: 'Wishlist' } } }] } });
      const newSheet = addRes.result.replies[0].addSheet.properties;
      localStorage.setItem('poflix_wishlist_title', newSheet.title);
      localStorage.setItem('poflix_wishlist_id', newSheet.sheetId);
      await gapi.client.sheets.spreadsheets.values.update({ spreadsheetId, range: 'Wishlist!A1:E1', valueInputOption: 'RAW', resource: { values: [['ID', 'Category', 'Title', 'Poster', 'Timestamp']] } });
    } else {
      localStorage.setItem('poflix_wishlist_title', wishlistSheet.properties.title);
      localStorage.setItem('poflix_wishlist_id', wishlistSheet.properties.sheetId);
    }
  } catch (e) { console.error("Sheets discovery failed", e); }
}

function getSheetConfig(listType = 'watched') {
  const ssId = localStorage.getItem('poflix_spreadsheet_id');
  if (!ssId) return null;
  const title = localStorage.getItem(`poflix_${listType}_title`) || (listType === 'watched' ? 'Sheet1' : 'Wishlist');
  const gid = localStorage.getItem(`poflix_${listType}_id`) || 0;
  return { id: ssId, title, gid };
}

async function syncToSheets(item, listType = 'watched') {
  const config = getSheetConfig(listType);
  if (!googleUser || !config || !config.id) return;
  try {
    const getRes = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: config.id, range: `${config.title}!A:A` });
    const ids = getRes.result.values ? getRes.result.values.map(r => String(r[0])) : [];
    if (ids.includes(String(item.id))) return;
    const category = item.type === 'movie' ? 'Movie' : 'Series';
    const values = [[item.id, category, item.title, item.poster_path, new Date().toISOString()]];
    await gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId: config.id, resource: { requests: [{ insertDimension: { range: { sheetId: config.gid, dimension: "ROWS", startIndex: 1, endIndex: 2 }, inheritFromBefore: false } }] } });
    await gapi.client.sheets.spreadsheets.values.update({ spreadsheetId: config.id, range: `${config.title}!A2`, valueInputOption: 'RAW', resource: { values } });
  } catch (e) { console.error(`Sheet sync failed (${listType})`, e); }
}

async function removeFromSheets(id, listType = 'watched') {
  const config = getSheetConfig(listType);
  if (!googleUser || !config || !config.id) return;
  try {
    const getRes = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: config.id, range: `${config.title}!A:A` });
    const rows = getRes.result.values;
    if (!rows) return;
    const requests = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i][0]) === String(id)) requests.push({ deleteDimension: { range: { sheetId: config.gid, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } } });
    }
    if (requests.length === 0) return;
    await gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId: config.id, resource: { requests } });
  } catch (e) { console.error(`Sheet removal failed (${listType})`, e); }
}

async function syncFromSheets(listType = 'watched') {
  const config = getSheetConfig(listType);
  if (!googleUser || !config || !config.id) return;
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: config.id, range: `${config.title}!A2:E` });
    const rows = res.result.values;
    const cloudItems = rows ? rows.map(r => ({ id: String(r[0]), type: String(r[1] || 'movie').toLowerCase() === 'movie' ? 'movie' : 'tv', title: r[2] || 'Untitled', poster_path: r[3] || '' })) : [];
    const localItems = getStorage(listType) || [];
    const mergedItems = [...cloudItems];
    localItems.forEach(lItem => { if (!mergedItems.some(cItem => String(cItem.id) === String(lItem.id))) mergedItems.push(lItem); });
    if (JSON.stringify(mergedItems) !== JSON.stringify(localItems)) { setStorage(listType, mergedItems); triggerUIRefresh(listType); }
  } catch (e) { console.error(`Sheet sync failed (${listType}):`, e); }
}

function triggerUIRefresh(listType) {
  if (listType === 'watched' && document.getElementById('watched-movies-grid')) renderProfilePage();
  if (listType === 'wishlist' && document.getElementById('wishlist-movies-grid')) renderWishlistPage();
}

initGoogleAuth();

// --- Adult Content Filter ---
function filterAdultContent(items) {
  const adultKeywords = ['adult','nude','nudity','sex','sexual','erotic','erotica','porn','pornographic','explicit','mature','adult content','adult film','adult movie','adult series','seikan','shiken','intimacy','desire','stepmom','stepmother','lingerie','suggestive','provocative','seductive','tempting','forbidden','taboo','mature content','adult themes'];
  const adultRatings = ['NC-17','X','XXX','18+','R18','18A'];
  return items.filter(item => {
    if (item.adult === true) return false;
    if (item.content_rating && adultRatings.includes(item.content_rating)) return false;
    const title = (item.title || item.name || '').toLowerCase();
    if (adultKeywords.some(k => title.includes(k.toLowerCase()))) return false;
    const overview = (item.overview || '').toLowerCase();
    if (adultKeywords.some(k => overview.includes(k.toLowerCase()))) return false;
    const originalTitle = (item.original_title || item.original_name || '').toLowerCase();
    if (adultKeywords.some(k => originalTitle.includes(k.toLowerCase()))) return false;
    return true;
  });
}

// --- TMDb API Helper ---
const tmdbCache = new Map();
async function fetchTMDB(endpoint, params = {}) {
  const queryParams = new URLSearchParams(params);
  queryParams.set('api_key', TMDB_API_KEY);
  const url = `${TMDB_BASE_URL}${endpoint}?${queryParams.toString()}`;
  if (tmdbCache.has(url)) return tmdbCache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('TMDb API error');
  const data = await res.json();
  tmdbCache.set(url, data);
  return data;
}

// --- Genre Cache ---
let genreMapMovie = {};
let genreMapTV = {};
async function loadGenreMaps() {
  try {
    const cachedM = localStorage.getItem('genreMapMovie');
    const cachedT = localStorage.getItem('genreMapTV');
    if (cachedM && cachedT) { genreMapMovie = JSON.parse(cachedM); genreMapTV = JSON.parse(cachedT); return; }
    const [movieGenres, tvGenres] = await Promise.all([fetchTMDB('/genre/movie/list'), fetchTMDB('/genre/tv/list')]);
    (movieGenres.genres || []).forEach(g => genreMapMovie[g.id] = g.name);
    (tvGenres.genres || []).forEach(g => genreMapTV[g.id] = g.name);
    localStorage.setItem('genreMapMovie', JSON.stringify(genreMapMovie));
    localStorage.setItem('genreMapTV', JSON.stringify(genreMapTV));
  } catch (e) { /* silent */ }
}

// --- localStorage Helpers ---
function getStorage(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
function setStorage(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function isInStorage(key, id) { return getStorage(key).some(item => item.id === id); }
function isWatched(id) { return (getStorage('watched') || []).some(item => String(item.id) === String(id)); }
function isWishlisted(id) { return (getStorage('wishlist') || []).some(item => String(item.id) === String(id)); }

async function toggleWatched(item, btn) {
  let watched = getStorage('watched') || [];
  const idx = watched.findIndex(i => String(i.id) === String(item.id));
  const card = btn.closest('.animated-card, .carousel-card');
  if (idx >= 0) {
    watched.splice(idx, 1); setStorage('watched', watched);
    btn.classList.remove('active');
    if (card) card.classList.remove('watched-glow');
    if (btn.classList.contains('btn-watched-detail')) btn.innerHTML = '👁️ Mark as Watched';
    triggerUIRefresh('watched');
    if (googleUser) removeFromSheets(item.id, 'watched');
    showToast('Removed from watched', 'default');
  } else {
    watched.push(item); setStorage('watched', watched);
    btn.classList.add('active');
    if (card) card.classList.add('watched-glow');
    if (btn.classList.contains('btn-watched-detail')) btn.innerHTML = '✔ Watched';
    fetchWatchedMetadata(item.id, item.type);
    if (googleUser) { syncToSheets(item, 'watched'); removeFromWishlistIfPresent(item.id); }
    triggerUIRefresh('watched');
    showToast('Added to watched ✔', 'success');
  }
}

async function fetchWatchedMetadata(id, type) {
  try {
    const meta = getStorage('watched_metadata') || {};
    if (meta[id]) return meta[id];
    const endpoint = type === 'movie' ? `/movie/${id}` : `/tv/${id}`;
    const data = await fetchTMDB(endpoint);
    const itemMeta = { runtime: type === 'movie' ? (data.runtime || 0) : (data.episode_run_time ? data.episode_run_time[0] || 0 : 0), genres: (data.genres || []).map(g => g.name) };
    meta[id] = itemMeta; setStorage('watched_metadata', meta);
    return itemMeta;
  } catch (e) { return null; }
}

async function fetchMissingMetadata() {
  const watched = getStorage('watched') || [];
  const meta = getStorage('watched_metadata') || {};
  for (const item of watched) {
    if (!meta[item.id]) { await fetchWatchedMetadata(item.id, item.type); await new Promise(r => setTimeout(r, 200)); }
  }
  if (watched.length > 0 && document.getElementById('stats-grid')) renderProfilePage();
}
fetchMissingMetadata();

async function toggleWishlist(item, btn) {
  let wishlist = getStorage('wishlist') || [];
  const idx = wishlist.findIndex(i => String(i.id) === String(item.id));
  if (idx >= 0) {
    wishlist.splice(idx, 1); setStorage('wishlist', wishlist);
    btn.classList.remove('active');
    if (btn.classList.contains('btn-wishlist-detail')) btn.innerHTML = '<i style="margin-right:6px;">🔖</i>Watch Later';
    else if (btn.querySelector('.icon-bookmark')) btn.querySelector('.icon-bookmark').textContent = '🔖';
    triggerUIRefresh('wishlist');
    if (googleUser) removeFromSheets(item.id, 'wishlist');
    showToast('Removed from wishlist', 'default');
  } else {
    wishlist.push(item); setStorage('wishlist', wishlist);
    btn.classList.add('active');
    if (btn.classList.contains('btn-wishlist-detail')) btn.innerHTML = '📌 In Wishlist';
    else if (btn.querySelector('.icon-bookmark')) btn.querySelector('.icon-bookmark').textContent = '📌';
    if (googleUser) syncToSheets(item, 'wishlist');
    setStorage('wishlist', wishlist);
    showToast('Added to wishlist 📌', 'success');
  }
}

function removeFromWishlistIfPresent(id) {
  let wishlist = getStorage('wishlist') || [];
  const sId = String(id);
  const idx = wishlist.findIndex(i => String(i.id) === sId);
  if (idx >= 0) {
    wishlist.splice(idx, 1); setStorage('wishlist', wishlist);
    if (googleUser) removeFromSheets(sId, 'wishlist');
    document.querySelectorAll(`[data-wishlist-id="${sId}"]`).forEach(btn => {
      btn.classList.remove('active');
      if (btn.classList.contains('btn-wishlist-detail')) btn.innerHTML = '🔖 Add to Wishlist';
      else if (btn.querySelector('.icon-bookmark')) btn.querySelector('.icon-bookmark').textContent = '🔖';
    });
    if (document.getElementById('wishlist-movies-grid')) renderWishlistPage();
  }
}

// --- Skeleton Loaders ---
function createSkeletonCards(count = 8) {
  return Array(count).fill('<div class="skeleton skeleton-card"></div>').join('');
}
function createSkeletonGrid(count = 12) {
  return Array(count).fill('<div class="skeleton skeleton-card-grid"></div>').join('');
}

// --- Debounce ---
function debounce(fn, delay = 350) {
  let timer;
  return function (...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); };
}

// --- Live Search Autocomplete ---
function initSearchAutocomplete(inputEl, options = {}) {
  if (!inputEl) return;
  const type = options.type || 'multi';
  const parent = inputEl.closest('form, .filter-search-wrap, .search-page-form') || inputEl.parentElement;
  let dropdown = parent.querySelector('.search-dropdown');
  if (!dropdown) { dropdown = document.createElement('div'); dropdown.className = 'search-dropdown'; parent.style.position = 'relative'; parent.appendChild(dropdown); }

  const fetchResults = debounce(async (query) => {
    if (!query || query.length < 2) { dropdown.classList.remove('open'); return; }
    dropdown.innerHTML = '<div class="search-dropdown-spinner"><div class="spinner spinner-sm"></div></div>';
    dropdown.classList.add('open');
    try {
      let results = [], actors = [];
      if (type === 'multi') {
        const [movieData, tvData, personData] = await Promise.all([fetchTMDB('/search/movie', { query, page: 1 }), fetchTMDB('/search/tv', { query, page: 1 }), fetchTMDB('/search/person', { query, page: 1 })]);
        const movies = filterAdultContent(movieData.results || []).slice(0, 4).map(m => ({ ...m, media_type: 'movie' }));
        const series = filterAdultContent(tvData.results || []).slice(0, 4).map(s => ({ ...s, media_type: 'tv' }));
        actors = (personData.results || []).filter(p => !p.adult).slice(0, 3).map(p => ({ ...p, media_type: 'person' }));
        results = [...movies, ...series];
      } else if (type === 'movie') {
        const data = await fetchTMDB('/search/movie', { query, page: 1 });
        results = filterAdultContent(data.results || []).slice(0, 8).map(m => ({ ...m, media_type: 'movie' }));
      } else {
        const data = await fetchTMDB('/search/tv', { query, page: 1 });
        results = filterAdultContent(data.results || []).slice(0, 8).map(s => ({ ...s, media_type: 'tv' }));
      }
      if (results.length === 0 && actors.length === 0) { dropdown.innerHTML = '<div class="search-dropdown-empty">No results found</div>'; return; }
      let moviesHtml = results.map(item => {
        const title = item.title || item.name || '';
        const year = (item.release_date || item.first_air_date || '').slice(0, 4);
        const rating = item.vote_average ? item.vote_average.toFixed(1) : '';
        const poster = item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : '';
        const detailUrl = item.media_type === 'movie' ? `movie_detail.html?id=${item.id}` : `series_detail.html?id=${item.id}`;
        const typeLabel = item.media_type === 'movie' ? 'Movie' : 'Series';
        return `<a href="${detailUrl}" class="search-dropdown-item">
          ${poster ? `<img src="${poster}" alt="${title}">` : '<div style="width:40px;height:60px;background:var(--surface);border-radius:var(--radius-sm);"></div>'}
          <div class="sdi-info">
            <div class="sdi-title">${title}</div>
            <div class="sdi-meta"><span class="sdi-type">${typeLabel}</span>${year ? `<span>${year}</span>` : ''}${rating ? `<span>⭐ ${rating}</span>` : ''}</div>
          </div>
        </a>`;
      }).join('');
      let actorsHtml = actors.map(actor => {
        const photo = actor.profile_path ? `https://image.tmdb.org/t/p/w92${actor.profile_path}` : '';
        const knownFor = (actor.known_for || []).slice(0, 2).map(k => k.title || k.name).filter(Boolean).join(', ');
        return `<a href="search.html?q=${encodeURIComponent(actor.name)}" class="search-dropdown-item">
          ${photo ? `<img src="${photo}" alt="${actor.name}" style="border-radius:50%;width:44px;height:44px;object-fit:cover;">` : '<div style="width:44px;height:44px;border-radius:50%;background:var(--surface);"></div>'}
          <div class="sdi-info"><div class="sdi-title">${actor.name}</div><div class="sdi-meta"><span class="sdi-type" style="background:rgba(139,92,246,0.15);color:#a78bfa;">Actor</span>${knownFor ? `<span>${knownFor}</span>` : ''}</div></div>
        </a>`;
      }).join('');
      dropdown.innerHTML = actorsHtml + moviesHtml;
    } catch { dropdown.innerHTML = '<div class="search-dropdown-empty">Search failed</div>'; }
  }, 350);

  inputEl.addEventListener('input', () => fetchResults(inputEl.value.trim()));
  inputEl.addEventListener('focus', () => { if (inputEl.value.trim().length >= 2) fetchResults(inputEl.value.trim()); });
  document.addEventListener('click', (e) => { if (!parent.contains(e.target)) dropdown.classList.remove('open'); });
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') dropdown.classList.remove('open'); });
}

// --- Pagination ---
function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  totalPages = Math.min(totalPages, 500);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  let html = `<button class="page-arrow" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹ Prev</button>`;
  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
  if (startPage > 1) { html += `<button data-page="1">1</button>`; if (startPage > 2) html += `<span class="page-info">…</span>`; }
  for (let p = startPage; p <= endPage; p++) html += `<button data-page="${p}" class="${p === currentPage ? 'active' : ''}">${p}</button>`;
  if (endPage < totalPages) { if (endPage < totalPages - 1) html += `<span class="page-info">…</span>`; html += `<button data-page="${totalPages}">${totalPages}</button>`; }
  html += `<button class="page-arrow" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next ›</button>`;
  container.innerHTML = html;
  container.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => { const page = parseInt(btn.dataset.page); if (!isNaN(page)) onPageChange(page); });
  });
}

// ============================================================
// CARD CREATION
// ============================================================
function createMovieCard(movie) {
  const year = (movie.release_date || '').slice(0, 4);
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '';
  const posterUrl = movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : '';
  if (!posterUrl) return '';
  const isW = isWatched(movie.id);
  const isWL = isWishlisted(movie.id);
  const itemTitle = movie.title || movie.name || 'Untitled';
  return `<a href="movie_detail.html?id=${movie.id}" class="animated-card${isW ? ' watched-glow' : ''}" data-id="${movie.id}">
    <button class="btn-watched${isW ? ' active' : ''}" onclick="event.preventDefault(); toggleWatched({id:'${movie.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${movie.poster_path}', type:'movie'}, this)" aria-label="Mark as watched">
      <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    </button>
    <button class="btn-wishlist${isWL ? ' active' : ''}" data-wishlist-id="${movie.id}" onclick="event.preventDefault(); toggleWishlist({id:'${movie.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${movie.poster_path}', type:'movie'}, this)" aria-label="Add to wishlist">
      <span class="icon-bookmark">${isWL ? '📌' : '🔖'}</span>
    </button>
    ${year ? `<span class="card-year">${year}</span>` : ''}
    ${rating ? `<span class="card-rating">⭐ ${rating}</span>` : ''}
    <img src="${posterUrl}" alt="${itemTitle}" loading="lazy">
    <div class="movie-title">${itemTitle}</div>
  </a>`;
}

function createSeriesCard(series) {
  const year = (series.first_air_date || '').slice(0, 4);
  const rating = series.vote_average ? series.vote_average.toFixed(1) : '';
  const posterUrl = series.poster_path ? `https://image.tmdb.org/t/p/w342${series.poster_path}` : '';
  if (!posterUrl) return '';
  const isW = isWatched(series.id);
  const isWL = isWishlisted(series.id);
  const itemTitle = series.name || series.title || 'Untitled';
  return `<a href="series_detail.html?id=${series.id}" class="animated-card${isW ? ' watched-glow' : ''}" data-id="${series.id}">
    <button class="btn-watched${isW ? ' active' : ''}" onclick="event.preventDefault(); toggleWatched({id:'${series.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${series.poster_path}', type:'tv'}, this)" aria-label="Mark as watched">
      <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    </button>
    <button class="btn-wishlist${isWL ? ' active' : ''}" data-wishlist-id="${series.id}" onclick="event.preventDefault(); toggleWishlist({id:'${series.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${series.poster_path}', type:'tv'}, this)" aria-label="Add to wishlist">
      <span class="icon-bookmark">${isWL ? '📌' : '🔖'}</span>
    </button>
    ${year ? `<span class="card-year">${year}</span>` : ''}
    ${rating ? `<span class="card-rating">⭐ ${rating}</span>` : ''}
    <img src="${posterUrl}" alt="${itemTitle}" loading="lazy">
    <div class="movie-title">${itemTitle}</div>
  </a>`;
}

function createCarouselMovieCard(movie) {
  const year = (movie.release_date || '').slice(0, 4);
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '';
  const posterUrl = movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : '';
  if (!posterUrl) return '';
  const isW = isWatched(movie.id);
  const isWL = isWishlisted(movie.id);
  const itemTitle = movie.title || movie.name || 'Untitled';
  return `<a href="movie_detail.html?id=${movie.id}" class="carousel-card${isW ? ' watched-glow' : ''}" data-id="${movie.id}">
    <button class="btn-watched${isW ? ' active' : ''}" onclick="event.preventDefault(); toggleWatched({id:'${movie.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${movie.poster_path}', type:'movie'}, this)" aria-label="Mark as watched">
      <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    </button>
    <button class="btn-wishlist${isWL ? ' active' : ''}" data-wishlist-id="${movie.id}" onclick="event.preventDefault(); toggleWishlist({id:'${movie.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${movie.poster_path}', type:'movie'}, this)" aria-label="Add to wishlist">
      <span class="icon-bookmark">${isWL ? '📌' : '🔖'}</span>
    </button>
    ${year ? `<span class="card-year">${year}</span>` : ''}
    ${rating ? `<span class="card-rating">⭐ ${rating}</span>` : ''}
    <img src="${posterUrl}" alt="${itemTitle}" loading="lazy">
    <div class="movie-title">${itemTitle}</div>
  </a>`;
}

function createCarouselSeriesCard(series) {
  const year = (series.first_air_date || '').slice(0, 4);
  const rating = series.vote_average ? series.vote_average.toFixed(1) : '';
  const posterUrl = series.poster_path ? `https://image.tmdb.org/t/p/w342${series.poster_path}` : '';
  if (!posterUrl) return '';
  const isW = isWatched(series.id);
  const isWL = isWishlisted(series.id);
  const itemTitle = series.name || series.title || 'Untitled';
  return `<a href="series_detail.html?id=${series.id}" class="carousel-card${isW ? ' watched-glow' : ''}" data-id="${series.id}">
    <button class="btn-watched${isW ? ' active' : ''}" onclick="event.preventDefault(); toggleWatched({id:'${series.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${series.poster_path}', type:'tv'}, this)" aria-label="Mark as watched">
      <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    </button>
    <button class="btn-wishlist${isWL ? ' active' : ''}" data-wishlist-id="${series.id}" onclick="event.preventDefault(); toggleWishlist({id:'${series.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${series.poster_path}', type:'tv'}, this)" aria-label="Add to wishlist">
      <span class="icon-bookmark">${isWL ? '📌' : '🔖'}</span>
    </button>
    ${year ? `<span class="card-year">${year}</span>` : ''}
    ${rating ? `<span class="card-rating">⭐ ${rating}</span>` : ''}
    <img src="${posterUrl}" alt="${itemTitle}" loading="lazy">
    <div class="movie-title">${itemTitle}</div>
  </a>`;
}

// ============================================================
// FLICKV4-STYLE VIDEO EXTRACTION ENGINE
// ============================================================
// This mirrors Flickv4's WebViewScrapper.tsx approach:
// Load vidlink.pro in a hidden iframe, inject XHR intercept JS,
// receive extracted video URL via postMessage, play in our player.
const flickv4 = {
  // The XHR intercept script — identical logic to Flickv4's INJECTED_JAVASCRIPT
  INJECT_SCRIPT: `
    (function() {
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function() {
        this.addEventListener('load', function() {
          try {
            const responseURL = this.responseURL;
            if (!responseURL) return;
            const isVideo = /\\.(m3u8|mp4|webm|mkv)($|\\?)/i.test(responseURL);
            if (isVideo) {
              window.parent.postMessage(JSON.stringify({
                type: 'flickv4_video',
                responseURL: responseURL,
                isWebM: /\\.webm($|\\?)/i.test(responseURL)
              }), '*');
            }
          } catch(e) {}
        });
        originalOpen.apply(this, arguments);
      };

      // Also intercept fetch for some providers
      const originalFetch = window.fetch;
      window.fetch = function(input, init) {
        const url = typeof input === 'string' ? input : input?.url || '';
        const isVideo = /\\.(m3u8|mp4|webm|mkv)($|\\?)/i.test(url);
        if (isVideo) {
          window.parent.postMessage(JSON.stringify({
            type: 'flickv4_video',
            responseURL: url,
            isWebM: /\\.webm($|\\?)/i.test(url)
          }), '*');
        }
        return originalFetch.apply(this, arguments);
      };
    })();
  `,

  extractorDiv: null,
  currentListener: null,
  extractionTimer: null,

  buildSrcDoc(videoUrl) {
    return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0;background:#000;}body{width:100vw;height:100vh;overflow:hidden;}iframe{width:100%;height:100%;border:none;}</style>
<script>${this.INJECT_SCRIPT}<\/script>
</head><body>
<iframe src="${videoUrl}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen" allowfullscreen></iframe>
</body></html>`;
  },

  buildUrl(type, id, season, episode) {
    if (type === 'movie') return `https://vidlink.pro/movie/${id}?autoPlay=true`;
    return `https://vidlink.pro/tv/${id}/${season}/${episode}?autoPlay=true`;
  },

  extract(type, id, season, episode, onSuccess, onTimeout, timeoutMs = 18000) {
    // Clean up previous
    this.cleanup();

    const videoUrl = this.buildUrl(type, id, season, episode);
    const container = document.getElementById('flickv4-extractor');
    if (!container) { onTimeout(); return; }

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms';
    iframe.srcdoc = this.buildSrcDoc(videoUrl);

    this.currentListener = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'flickv4_video' && data.responseURL) {
          this.cleanup();
          onSuccess(data.responseURL, data.isWebM);
        }
      } catch {}
    };

    window.addEventListener('message', this.currentListener);
    container.innerHTML = '';
    container.appendChild(iframe);
    this.extractorDiv = iframe;

    this.extractionTimer = setTimeout(() => {
      this.cleanup();
      onTimeout();
    }, timeoutMs);
  },

  cleanup() {
    if (this.currentListener) { window.removeEventListener('message', this.currentListener); this.currentListener = null; }
    if (this.extractionTimer) { clearTimeout(this.extractionTimer); this.extractionTimer = null; }
    const container = document.getElementById('flickv4-extractor');
    if (container) container.innerHTML = '';
    this.extractorDiv = null;
  }
};

// ============================================================
// CUSTOM PLAYER RENDERER
// ============================================================
function buildPlayerHTML(streamUrls, movieId, type, extraParams = {}) {
  const { season = null, episode = null } = extraParams;
  const flickv4Id = type === 'movie' ? movieId : movieId;

  return `
  <div class="player-section">
    <div class="player-header">
      <h3>▶ Watch Now</h3>
      <div class="source-tabs" id="player-source-tabs">
        <button class="source-tab active" data-src-idx="0" onclick="switchPlayerSource(0)">Fetch &amp; Play</button>
        ${streamUrls.map((u, i) => `<button class="source-tab" data-src-idx="${i+1}" onclick="switchPlayerSource(${i+1})">Source ${i+1}</button>`).join('')}
      </div>
    </div>
    <div class="player-wrapper" id="main-player-wrapper">
      <div class="player-fetch-overlay" id="player-fetch-overlay">
        <button class="big-play-btn" id="player-play-btn" onclick="startFlickv4Play()" aria-label="Fetch and play video">
          ▶
        </button>
        <div>
          <strong>Fetch &amp; Play</strong>
          <p>We'll fetch the video from streaming services and play it here</p>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);">
          Powered by <span style="color:var(--accent);">Flickv4</span> engine
        </div>
      </div>
      <div class="player-loading" id="player-loading-overlay" style="display:none;">
        <div class="spinner"></div>
        <p id="player-loading-text">Fetching video stream...</p>
      </div>
      <div id="player-content-area"></div>
    </div>
    <div style="padding:0.75rem 1rem;font-size:0.78rem;color:var(--text-muted);border-top:1px solid var(--border-subtle);">
      ⚠️ We fetch content from third-party streaming services. If playback fails, try another source.
    </div>
  </div>`;
}

// Store current player state globally
let _currentPlayerState = { streamUrls: [], type: '', mediaId: '', season: null, episode: null };

function initPlayerState(streamUrls, type, mediaId, season, episode) {
  _currentPlayerState = { streamUrls, type, mediaId, season, episode };
}

function startFlickv4Play() {
  const overlay = document.getElementById('player-fetch-overlay');
  const loadingOverlay = document.getElementById('player-loading-overlay');
  if (overlay) overlay.style.display = 'none';
  if (loadingOverlay) loadingOverlay.style.display = 'flex';

  const { type, mediaId, season, episode } = _currentPlayerState;
  showToast('Fetching stream from vidlink.pro...', 'default', 5000);

  flickv4.extract(
    type, mediaId, season, episode,
    (videoUrl, isWebM) => {
      // SUCCESS — play extracted URL
      showToast('Stream fetched! Playing now ▶', 'success');
      renderDirectPlayer(videoUrl, isWebM);
    },
    () => {
      // TIMEOUT — fall back to embedded iframe source 1
      showToast('Auto-fetch timed out. Showing embedded player.', 'default');
      switchPlayerSource(1);
    },
    18000
  );
}

function renderDirectPlayer(videoUrl, isWebM) {
  const loadingOverlay = document.getElementById('player-loading-overlay');
  const contentArea = document.getElementById('player-content-area');
  if (loadingOverlay) loadingOverlay.style.display = 'none';
  if (!contentArea) return;

  // Update source tab to show "Direct"
  const tabs = document.querySelectorAll('.source-tab');
  tabs.forEach((t, i) => t.classList.toggle('active', i === 0));

  contentArea.innerHTML = `
    <video controls autoplay style="width:100%;height:100%;background:#000;display:block;" id="direct-video-player">
      <source src="${videoUrl}" type="${isWebM ? 'video/webm' : (videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4')}">
      Your browser does not support this video format.
    </video>`;

  // HLS support for m3u8
  if (videoUrl.includes('.m3u8')) {
    const vid = document.getElementById('direct-video-player');
    if (vid && window.Hls && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(videoUrl);
      hls.attachMedia(vid);
    } else if (vid && vid.canPlayType('application/vnd.apple.mpegurl')) {
      vid.src = videoUrl;
    } else {
      // Load HLS.js dynamically
      const hlsScript = document.createElement('script');
      hlsScript.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
      hlsScript.onload = () => {
        const vid2 = document.getElementById('direct-video-player');
        if (vid2 && Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(videoUrl);
          hls.attachMedia(vid2);
          hls.on(Hls.Events.MANIFEST_PARSED, () => vid2.play().catch(() => {}));
        }
      };
      document.head.appendChild(hlsScript);
    }
  }
}

function switchPlayerSource(idx) {
  const overlay = document.getElementById('player-fetch-overlay');
  const loadingOverlay = document.getElementById('player-loading-overlay');
  const contentArea = document.getElementById('player-content-area');

  // Update tab styles
  document.querySelectorAll('.source-tab').forEach((t, i) => t.classList.toggle('active', i === idx));

  if (idx === 0) {
    // Show fetch overlay
    flickv4.cleanup();
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    if (overlay) overlay.style.display = 'flex';
    if (contentArea) contentArea.innerHTML = '';
    return;
  }

  // Embed iframe
  flickv4.cleanup();
  if (overlay) overlay.style.display = 'none';
  if (loadingOverlay) loadingOverlay.style.display = 'none';
  const url = _currentPlayerState.streamUrls[idx - 1];
  if (contentArea && url) {
    contentArea.innerHTML = `<iframe src="${url}" width="100%" height="100%" allowfullscreen allow="autoplay; encrypted-media; fullscreen; picture-in-picture" style="border:none;display:block;"></iframe>`;
  }
}

// ============================================================
// HERO SPOTLIGHT — Auto-rotating with dots
// ============================================================
let heroSpotlightMovies = [];
let heroSpotlightIdx = 0;
let heroSpotlightTimer = null;

async function renderHeroSpotlight() {
  const spotlightEl = document.getElementById('hero-spotlight');
  if (!spotlightEl) return;
  try {
    const trending = await fetchTMDB('/trending/movie/week');
    heroSpotlightMovies = filterAdultContent(trending.results || []).filter(m => m.backdrop_path).slice(0, 5);
    if (heroSpotlightMovies.length === 0) return;

    // Hide static text
    const heroTitle = document.getElementById('hero-static-title');
    const heroSub = document.getElementById('hero-static-sub');
    if (heroTitle) heroTitle.style.display = 'none';
    if (heroSub) heroSub.style.display = 'none';

    renderSpotlightSlide(0);

    // Auto-rotate every 6 seconds
    if (heroSpotlightTimer) clearInterval(heroSpotlightTimer);
    heroSpotlightTimer = setInterval(() => {
      heroSpotlightIdx = (heroSpotlightIdx + 1) % heroSpotlightMovies.length;
      renderSpotlightSlide(heroSpotlightIdx, true);
    }, 6000);

  } catch (e) { /* keep static hero */ }
}

function renderSpotlightSlide(idx, animate = false) {
  const spotlightEl = document.getElementById('hero-spotlight');
  if (!spotlightEl || !heroSpotlightMovies[idx]) return;
  const movie = heroSpotlightMovies[idx];
  heroSpotlightIdx = idx;

  const year = (movie.release_date || '').slice(0, 4);
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '';
  const genres = (movie.genre_ids || []).slice(0, 3).map(id => genreMapMovie[id] || '').filter(Boolean);

  spotlightEl.innerHTML = `
    <div class="spotlight-bg" style="background-image: url('https://image.tmdb.org/t/p/original${movie.backdrop_path}')"></div>
    <div class="spotlight-content"${animate ? ' style="animation:heroFadeUp 0.6s ease both"' : ''}>
      <div class="spotlight-badge">🔥 Trending Now</div>
      <div class="spotlight-title">${movie.title}</div>
      <div class="spotlight-meta">
        ${year ? `<span>${year}</span>` : ''}
        ${rating ? `<span class="rating">⭐ ${rating}</span>` : ''}
        ${genres.length ? `<span>${genres.join(' · ')}</span>` : ''}
      </div>
      <div class="spotlight-overview">${movie.overview || ''}</div>
      <div class="spotlight-actions">
        <a href="movie_detail.html?id=${movie.id}" class="spotlight-btn primary">▶ Watch Now</a>
        <a href="movie_detail.html?id=${movie.id}" class="spotlight-btn secondary">ℹ More Info</a>
      </div>
    </div>
    <div class="spotlight-dots">
      ${heroSpotlightMovies.map((_, i) => `<button class="spotlight-dot${i === idx ? ' active' : ''}" onclick="renderSpotlightSlide(${i})" aria-label="Slide ${i+1}"></button>`).join('')}
    </div>`;
}

// ============================================================
// HOME PAGE CAROUSELS
// ============================================================
async function renderHomeCarousels() {
  const rowIds = ['top10-movies-row', 'top10-series-row', 'trending-row', 'popular-row', 'recommended-row'];
  rowIds.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = createSkeletonCards(8); });

  try {
    await loadGenreMaps();
    renderHeroSpotlight();

    const [topMovies, topSeries, trending, popular, recommended] = await Promise.all([
      fetchTMDB('/movie/top_rated', { page: 1 }),
      fetchTMDB('/tv/top_rated', { page: 1 }),
      fetchTMDB('/trending/movie/week'),
      fetchTMDB('/movie/popular'),
      fetchTMDB('/discover/movie', { sort_by: 'vote_average.desc', 'vote_count.gte': 1000 })
    ]);

    const setRow = (id, items, cardFn) => {
      const el = document.getElementById(id);
      if (!el) return;
      const html = items.map(cardFn).join('');
      el.innerHTML = html || '<div style="color:var(--text-muted);padding:1rem;">Nothing found.</div>';
      observeCards(el);
      initCarouselDrag(el);
    };

    setRow('top10-movies-row', filterAdultContent(topMovies.results).slice(0, 10), createCarouselMovieCard);
    setRow('top10-series-row', filterAdultContent(topSeries.results).slice(0, 10), createCarouselSeriesCard);
    setRow('trending-row', filterAdultContent(trending.results).slice(0, 12), createCarouselMovieCard);
    setRow('popular-row', filterAdultContent(popular.results).slice(0, 12), createCarouselMovieCard);
    setRow('recommended-row', filterAdultContent(recommended.results).slice(0, 12), createCarouselMovieCard);

    // Wire arrow buttons
    [['top10-movies-left','top10-movies-right','top10-movies-row'],
     ['top10-series-left','top10-series-right','top10-series-row'],
     ['trending-left','trending-right','trending-row'],
     ['popular-left','popular-right','popular-row'],
     ['recommended-left','recommended-right','recommended-row']].forEach(([l, r, rowId]) => {
      const row = document.getElementById(rowId);
      if (!row) return;
      const leftBtn = document.getElementById(l);
      const rightBtn = document.getElementById(r);
      const scrollAmt = () => { const c = row.querySelector('.carousel-card'); return c ? c.offsetWidth * 3 + 16 : 480; };
      if (leftBtn) leftBtn.onclick = () => row.scrollBy({ left: -scrollAmt(), behavior: 'smooth' });
      if (rightBtn) rightBtn.onclick = () => row.scrollBy({ left: scrollAmt(), behavior: 'smooth' });
    });
  } catch (e) {
    rowIds.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = '<div style="color:var(--accent);padding:1rem;">Failed to load.</div>'; });
  }
}

// Drag-scroll for carousels
function initCarouselDrag(el) {
  let isDown = false, startX = 0, scrollLeft = 0;
  el.addEventListener('mousedown', e => { isDown = true; el.classList.add('dragging'); startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft; });
  el.addEventListener('mouseleave', () => { isDown = false; el.classList.remove('dragging'); });
  el.addEventListener('mouseup', () => { isDown = false; el.classList.remove('dragging'); });
  el.addEventListener('mousemove', e => { if (!isDown) return; e.preventDefault(); const x = e.pageX - el.offsetLeft; el.scrollLeft = scrollLeft - (x - startX) * 1.5; });
}

function scrollRow(rowId, dir) {
  const row = document.getElementById(rowId);
  if (row) { const card = row.querySelector('.carousel-card'); const scrollAmount = card ? card.offsetWidth + 16 : 200; row.scrollBy({ left: dir * scrollAmount * 2, behavior: 'smooth' }); }
}

if (document.getElementById('trending-row') && typeof TMDB_API_KEY !== 'undefined') {
  renderHomeCarousels();
}

// ============================================================
// MOVIES LIST PAGE
// ============================================================
async function fetchGenres() { const data = await fetchTMDB('/genre/movie/list'); return data.genres; }

let moviesCurrentPage = 1, moviesLastParams = {}, moviesTotalPages = 1;
const ITEMS_PER_PAGE = 40;

async function renderMoviesList(params = {}, page = 1) {
  const grid = document.getElementById('movies-grid');
  if (!grid) return;
  grid.innerHTML = createSkeletonGrid(20);
  moviesLastParams = params; moviesCurrentPage = page;
  try {
    const tmdbPage1 = (page * 2) - 1, tmdbPage2 = page * 2;
    let totalPages = 1;
    const seen = new Set();
    const isRomance = params.genre === '10749';
    const romanceKeywords = ['erotic','sexy','seductive','tempting','forbidden','taboo','mature','adult','nude','nudity','sexual','intimate','passionate','steamy','stepmom','stepmother','provocative','suggestive'];
    let p1, p2;
    if (params.query) {
      p1 = fetchTMDB('/search/movie', { query: params.query, page: tmdbPage1 });
      p2 = fetchTMDB('/search/movie', { query: params.query, page: tmdbPage2 });
    } else {
      const discoverParams = { sort_by: params.sort || 'popularity.desc' };
      if (params.year) discoverParams.primary_release_year = params.year;
      if (params.genre) discoverParams.with_genres = params.genre;
      p1 = fetchTMDB('/discover/movie', { ...discoverParams, page: tmdbPage1 });
      p2 = fetchTMDB('/discover/movie', { ...discoverParams, page: tmdbPage2 });
    }
    const processResults = (data) => {
      let filtered = filterAdultContent(data.results || []);
      if (isRomance) filtered = filtered.filter(m => { const t = (m.title || '').toLowerCase(); const o = (m.overview || '').toLowerCase(); return !romanceKeywords.some(k => t.includes(k) || o.includes(k)); });
      return filtered.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
    };
    const [d1, d2] = await Promise.all([p1, p2]);
    totalPages = Math.ceil((d1.total_results || 0) / ITEMS_PER_PAGE);
    const results1 = processResults(d1), results2 = processResults(d2);
    if (results1.length > 0 || results2.length > 0) { grid.innerHTML = [...results1, ...results2].map(createMovieCard).join(''); observeCards(grid); }
    else grid.innerHTML = '<div style="color:var(--text-muted);padding:2rem;text-align:center;">No movies found.</div>';
    moviesTotalPages = totalPages;
    renderPagination('movies-pagination', page, totalPages, (p) => { renderMoviesList(moviesLastParams, p); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  } catch (e) { grid.innerHTML = '<div style="color:var(--accent);padding:2rem;">Failed to load movies.</div>'; }
}

async function populateGenreDropdown() {
  const select = document.getElementById('genre-select');
  if (!select) return;
  select.innerHTML = '<option value="">All Genres</option>';
  try { const genres = await fetchGenres(); genres.forEach(g => { const opt = document.createElement('option'); opt.value = g.id; opt.textContent = g.name; select.appendChild(opt); }); } catch { /* silent */ }
}

if (document.getElementById('movies-grid')) {
  loadGenreMaps().then(() => {
    populateGenreDropdown();
    renderMoviesList();
    const movieQueryInput = document.getElementById('movie-query');
    if (movieQueryInput) initSearchAutocomplete(movieQueryInput, { type: 'movie' });
  });
  document.getElementById('movie-filter-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const query = document.getElementById('movie-query').value.trim();
    const genre = document.getElementById('genre-select').value;
    const year = document.getElementById('movie-year').value.trim();
    const sort = document.getElementById('movie-sort').value;
    renderMoviesList({ query, genre, year, sort }, 1);
  });
}

// ============================================================
// SERIES LIST PAGE
// ============================================================
async function fetchSeriesGenres() { const data = await fetchTMDB('/genre/tv/list'); return data.genres; }

let seriesCurrentPage = 1, seriesLastParams = {}, seriesTotalPages = 1;

async function renderSeriesList(params = {}, page = 1) {
  const grid = document.getElementById('series-grid');
  if (!grid) return;
  grid.innerHTML = createSkeletonGrid(20);
  seriesLastParams = params; seriesCurrentPage = page;
  try {
    const tmdbPage1 = (page * 2) - 1, tmdbPage2 = page * 2;
    let totalPages = 1;
    const seen = new Set();
    let p1, p2;
    if (params.query) {
      p1 = fetchTMDB('/search/tv', { query: params.query, page: tmdbPage1 });
      p2 = fetchTMDB('/search/tv', { query: params.query, page: tmdbPage2 });
    } else {
      const discoverParams = { sort_by: params.sort || 'popularity.desc' };
      if (params.year) discoverParams.first_air_date_year = params.year;
      if (params.genre) discoverParams.with_genres = params.genre;
      p1 = fetchTMDB('/discover/tv', { ...discoverParams, page: tmdbPage1 });
      p2 = fetchTMDB('/discover/tv', { ...discoverParams, page: tmdbPage2 });
    }
    const processResults = (data) => { let filtered = filterAdultContent(data.results || []); return filtered.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; }); };
    const [d1, d2] = await Promise.all([p1, p2]);
    totalPages = Math.ceil((d1.total_results || 0) / ITEMS_PER_PAGE);
    const results1 = processResults(d1), results2 = processResults(d2);
    if (results1.length > 0 || results2.length > 0) { grid.innerHTML = [...results1, ...results2].map(createSeriesCard).join(''); observeCards(grid); }
    else grid.innerHTML = '<div style="color:var(--text-muted);padding:2rem;text-align:center;">No series found.</div>';
    seriesTotalPages = totalPages;
    renderPagination('series-pagination', page, totalPages, (p) => { renderSeriesList(seriesLastParams, p); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  } catch (e) { grid.innerHTML = '<div style="color:var(--accent);padding:2rem;">Failed to load series.</div>'; }
}

async function populateSeriesGenreDropdown() {
  const select = document.getElementById('series-genre-select');
  if (!select) return;
  select.innerHTML = '<option value="">All Genres</option>';
  try { const genres = await fetchSeriesGenres(); genres.forEach(g => { const opt = document.createElement('option'); opt.value = g.id; opt.textContent = g.name; select.appendChild(opt); }); } catch { /* silent */ }
}

if (document.getElementById('series-grid')) {
  loadGenreMaps().then(() => {
    populateSeriesGenreDropdown();
    renderSeriesList();
    const seriesQueryInput = document.getElementById('series-query');
    if (seriesQueryInput) initSearchAutocomplete(seriesQueryInput, { type: 'tv' });
  });
  document.getElementById('series-filter-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const query = document.getElementById('series-query').value.trim();
    const genre = document.getElementById('series-genre-select').value;
    const year = document.getElementById('series-year').value.trim();
    const sort = document.getElementById('series-sort').value;
    renderSeriesList({ query, genre, year, sort }, 1);
  });
}

// ============================================================
// MOVIE DETAIL PAGE
// ============================================================
async function renderMovieDetail() {
  const posterCard = document.getElementById('movie-poster-card');
  const infoCard = document.getElementById('movie-info-card');
  const heroBg = document.getElementById('movie-hero-bg');
  const playerSection = document.getElementById('movie-player-section');
  const castSection = document.getElementById('movie-cast-section');
  const trailerSection = document.getElementById('movie-trailer-section');
  const recsSection = document.getElementById('movie-recommendations');
  if (!posterCard || !infoCard || !heroBg || !playerSection || !castSection) return;

  const urlParams = new URLSearchParams(window.location.search);
  const movieId = urlParams.get('id');
  if (!movieId) { infoCard.innerHTML = '<div style="color:var(--accent);padding:2rem;">Movie not found.</div>'; return; }

  infoCard.innerHTML = '<div class="spinner" style="margin:4rem auto;"></div>';

  try {
    const [movie, credits, videos] = await Promise.all([
      fetchTMDB(`/movie/${movieId}`),
      fetchTMDB(`/movie/${movieId}/credits`),
      fetchTMDB(`/movie/${movieId}/videos`)
    ]);
    const cast = (credits.cast || []).slice(0, 12);
    const trailer = (videos.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer');

    document.title = `${movie.title} — Poflix`;

    // Hero backdrop
    if (movie.backdrop_path) {
      heroBg.style.backgroundImage = `url(https://image.tmdb.org/t/p/original${movie.backdrop_path})`;
      heroBg.style.cssText += 'background-size:cover;background-position:center top;';
    }

    // Poster
    posterCard.innerHTML = movie.poster_path
      ? `<img src="https://image.tmdb.org/t/p/w500${movie.poster_path}" alt="${movie.title}" loading="lazy">`
      : '<div style="width:100%;aspect-ratio:2/3;background:var(--surface);border-radius:var(--radius-lg);"></div>';

    // Info
    const isW = isWatched(movie.id);
    const isWL = isWishlisted(movie.id);
    const genres = (movie.genres || []).map(g => `<span class="genre-chip">${g.name}</span>`).join('');
    const runtime = movie.runtime ? `${Math.floor(movie.runtime/60)}h ${movie.runtime%60}m` : '';
    infoCard.innerHTML = `
      <h1 class="detail-title">${movie.title}</h1>
      <div class="detail-meta">
        ${movie.release_date ? `<span class="badge">${movie.release_date.slice(0,4)}</span>` : ''}
        ${runtime ? `<span class="badge">${runtime}</span>` : ''}
        ${movie.vote_average ? `<span class="badge rating-badge">⭐ ${movie.vote_average.toFixed(1)}</span>` : ''}
      </div>
      <div class="detail-genres">${genres}</div>
      <p class="detail-overview">${movie.overview || ''}</p>
      <div class="detail-actions">
        <button class="btn-primary" onclick="switchPlayerSource(0); document.getElementById('movie-player-section').scrollIntoView({behavior:'smooth'});">▶ Watch Now</button>
        <button class="btn-watched-detail${isW ? ' active' : ''}" onclick="toggleWatched({id:'${movie.id}', title:'${(movie.title||'').replace(/'/g,"\\'")}', poster_path:'${movie.poster_path}', type:'movie'}, this)">
          ${isW ? '✔ Watched' : '👁️ Mark Watched'}
        </button>
        <button class="btn-wishlist-detail${isWL ? ' active' : ''}" data-wishlist-id="${movie.id}" onclick="toggleWishlist({id:'${movie.id}', title:'${(movie.title||'').replace(/'/g,"\\'")}', poster_path:'${movie.poster_path}', type:'movie'}, this)">
          ${isWL ? '📌 In Wishlist' : '🔖 Watch Later'}
        </button>
      </div>`;

    // Player
    const imdbId = movie.imdb_id || movieId;
    const streamUrls = [
      `https://vidlink.pro/movie/${movieId}`,
      `https://vidsrc.xyz/embed/movie?tmdb=${movieId}`,
      `https://vidsrc.wtf/api/1/movie/?id=${movieId}`,
      `https://player.videasy.net/movie/${movieId}`,
      `https://111movies.com/movie/${imdbId}`
    ];
    initPlayerState(streamUrls, 'movie', movieId, null, null);
    playerSection.innerHTML = buildPlayerHTML(streamUrls, movieId, 'movie');

    // Trailer
    if (trailer && trailerSection) {
      trailerSection.innerHTML = `
        <div class="trailer-section">
          <h3>🎬 Official Trailer</h3>
          <div class="trailer-embed">
            <iframe src="https://www.youtube-nocookie.com/embed/${trailer.key}?rel=0&modestbranding=1" allowfullscreen></iframe>
          </div>
        </div>`;
    }

    // Cast
    if (cast.length > 0) {
      castSection.innerHTML = `
        <div class="cast-section">
          <h3>🎭 Cast</h3>
          <div class="cast-list">
            ${cast.map(actor => `
              <a href="search.html?q=${encodeURIComponent(actor.name)}" class="cast-card">
                ${actor.profile_path ? `<img src="https://image.tmdb.org/t/p/w185${actor.profile_path}" alt="${actor.name}">` : '<div style="width:72px;height:72px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;margin:0 auto 0.5rem;">🎭</div>'}
                <div class="cast-name">${actor.name}</div>
                <div class="cast-character">${actor.character || ''}</div>
              </a>`).join('')}
          </div>
        </div>`;
    }

    // Recommendations
    if (recsSection) {
      try {
        const recs = await fetchTMDB(`/movie/${movieId}/recommendations`);
        const filteredRecs = filterAdultContent(recs.results || []).slice(0, 10);
        if (filteredRecs.length > 0) {
          recsSection.innerHTML = `
            <div class="recs-section">
              <h3>💡 You Might Also Like</h3>
              <div class="recommendations-grid">${filteredRecs.map(createCarouselMovieCard).join('')}</div>
            </div>`;
          observeCards(recsSection);
        }
      } catch { /* silent */ }
    }
  } catch (e) {
    infoCard.innerHTML = '<div style="color:var(--accent);padding:2rem;">Failed to load movie details.</div>';
  }
}

// ============================================================
// SERIES DETAIL PAGE
// ============================================================
async function renderSeriesDetail() {
  const posterCard = document.getElementById('series-poster-card');
  const infoCard = document.getElementById('series-info-card');
  const heroBg = document.getElementById('series-hero-bg');
  const playerSection = document.getElementById('series-player-section');
  const castSection = document.getElementById('series-cast-section');
  const trailerSection = document.getElementById('series-trailer-section');
  const recsSection = document.getElementById('series-recommendations');
  if (!posterCard || !infoCard || !heroBg || !playerSection || !castSection) return;

  const urlParams = new URLSearchParams(window.location.search);
  const seriesId = urlParams.get('id');
  if (!seriesId) { infoCard.innerHTML = '<div style="color:var(--accent);padding:2rem;">Series not found.</div>'; return; }

  infoCard.innerHTML = '<div class="spinner" style="margin:4rem auto;"></div>';

  try {
    const [series, credits, videos] = await Promise.all([
      fetchTMDB(`/tv/${seriesId}`),
      fetchTMDB(`/tv/${seriesId}/credits`),
      fetchTMDB(`/tv/${seriesId}/videos`)
    ]);
    const cast = (credits.cast || []).slice(0, 12);
    const trailer = (videos.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer');
    const seasons = (series.seasons || []).filter(s => s.season_number > 0);

    document.title = `${series.name} — Poflix`;

    // Hero
    if (series.backdrop_path) {
      heroBg.style.backgroundImage = `url(https://image.tmdb.org/t/p/original${series.backdrop_path})`;
      heroBg.style.cssText += 'background-size:cover;background-position:center top;';
    }

    // Poster
    posterCard.innerHTML = series.poster_path
      ? `<img src="https://image.tmdb.org/t/p/w500${series.poster_path}" alt="${series.name}" loading="lazy">`
      : '<div style="width:100%;aspect-ratio:2/3;background:var(--surface);border-radius:var(--radius-lg);"></div>';

    // Info
    const isW = isWatched(series.id);
    const isWL = isWishlisted(series.id);
    const genres = (series.genres || []).map(g => `<span class="genre-chip">${g.name}</span>`).join('');
    infoCard.innerHTML = `
      <h1 class="detail-title">${series.name}</h1>
      <div class="detail-meta">
        ${series.first_air_date ? `<span class="badge">${series.first_air_date.slice(0,4)}</span>` : ''}
        <span class="badge">${series.number_of_seasons || '?'} Seasons</span>
        ${series.vote_average ? `<span class="badge rating-badge">⭐ ${series.vote_average.toFixed(1)}</span>` : ''}
      </div>
      <div class="detail-genres">${genres}</div>
      <p class="detail-overview">${series.overview || ''}</p>
      <div class="detail-actions">
        <button class="btn-primary" onclick="document.getElementById('series-player-section').scrollIntoView({behavior:'smooth'});">▶ Watch Now</button>
        <button class="btn-watched-detail${isW ? ' active' : ''}" onclick="toggleWatched({id:'${series.id}', title:'${(series.name||'').replace(/'/g,"\\'")}', poster_path:'${series.poster_path}', type:'tv'}, this)">
          ${isW ? '✔ Watched' : '👁️ Mark Watched'}
        </button>
        <button class="btn-wishlist-detail${isWL ? ' active' : ''}" data-wishlist-id="${series.id}" onclick="toggleWishlist({id:'${series.id}', title:'${(series.name||'').replace(/'/g,"\\'")}', poster_path:'${series.poster_path}', type:'tv'}, this)">
          ${isWL ? '📌 In Wishlist' : '🔖 Watch Later'}
        </button>
      </div>`;

    // Seasons + Player
    let currentSeasonIdx = 0, currentEpisode = 1;

    async function renderSeriesPlayerSection(fade = false) {
      const season = seasons[currentSeasonIdx];
      if (!season) return;
      let episodes = [];
      if (fade) playerSection.innerHTML = '<div class="spinner" style="margin:2rem auto;"></div>';
      try { const sd = await fetchTMDB(`/tv/${seriesId}/season/${season.season_number}`); episodes = sd.episodes || []; } catch {}

      const streamUrls = [
        `https://vidlink.pro/tv/${seriesId}/${season.season_number}/${currentEpisode}`,
        `https://vidsrc.xyz/embed/tv?tmdb=${seriesId}&season=${season.season_number}&episode=${currentEpisode}`,
        `https://vidsrc.wtf/api/1/tv/?id=${seriesId}&s=${season.season_number}&e=${currentEpisode}`,
        `https://player.videasy.net/tv/${seriesId}/${season.season_number}/${currentEpisode}`,
        `https://111movies.com/tv/${seriesId}/${season.season_number}/${currentEpisode}?autoPlay=true`
      ];
      initPlayerState(streamUrls, 'tv', seriesId, season.season_number, currentEpisode);

      const seasonTabs = seasons.map((s, i) =>
        `<button class="season-tab${i === currentSeasonIdx ? ' active' : ''}" data-season-idx="${i}">Season ${s.season_number}</button>`
      ).join('');

      const episodesList = episodes.map(ep => `
        <div class="episode-card${ep.episode_number === currentEpisode ? ' active' : ''}" data-ep="${ep.episode_number}">
          ${ep.still_path ? `<img class="episode-thumb" src="https://image.tmdb.org/t/p/w300${ep.still_path}" alt="${ep.name}" loading="lazy">` : '<div class="episode-thumb-placeholder">📺</div>'}
          <div class="episode-info">
            <div class="episode-num">Ep ${ep.episode_number}</div>
            <div class="episode-title">${ep.name}</div>
            <div class="episode-date">${ep.air_date || ''}</div>
          </div>
        </div>`).join('');

      playerSection.innerHTML = `
        <div class="seasons-section">
          <div class="season-tabs" id="season-tabs">${seasonTabs}</div>
          <div class="episodes-grid" id="episodes-grid">${episodesList}</div>
        </div>
        ${buildPlayerHTML(streamUrls, seriesId, 'tv', { season: season.season_number, episode: currentEpisode })}`;

      // Season tab events
      playerSection.querySelectorAll('.season-tab').forEach((btn, i) => {
        btn.onclick = async () => { currentSeasonIdx = i; currentEpisode = 1; await renderSeriesPlayerSection(true); };
      });
      // Episode card events
      playerSection.querySelectorAll('.episode-card').forEach(card => {
        card.onclick = async () => {
          const ep = parseInt(card.getAttribute('data-ep'));
          if (!isNaN(ep)) { currentEpisode = ep; await renderSeriesPlayerSection(true); }
        };
      });
    }

    await renderSeriesPlayerSection();

    // Trailer
    if (trailer && trailerSection) {
      trailerSection.innerHTML = `
        <div class="trailer-section">
          <h3>🎬 Official Trailer</h3>
          <div class="trailer-embed">
            <iframe src="https://www.youtube-nocookie.com/embed/${trailer.key}?rel=0&modestbranding=1" allowfullscreen></iframe>
          </div>
        </div>`;
    }

    // Cast
    if (cast.length > 0) {
      castSection.innerHTML = `
        <div class="cast-section">
          <h3>🎭 Cast</h3>
          <div class="cast-list">
            ${cast.map(actor => `
              <a href="search.html?q=${encodeURIComponent(actor.name)}" class="cast-card">
                ${actor.profile_path ? `<img src="https://image.tmdb.org/t/p/w185${actor.profile_path}" alt="${actor.name}">` : '<div style="width:72px;height:72px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;margin:0 auto 0.5rem;">🎭</div>'}
                <div class="cast-name">${actor.name}</div>
                <div class="cast-character">${actor.character || ''}</div>
              </a>`).join('')}
          </div>
        </div>`;
    }

    // Recommendations
    if (recsSection) {
      try {
        const recs = await fetchTMDB(`/tv/${seriesId}/recommendations`);
        const filteredRecs = filterAdultContent(recs.results || []).slice(0, 10);
        if (filteredRecs.length > 0) {
          recsSection.innerHTML = `
            <div class="recs-section">
              <h3>💡 You Might Also Like</h3>
              <div class="recommendations-grid">${filteredRecs.map(createCarouselSeriesCard).join('')}</div>
            </div>`;
          observeCards(recsSection);
        }
      } catch { /* silent */ }
    }
  } catch (e) {
    infoCard.innerHTML = '<div style="color:var(--accent);padding:2rem;">Failed to load series details.</div>';
  }
}

// ============================================================
// SEARCH PAGE
// ============================================================
async function renderSearchResults() {
  const moviesGrid = document.getElementById('search-movies');
  const seriesGrid = document.getElementById('search-series');
  const actorDiv = document.getElementById('search-actor');
  const titleEl = document.getElementById('search-title');
  const moviesSection = document.getElementById('search-movies-section');
  const seriesSection = document.getElementById('search-series-section');
  if (!moviesGrid || !seriesGrid || !actorDiv) return;

  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q');

  // Pre-fill input
  const searchInput = document.getElementById('search-page-input');
  if (searchInput && query) searchInput.value = query;

  if (!query) { if (titleEl) titleEl.innerHTML = 'Enter a search query to get started'; return; }
  if (titleEl) titleEl.innerHTML = `Results for <span>"${query}"</span>`;

  moviesGrid.innerHTML = createSkeletonGrid(8);
  seriesGrid.innerHTML = createSkeletonGrid(8);
  actorDiv.innerHTML = '<div class="spinner" style="margin:1rem auto;"></div>';

  try {
    await loadGenreMaps();
    const [movieData, seriesData, personData] = await Promise.all([
      fetchTMDB('/search/movie', { query, page: 1 }),
      fetchTMDB('/search/tv', { query, page: 1 }),
      fetchTMDB('/search/person', { query })
    ]);

    // Movies
    const filteredMovies = filterAdultContent(movieData.results || []);
    if (filteredMovies.length > 0) {
      moviesGrid.innerHTML = filteredMovies.slice(0, 12).map(createMovieCard).join('');
      observeCards(moviesGrid);
      if (moviesSection) moviesSection.style.display = 'block';
    } else {
      moviesGrid.innerHTML = '<div style="color:var(--text-muted);padding:1rem;">No movies found.</div>';
      if (moviesSection) moviesSection.style.display = 'block';
    }

    // Series
    const filteredSeries = filterAdultContent(seriesData.results || []);
    if (filteredSeries.length > 0) {
      seriesGrid.innerHTML = filteredSeries.slice(0, 12).map(createSeriesCard).join('');
      observeCards(seriesGrid);
      if (seriesSection) seriesSection.style.display = 'block';
    } else {
      seriesGrid.innerHTML = '<div style="color:var(--text-muted);padding:1rem;">No series found.</div>';
      if (seriesSection) seriesSection.style.display = 'block';
    }

    // Actor
    if (personData.results && personData.results.length > 0) {
      const actor = personData.results[0];
      let actorMovies = [], actorSeries = [], actorDetails = {};
      try {
        const [details, movieCredits, tvCredits] = await Promise.all([
          fetchTMDB(`/person/${actor.id}`),
          fetchTMDB(`/person/${actor.id}/movie_credits`),
          fetchTMDB(`/person/${actor.id}/tv_credits`)
        ]);
        actorDetails = details || {};
        actorMovies = filterAdultContent(movieCredits.cast || []);
        actorSeries = filterAdultContent(tvCredits.cast || []);
      } catch {}

      const bio = actorDetails.biography || '';
      const birthday = actorDetails.birthday || '';
      const deathday = actorDetails.deathday || '';
      const birthplace = actorDetails.place_of_birth || '';
      const age = birthday ? Math.floor((Date.now() - new Date(birthday).getTime()) / (365.25*24*60*60*1000)) : '';
      const bioShort = bio.length > 400 ? bio.slice(0, 400) + '...' : bio;

      let actorHtml = `
        <div class="actor-profile-card">
          ${actor.profile_path ? `<img src="https://image.tmdb.org/t/p/w185${actor.profile_path}" alt="${actor.name}">` : '<div style="width:120px;height:120px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:2.5rem;flex-shrink:0;">🎭</div>'}
          <div class="actor-info">
            <div class="actor-name">${actor.name}</div>
            <div class="actor-chips">
              <span class="actor-chip">${actorDetails.known_for_department || actor.known_for_department || 'Acting'}</span>
              ${actorMovies.length ? `<span class="actor-chip">🎬 ${actorMovies.length} Movies</span>` : ''}
              ${actorSeries.length ? `<span class="actor-chip">📺 ${actorSeries.length} Series</span>` : ''}
            </div>
            <div style="display:flex;gap:1rem;flex-wrap:wrap;font-size:0.82rem;color:var(--text-muted);margin-bottom:0.6rem;">
              ${birthday ? `<span>🎂 ${birthday}${age ? ` (${age} yrs)` : ''}</span>` : ''}
              ${deathday ? `<span>✝ ${deathday}</span>` : ''}
              ${birthplace ? `<span>📍 ${birthplace}</span>` : ''}
            </div>
            ${bioShort ? `<div id="actor-bio-text" class="actor-bio">${bioShort}${bio.length > 400 ? `<button id="actor-bio-expand" class="actor-bio-expand">Read more</button>` : ''}</div>` : ''}
          </div>
        </div>`;

      const showCount = 8;
      if (actorMovies.length > 0) {
        actorHtml += `<h3 style="margin:1rem 0 0.75rem;font-size:1rem;font-weight:600;color:var(--text-secondary);">🎬 Movies (${actorMovies.length})</h3><div class="search-grid" id="actor-movies-grid">${actorMovies.slice(0, showCount).map(createMovieCard).join('')}</div>`;
        if (actorMovies.length > showCount) actorHtml += `<button id="show-more-actor-movies" class="btn-secondary" style="margin:1rem 0;">Show All ${actorMovies.length} Movies</button>`;
      }
      if (actorSeries.length > 0) {
        actorHtml += `<h3 style="margin:1rem 0 0.75rem;font-size:1rem;font-weight:600;color:var(--text-secondary);">📺 Series (${actorSeries.length})</h3><div class="search-grid" id="actor-series-grid">${actorSeries.slice(0, showCount).map(createSeriesCard).join('')}</div>`;
        if (actorSeries.length > showCount) actorHtml += `<button id="show-more-actor-series" class="btn-secondary" style="margin:1rem 0;">Show All ${actorSeries.length} Series</button>`;
      }

      actorDiv.innerHTML = actorHtml;
      const bioBtn = document.getElementById('actor-bio-expand');
      if (bioBtn) bioBtn.onclick = () => { document.getElementById('actor-bio-text').innerHTML = bio; };
      const moreMoviesBtn = document.getElementById('show-more-actor-movies');
      if (moreMoviesBtn) moreMoviesBtn.onclick = () => { document.getElementById('actor-movies-grid').innerHTML = actorMovies.map(createMovieCard).join(''); observeCards(document.getElementById('actor-movies-grid')); moreMoviesBtn.style.display = 'none'; };
      const moreSeriesBtn = document.getElementById('show-more-actor-series');
      if (moreSeriesBtn) moreSeriesBtn.onclick = () => { document.getElementById('actor-series-grid').innerHTML = actorSeries.map(createSeriesCard).join(''); observeCards(document.getElementById('actor-series-grid')); moreSeriesBtn.style.display = 'none'; };
      observeCards(actorDiv);
    } else {
      actorDiv.innerHTML = '';
    }
  } catch (e) {
    moviesGrid.innerHTML = seriesGrid.innerHTML = actorDiv.innerHTML = '<div style="color:var(--accent);padding:1rem;">Failed to load search results.</div>';
  }
}

if (document.getElementById('search-movies')) renderSearchResults();

// --- Init Detail Pages ---
if (document.getElementById('movie-poster-card')) loadGenreMaps().then(() => renderMovieDetail());
if (document.getElementById('series-poster-card')) loadGenreMaps().then(() => renderSeriesDetail());

// ============================================================
// PROFILE PAGE
// ============================================================
function renderProfilePage() {
  const watchedGrid = document.getElementById('watched-movies-grid');
  if (!watchedGrid) return;

  // Profile header
  const profileHeader = document.getElementById('profile-header');
  if (profileHeader) {
    const storedUser = localStorage.getItem('poflix_user_info');
    const user = storedUser ? JSON.parse(storedUser) : null;
    if (user) {
      profileHeader.innerHTML = `
        <img src="${user.picture}" alt="${user.name}" class="profile-avatar">
        <div>
          <div class="profile-name">${user.name}</div>
          <div class="profile-email">${user.email || ''}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
          <a href="login.html" class="btn-secondary" style="padding:0.5rem 1rem;font-size:0.875rem;">Switch Account</a>
          <button onclick="logout()" class="btn-secondary" style="padding:0.5rem 1rem;font-size:0.875rem;">Logout</button>
        </div>`;
    } else {
      profileHeader.innerHTML = `
        <div style="font-size:2.5rem;">👤</div>
        <div>
          <div class="profile-name">Guest User</div>
          <div class="profile-email">Not signed in</div>
        </div>
        <div style="margin-left:auto;">
          <a href="login.html" class="profile-login-btn">🔐 Sign In with Google</a>
        </div>`;
    }
  }

  // Stats
  const statsGrid = document.getElementById('stats-grid');
  if (statsGrid) {
    const watched = getStorage('watched') || [];
    const wishlist = getStorage('wishlist') || [];
    const meta = getStorage('watched_metadata') || {};
    let totalMinutes = 0;
    const genreCounts = {};
    watched.forEach(item => {
      const m = meta[item.id];
      if (m) { totalMinutes += m.runtime || 0; (m.genres || []).forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; }); }
    });
    const hours = Math.floor(totalMinutes / 60);
    const topGenres = Object.entries(genreCounts).sort((a,b) => b[1]-a[1]).slice(0, 3);
    statsGrid.innerHTML = `
      <div class="stat-card"><div class="stat-value">${watched.length}</div><div class="stat-label">Watched Titles</div></div>
      <div class="stat-card"><div class="stat-value">${hours}h</div><div class="stat-label">Watch Time</div></div>
      <div class="stat-card"><div class="stat-value">${wishlist.length}</div><div class="stat-label">In Wishlist</div></div>
      <div class="stat-card"><div class="stat-value">${watched.filter(i => i.type === 'movie').length}</div><div class="stat-label">Movies</div></div>
      <div class="stat-card"><div class="stat-value">${watched.filter(i => i.type !== 'movie').length}</div><div class="stat-label">Series</div></div>
      <div class="stat-card"><div class="stat-value">${topGenres[0]?.[0] || '—'}</div><div class="stat-label">Fave Genre</div></div>`;

    // Genre chart
    const genreChartSection = document.getElementById('genre-chart-section');
    const genreChart = document.getElementById('genre-chart');
    if (genreChart && topGenres.length > 0) {
      const max = topGenres[0][1];
      genreChart.innerHTML = topGenres.map(([g, count]) => `
        <div class="genre-bar">
          <span class="genre-bar-name">${g}</span>
          <div class="genre-bar-track"><div class="genre-bar-fill" style="width:${(count/max)*100}%"></div></div>
          <span class="genre-bar-count">${count}</span>
        </div>`).join('');
      if (genreChartSection) genreChartSection.style.display = 'block';
    }
  }

  // Theme swatches
  const themeSwatches = document.getElementById('theme-swatches');
  if (themeSwatches) themeManager.renderSwatches(themeSwatches);

  // Watch history
  const watched = getStorage('watched') || [];
  if (watched.length > 0) {
    const items = watched.slice(0, 20).map(item => {
      const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : '';
      if (!posterUrl) return '';
      const href = item.type === 'movie' ? `movie_detail.html?id=${item.id}` : `series_detail.html?id=${item.id}`;
      return `<a href="${href}" class="animated-card" data-id="${item.id}">
        <img src="${posterUrl}" alt="${item.title}" loading="lazy">
        <div class="movie-title">${item.title}</div>
      </a>`;
    }).join('');
    watchedGrid.innerHTML = items || '<div class="empty-state"><div class="empty-icon">📺</div><h3>No watch history yet</h3><p>Movies and series you mark as watched will appear here.</p></div>';
    observeCards(watchedGrid);
  } else {
    watchedGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">📺</div><h3>No watch history yet</h3><p>Mark movies or series as watched to track them here.</p></div>';
  }
}

if (document.getElementById('watched-movies-grid')) {
  loadGenreMaps().then(() => renderProfilePage());
}

// ============================================================
// WISHLIST PAGE
// ============================================================
let _wishlistFilter = 'all';

function switchWishlistTab(type) {
  _wishlistFilter = type;
  document.querySelectorAll('.wishlist-tab').forEach(t => {
    t.classList.toggle('active', t.id === `wishlist-tab-${type}`);
  });
  renderWishlistPage();
}

function renderWishlistPage() {
  const grid = document.getElementById('wishlist-movies-grid');
  if (!grid) return;
  const wishlist = getStorage('wishlist') || [];
  let items = wishlist;
  if (_wishlistFilter === 'movies') items = wishlist.filter(i => i.type === 'movie');
  if (_wishlistFilter === 'series') items = wishlist.filter(i => i.type !== 'movie');

  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">🔖</div><h3>Your wishlist is empty</h3><p>Add movies and series you want to watch later.</p><a href="movies.html" class="btn-primary" style="margin-top:1rem;text-decoration:none;">Browse Movies</a></div>`;
    return;
  }
  grid.innerHTML = items.map(item => {
    const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : '';
    if (!posterUrl) return '';
    const href = item.type === 'movie' ? `movie_detail.html?id=${item.id}` : `series_detail.html?id=${item.id}`;
    return `<a href="${href}" class="animated-card" data-id="${item.id}">
      <button class="btn-wishlist active" data-wishlist-id="${item.id}" onclick="event.preventDefault(); toggleWishlist({id:'${item.id}', title:'${(item.title||'').replace(/'/g,"\\'")}', poster_path:'${item.poster_path}', type:'${item.type}'}, this)" aria-label="Remove from wishlist">
        <span class="icon-bookmark">📌</span>
      </button>
      <img src="${posterUrl}" alt="${item.title}" loading="lazy">
      <div class="movie-title">${item.title}</div>
    </a>`;
  }).join('');
  observeCards(grid);
}

if (document.getElementById('wishlist-movies-grid')) {
  loadGenreMaps().then(() => renderWishlistPage());
}

// ============================================================
// INTERSECTION OBSERVER — Card Animations
// ============================================================
function observeCards(container) {
  if (!container || !('IntersectionObserver' in window)) return;
  const cards = container.querySelectorAll('.animated-card, .carousel-card');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const card = entry.target;
        const delay = parseInt(card.dataset.obsIdx || 0) * 50;
        setTimeout(() => { card.classList.add('visible'); }, delay);
        observer.unobserve(card);
      }
    });
  }, { threshold: 0.05 });
  cards.forEach((card, i) => { card.dataset.obsIdx = i; observer.observe(card); });
}

// ============================================================
// RANDOM DISCOVERY
// ============================================================
async function rollDice() {
  showToast('🎲 Finding something great for you...', 'default', 2000);
  try {
    const randomPage = Math.floor(Math.random() * 5) + 1;
    const data = await fetchTMDB('/movie/top_rated', { page: randomPage });
    const movies = filterAdultContent(data.results || []);
    if (movies.length === 0) return;
    window.location.href = `movie_detail.html?id=${movies[Math.floor(Math.random() * movies.length)].id}`;
  } catch { showToast('🎲 The dice rolled too fast. Try again!', 'error'); }
}

// ============================================================
// DOM READY — Navbar, Scroll, Auth
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Hamburger toggle
  const toggle = document.getElementById('navbar-toggle');
  const nav = document.getElementById('navbar-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('open');
      nav.classList.toggle('open');
    });
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!toggle.contains(e.target) && !nav.contains(e.target)) {
        toggle.classList.remove('open');
        nav.classList.remove('open');
      }
    });
  }

  // Add Dice link to navbar
  if (nav && !nav.querySelector('.dice-link')) {
    const li = document.createElement('li');
    li.innerHTML = '<a href="#" onclick="event.preventDefault(); rollDice();" class="dice-link" title="Random Discovery">🎲</a>';
    nav.insertBefore(li, nav.querySelector('.auth-link'));
  }

  // Navbar scroll effect
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 40), { passive: true });
  }

  // Back to top
  const backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    window.addEventListener('scroll', () => backToTop.classList.toggle('visible', window.scrollY > 400), { passive: true });
    backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // Multi-tab sync
  window.addEventListener('storage', (e) => {
    if (e.key === 'watched') triggerUIRefresh('watched');
    if (e.key === 'wishlist') triggerUIRefresh('wishlist');
  });

  // Global navbar search autocomplete
  const navbarSearchInput = document.getElementById('nav-search-input');
  if (navbarSearchInput) initSearchAutocomplete(navbarSearchInput, { type: 'multi' });

  // Search page autocomplete
  const searchPageInput = document.getElementById('search-page-input');
  if (searchPageInput) initSearchAutocomplete(searchPageInput, { type: 'multi' });

  // Active nav link highlight
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  if (nav) {
    nav.querySelectorAll('li a').forEach(link => {
      const href = link.getAttribute('href');
      if (href === currentPage || (currentPage === '' && href === 'index.html')) link.classList.add('active');
    });
  }
});
