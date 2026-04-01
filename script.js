// ============================================
// Poflix — Enhanced Script (with Google Sheets DB)
// ============================================

// --- Google API Initialization ---
let tokenClient;
let gapiInited = false;
let gisInited = false;
let googleUser = null;
let spreadsheetId = localStorage.getItem('poflix_spreadsheet_id');

// Setup Google APIs
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
  await gapi.client.init({
    apiKey: GOOGLE_API_KEY,
    discoveryDocs: DISCOVERY_DOCS,
  });
  gapiInited = true;
  maybeStartAuth();
}

function initializeGisClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse.access_token) {
        localStorage.setItem('poflix_auth_token', tokenResponse.access_token);
        localStorage.setItem('poflix_auth_expires', Date.now() + (tokenResponse.expires_in * 1000));
        gapi.client.setToken(tokenResponse);
        checkUserStatus().then(() => {
          if (window.location.pathname.includes('login.html')) {
            window.location.href = 'profile.html';
          }
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
    alert("Google Service is still loading. Please wait a second and try again.");
  }
}

function maybeStartAuth() {
  if (gapiInited && gisInited) {
    const savedToken = localStorage.getItem('poflix_auth_token');
    const expires = localStorage.getItem('poflix_auth_expires');
    
    // Check if token exists and isn't expired
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
      
      // Start the "Background Pulse" polled sync every 60s
      if (!window.syncInterval) {
        window.syncInterval = setInterval(() => {
          syncFromSheets('watched');
          syncFromSheets('wishlist');
        }, 60000);
      }
    }
  } catch (e) {
    console.error("Auth check failed", e);
    logout();
  }
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
  
  // Hide the original Profile link to prevent duplicates
  const allLinks = navContainer.querySelectorAll('li a');
  allLinks.forEach(link => {
    if (link.getAttribute('href') === 'profile.html' && !link.classList.contains('nav-user')) {
      link.parentElement.style.display = 'none';
    }
  });

  let authLink = navContainer.querySelector('.auth-link');
  if (!authLink) {
    authLink = document.createElement('li');
    authLink.className = 'auth-link';
    navContainer.appendChild(authLink);
  }

  if (googleUser) {
    // Extract first name for a cleaner UI
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
      </div>
    `;
  } else {
    authLink.innerHTML = `<a href="login.html" class="btn-login-nav">Login</a>`;
  }
}

// Spreadsheet DB Logic
async function findOrCreateSpreadsheet() {
  try {
    const listRes = await gapi.client.drive.files.list({
      q: "name = 'Poflix_Watched_Data' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: 'files(id, name)',
    });
    const files = listRes.result.files;
    if (files && files.length > 0) {
      spreadsheetId = files[0].id;
    } else {
      const createRes = await gapi.client.sheets.spreadsheets.create({
        resource: { properties: { title: 'Poflix_Watched_Data' } },
        fields: 'spreadsheetId,sheets(properties(sheetId,title))',
      });
      spreadsheetId = createRes.result.spreadsheetId;
      // Add Headers to first sheet
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: 'A1:E1',
        valueInputOption: 'RAW',
        resource: { values: [['ID', 'Category', 'Title', 'Poster', 'Timestamp']] }
      });
    }
    
    localStorage.setItem('poflix_spreadsheet_id', spreadsheetId);

    // Fetch spreadsheet metadata to check for Wishlist sheet
    const ssMeta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: spreadsheetId });
    const sheets = ssMeta.result.sheets;
    
    // 1. Identify 'Watched' sheet (first one)
    const watchedSheet = sheets[0].properties;
    localStorage.setItem('poflix_watched_title', watchedSheet.title);
    localStorage.setItem('poflix_watched_id', watchedSheet.sheetId);

    // 2. Identify or Create 'Wishlist' sheet
    let wishlistSheet = sheets.find(s => s.properties.title === 'Wishlist');
    if (!wishlistSheet) {
      const addRes = await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetId,
        resource: {
          requests: [{ addSheet: { properties: { title: 'Wishlist' } } }]
        }
      });
      const newSheet = addRes.result.replies[0].addSheet.properties;
      localStorage.setItem('poflix_wishlist_title', newSheet.title);
      localStorage.setItem('poflix_wishlist_id', newSheet.sheetId);
      // Init headers
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: 'Wishlist!A1:E1',
        valueInputOption: 'RAW',
        resource: { values: [['ID', 'Category', 'Title', 'Poster', 'Timestamp']] }
      });
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
    // 1. Check for duplicates
    const getRes = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: config.id,
      range: `${config.title}!A:A`
    });
    const ids = getRes.result.values ? getRes.result.values.map(r => String(r[0])) : [];
    if (ids.includes(String(item.id))) return;

    // 2. Insert row at the top (under header row 1)
    const category = item.type === 'movie' ? 'Movie' : 'Series';
    const values = [[item.id, category, item.title, item.poster_path, new Date().toISOString()]];
    
    // Insert empty row at index 1 (Sheet's 2nd row)
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.id,
      resource: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId: config.gid,
                dimension: "ROWS",
                startIndex: 1,
                endIndex: 2
              },
              inheritFromBefore: false
            }
          }
        ]
      }
    });

    // Update the newly inserted empty row
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: config.id,
      range: `${config.title}!A2`,
      valueInputOption: 'RAW',
      resource: { values }
    });
  } catch (e) { console.error(`Sheet sync failed (${listType})`, e); }
}

async function removeFromSheets(id, listType = 'watched') {
  const config = getSheetConfig(listType);
  if (!googleUser || !config || !config.id) return;
  try {
    // 1. Find all matching row indices
    const getRes = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: config.id,
      range: `${config.title}!A:A`
    });
    const rows = getRes.result.values;
    if (!rows) return;

    const requests = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i][0]) === String(id)) {
        requests.push({
          deleteDimension: {
            range: {
              sheetId: config.gid,
              dimension: 'ROWS',
              startIndex: i,
              endIndex: i + 1
            }
          }
        });
      }
    }

    if (requests.length === 0) return;

    // 2. Batch Delete all instances
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.id,
      resource: { requests }
    });
  } catch (e) { console.error(`Sheet removal failed (${listType})`, e); }
}

async function syncFromSheets(listType = 'watched') {
  const config = getSheetConfig(listType);
  if (!googleUser || !config || !config.id) return;
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: config.id,
      range: `${config.title}!A2:E`
    });
    const rows = res.result.values;
    // Always map rows, defaulting to an empty array
    const cloudItems = rows ? rows.map(r => ({ 
      id: String(r[0]), 
      type: String(r[1] || 'movie').toLowerCase() === 'movie' ? 'movie' : 'tv', 
      title: r[2] || 'Untitled', 
      poster_path: r[3] || ''
    })) : [];
    
    // Smart Merge: Don't lose local items that haven't hit the cloud yet
    const localItems = getStorage(listType) || [];
    const mergedItems = [...cloudItems];
    
    // Add local items that aren't in the cloud yet (prevents "flicker" on slow appends)
    localItems.forEach(lItem => {
      if (!mergedItems.some(cItem => String(cItem.id) === String(lItem.id))) {
        mergedItems.push(lItem);
      }
    });

    if (JSON.stringify(mergedItems) !== JSON.stringify(localItems)) {
      setStorage(listType, mergedItems);
      triggerUIRefresh(listType);
    }
  } catch (e) {
    console.error(`Sheet sync failed (${listType}):`, e);
  }
}

function triggerUIRefresh(listType) {
  if (listType === 'watched' && document.getElementById('watched-movies-grid')) {
    renderProfilePage();
  } else if (listType === 'wishlist' && document.getElementById('wishlist-movies-grid')) {
    renderWishlistPage();
  }
}

// Call init on load
initGoogleAuth();

// --- Adult Content Filter ---
function filterAdultContent(items) {
  const adultKeywords = [
    'adult', 'nude', 'nudity', 'sex', 'sexual', 'erotic', 'erotica', 'porn', 'pornographic',
    'explicit', 'mature', 'adult content', 'adult film', 'adult movie', 'adult series',
    'seikan', 'shiken', 'intimacy', 'desire', 'stepmom', 'stepmother', 'skin like sun',
    '14 and under', 'too young', 'oppa-man', 'lingerie', 'suggestive', 'provocative',
    'seductive', 'tempting', 'forbidden', 'taboo', 'mature content', 'adult themes',
    'romance adult', 'adult romance', 'mature romance', 'erotic romance'
  ];
  const adultRatings = ['NC-17', 'X', 'XXX', '18+', 'R18', '18A'];
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
    if (cachedM && cachedT) {
      genreMapMovie = JSON.parse(cachedM);
      genreMapTV = JSON.parse(cachedT);
      return;
    }
    const [movieGenres, tvGenres] = await Promise.all([
      fetchTMDB('/genre/movie/list'),
      fetchTMDB('/genre/tv/list')
    ]);
    (movieGenres.genres || []).forEach(g => genreMapMovie[g.id] = g.name);
    (tvGenres.genres || []).forEach(g => genreMapTV[g.id] = g.name);
    localStorage.setItem('genreMapMovie', JSON.stringify(genreMapMovie));
    localStorage.setItem('genreMapTV', JSON.stringify(genreMapTV));
  } catch (e) { /* silent */ }
}

// --- localStorage Helpers ---
function getStorage(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}
function setStorage(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}
function isInStorage(key, id) {
  return getStorage(key).some(item => item.id === id);
}
function toggleStorage(key, item) {
  let arr = getStorage(key);
  const idx = arr.findIndex(i => String(i.id) === String(item.id));
  if (idx >= 0) { arr.splice(idx, 1); } else { arr.push(item); }
  setStorage(key, arr);
  return idx < 0; // returns true if added
}

function getWatchedFromStorage() {
  return getStorage('watched');
}

function isWatched(id) {
  return (getStorage('watched') || []).some(item => String(item.id) === String(id));
}

function isWishlisted(id) {
  return (getStorage('wishlist') || []).some(item => String(item.id) === String(id));
}

async function toggleWatched(item, btn) {
  let watched = getStorage('watched') || [];
  const idx = watched.findIndex(i => String(i.id) === String(item.id));
  
  const isDetailBtn = btn.classList.contains('btn-watched-detail');
  const card = btn.closest('.animated-card, .carousel-card');

  if (idx >= 0) {
    watched.splice(idx, 1);
    setStorage('watched', watched);
    btn.classList.remove('active');
    if (card) card.classList.remove('watched-glow');
    if (isDetailBtn) btn.innerHTML = '👁️ Mark as Watched';
    triggerUIRefresh('watched');
    if (googleUser) removeFromSheets(item.id, 'watched'); 
  } else {
    watched.push(item);
    setStorage('watched', watched);
    btn.classList.add('active');
    if (card) card.classList.add('watched-glow');
    if (isDetailBtn) {
      btn.innerHTML = '✔ Watched';
    }
    // Fetch Metadata for stats (runtime, genres)
    fetchWatchedMetadata(item.id, item.type);
    
    if (googleUser) {
      syncToSheets(item, 'watched');
      removeFromWishlistIfPresent(item.id);
    }
    triggerUIRefresh('watched');
  }
}

// Stats Metadata storage
async function fetchWatchedMetadata(id, type) {
  try {
    const meta = getStorage('watched_metadata') || {};
    if (meta[id]) return meta[id];
    
    const endpoint = type === 'movie' ? `/movie/${id}` : `/tv/${id}`;
    const data = await fetchTMDB(endpoint);
    
    const itemMeta = {
      runtime: type === 'movie' ? (data.runtime || 0) : (data.episode_run_time ? data.episode_run_time[0] || 0 : 0),
      genres: (data.genres || []).map(g => g.name)
    };
    
    meta[id] = itemMeta;
    setStorage('watched_metadata', meta);
    return itemMeta;
  } catch (e) { return null; }
}

// Background Maintenance: Fetch metadata for existing items
async function fetchMissingMetadata() {
  const watched = getStorage('watched') || [];
  const meta = getStorage('watched_metadata') || {};
  for (const item of watched) {
    if (!meta[item.id]) {
      await fetchWatchedMetadata(item.id, item.type);
      // Wait a bit between calls to be safe with rate limits
      await new Promise(r => setTimeout(r, 200));
    }
  }
  if (watched.length > 0) renderStatsDashboard();
}
fetchMissingMetadata();

async function toggleWishlist(item, btn) {
  let wishlist = getStorage('wishlist') || [];
  const idx = wishlist.findIndex(i => String(i.id) === String(item.id));
  
  const isDetailBtn = btn.classList.contains('btn-wishlist-detail');
  const card = btn.closest('.animated-card, .carousel-card');

  if (idx >= 0) {
    wishlist.splice(idx, 1);
    setStorage('wishlist', wishlist);
    btn.classList.remove('active');
    if (isDetailBtn) {
      btn.innerHTML = '<i class="fas fa-bookmark" style="margin-right:8px;"></i> Watch Later';
    }
    triggerUIRefresh('wishlist');
    if (googleUser) removeFromSheets(item.id, 'wishlist'); 
  } else {
    wishlist.push(item);
    btn.classList.add('active');
    if (isDetailBtn) {
      btn.innerHTML = '📌 In Wishlist';
    } else if (btn.querySelector('.icon-bookmark')) {
       btn.querySelector('.icon-bookmark').textContent = '📌';
    }
    if (googleUser) syncToSheets(item, 'wishlist');
  }
  setStorage('wishlist', wishlist);
}

function removeFromWishlistIfPresent(id) {
  let wishlist = getStorage('wishlist') || [];
  const sId = String(id);
  const idx = wishlist.findIndex(i => String(i.id) === sId);
  if (idx >= 0) {
    wishlist.splice(idx, 1);
    setStorage('wishlist', wishlist);
    if (googleUser) removeFromSheets(sId, 'wishlist');
    
    // Smoothly update UI elements without a refresh
    document.querySelectorAll(`[data-wishlist-id="${sId}"]`).forEach(btn => {
      btn.classList.remove('active');
      if (btn.classList.contains('btn-wishlist-detail')) {
        btn.innerHTML = '🔖 Add to Wishlist';
      } else if (btn.querySelector('.icon-bookmark')) {
        btn.querySelector('.icon-bookmark').textContent = '🔖';
      }
    });

    // If we're on the wishlist page, and there are no movies/series left, re-render
    if (document.getElementById('wishlist-movies-grid')) {
      renderWishlistPage();
    }
  }
}

// --- Skeleton Loaders ---
function createSkeletonCards(count = 8, className = 'skeleton skeleton-card') {
  return Array(count).fill(`<div class="${className}"></div>`).join('');
}
function createSkeletonGrid(count = 12) {
  return Array(count).fill('<div class="skeleton skeleton-card-grid"></div>').join('');
}

// --- Debounce Utility ---
function debounce(fn, delay = 350) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// --- Live Search Autocomplete ---
function initSearchAutocomplete(inputEl, options = {}) {
  const type = options.type || 'multi'; // 'multi', 'movie', 'tv'
  let dropdown = inputEl.parentElement.querySelector('.search-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.className = 'search-dropdown';
    inputEl.parentElement.appendChild(dropdown);
  }

  const fetchResults = debounce(async (query) => {
    if (!query || query.length < 2) { dropdown.classList.remove('open'); return; }
    dropdown.innerHTML = '<div class="search-dropdown-spinner"><div class="spinner"></div></div>';
    dropdown.classList.add('open');
    try {
      let results = [];
      let actors = [];
      if (type === 'multi') {
        const [movieData, tvData, personData] = await Promise.all([
          fetchTMDB('/search/movie', { query, page: 1 }),
          fetchTMDB('/search/tv', { query, page: 1 }),
          fetchTMDB('/search/person', { query, page: 1 })
        ]);
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
      if (results.length === 0 && actors.length === 0) {
        dropdown.innerHTML = '<div class="search-dropdown-empty">No results found</div>';
        return;
      }
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
            <div class="sdi-meta">
              <span class="sdi-type">${typeLabel}</span>
              ${year ? `<span>${year}</span>` : ''}
              ${rating ? `<span>\u2b50 ${rating}</span>` : ''}
            </div>
          </div>
        </a>`;
      }).join('');

      let actorsHtml = '';
      if (actors.length > 0) {
        actorsHtml = actors.map(actor => {
          const photo = actor.profile_path ? `https://image.tmdb.org/t/p/w92${actor.profile_path}` : '';
          const knownFor = (actor.known_for || []).slice(0, 2).map(k => k.title || k.name).filter(Boolean).join(', ');
          return `<a href="search.html?q=${encodeURIComponent(actor.name)}" class="search-dropdown-item">
            ${photo ? `<img src="${photo}" alt="${actor.name}" style="border-radius:50%;width:44px;height:44px;object-fit:cover;">` : '<div style="width:44px;height:44px;border-radius:50%;background:var(--surface);"></div>'}
            <div class="sdi-info">
              <div class="sdi-title">${actor.name}</div>
              <div class="sdi-meta">
                <span class="sdi-type" style="background:rgba(139,92,246,0.15);color:#a78bfa;">Actor</span>
                ${knownFor ? `<span>${knownFor}</span>` : ''}
              </div>
            </div>
          </a>`;
        }).join('');
      }
      // Actors first, then movies/series
      dropdown.innerHTML = actorsHtml + moviesHtml;
    } catch {
      dropdown.innerHTML = '<div class="search-dropdown-empty">Search failed</div>';
    }
  }, 350);

  inputEl.addEventListener('input', () => fetchResults(inputEl.value.trim()));
  inputEl.addEventListener('focus', () => { if (inputEl.value.trim().length >= 2) fetchResults(inputEl.value.trim()); });
  document.addEventListener('click', (e) => {
    if (!inputEl.parentElement.contains(e.target)) dropdown.classList.remove('open');
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dropdown.classList.remove('open');
  });
}

// --- Pagination Helper ---
function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  totalPages = Math.min(totalPages, 500); // TMDb max
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  html += `<button class="page-arrow" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹ Prev</button>`;

  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

  if (startPage > 1) {
    html += `<button data-page="1">1</button>`;
    if (startPage > 2) html += `<span class="page-info">…</span>`;
  }
  for (let p = startPage; p <= endPage; p++) {
    html += `<button data-page="${p}" class="${p === currentPage ? 'active' : ''}">${p}</button>`;
  }
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span class="page-info">…</span>`;
    html += `<button data-page="${totalPages}">${totalPages}</button>`;
  }

  html += `<button class="page-arrow" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next ›</button>`;

  container.innerHTML = html;
  container.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page);
      if (!isNaN(page)) onPageChange(page);
    });
  });
}

// --- Card Creation (Enhanced) ---
function createMovieCard(movie) {
  const year = (movie.release_date || '').slice(0, 4);
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '';
  const genres = (movie.genre_ids || []).slice(0, 2).map(id => genreMapMovie[id] || '').filter(Boolean);
  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
    : '';
  if (!posterUrl) return '';
  const isW = isWatched(movie.id);
  const isWL = isWishlisted(movie.id);
  const watchedBtnClass = isW ? ' active' : '';
  const wishlistBtnClass = isWL ? ' active' : '';
  const watchedCardClass = isW ? ' watched-glow' : '';
  const itemTitle = movie.title || movie.name || 'Untitled';
  return `<a href="movie_detail.html?id=${movie.id}" class="animated-card${watchedCardClass}" data-id="${movie.id}">
    <button class="btn-watched${watchedBtnClass}" onclick="event.preventDefault(); toggleWatched({id:'${movie.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${movie.poster_path}', type:'movie'}, this)">
      <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    </button>
    <button class="btn-wishlist${wishlistBtnClass}" data-wishlist-id="${movie.id}" onclick="event.preventDefault(); toggleWishlist({id:'${movie.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${movie.poster_path}', type:'movie'}, this)">
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
  const posterUrl = series.poster_path
    ? `https://image.tmdb.org/t/p/w342${series.poster_path}`
    : '';
  if (!posterUrl) return '';
  const isW = isWatched(series.id);
  const isWL = isWishlisted(series.id);
  const watchedBtnClass = isW ? ' active' : '';
  const wishlistBtnClass = isWL ? ' active' : '';
  const watchedCardClass = isW ? ' watched-glow' : '';
  const itemTitle = series.name || series.title || 'Untitled';
  return `<a href="series_detail.html?id=${series.id}" class="animated-card${watchedCardClass}" data-id="${series.id}">
    <button class="btn-watched${watchedBtnClass}" onclick="event.preventDefault(); toggleWatched({id:'${series.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${series.poster_path}', type:'tv'}, this)">
      <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    </button>
    <button class="btn-wishlist${wishlistBtnClass}" data-wishlist-id="${series.id}" onclick="event.preventDefault(); toggleWishlist({id:'${series.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${series.poster_path}', type:'tv'}, this)">
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
  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
    : '';
  if (!posterUrl) return '';
  const isW = isWatched(movie.id);
  const isWL = isWishlisted(movie.id);
  const watchedBtnClass = isW ? ' active' : '';
  const wishlistBtnClass = isWL ? ' active' : '';
  const watchedCardClass = isW ? ' watched-glow' : '';
  const itemTitle = movie.title || movie.name || 'Untitled';
  return `<a href="movie_detail.html?id=${movie.id}" class="carousel-card${watchedCardClass}" data-id="${movie.id}">
    <button class="btn-watched${watchedBtnClass}" onclick="event.preventDefault(); toggleWatched({id:'${movie.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${movie.poster_path}', type:'movie'}, this)">
      <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    </button>
    <button class="btn-wishlist${wishlistBtnClass}" data-wishlist-id="${movie.id}" onclick="event.preventDefault(); toggleWishlist({id:'${movie.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${movie.poster_path}', type:'movie'}, this)">
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
  const posterUrl = series.poster_path
    ? `https://image.tmdb.org/t/p/w342${series.poster_path}`
    : '';
  if (!posterUrl) return '';
  const isW = isWatched(series.id);
  const isWL = isWishlisted(series.id);
  const watchedBtnClass = isW ? ' active' : '';
  const wishlistBtnClass = isWL ? ' active' : '';
  const watchedCardClass = isW ? ' watched-glow' : '';
  const itemTitle = series.name || series.title || 'Untitled';
  return `<a href="series_detail.html?id=${series.id}" class="carousel-card${watchedCardClass}" data-id="${series.id}">
    <button class="btn-watched${watchedBtnClass}" onclick="event.preventDefault(); toggleWatched({id:'${series.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${series.poster_path}', type:'tv'}, this)">
      <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    </button>
    <button class="btn-wishlist${wishlistBtnClass}" data-wishlist-id="${series.id}" onclick="event.preventDefault(); toggleWishlist({id:'${series.id}', title:'${itemTitle.replace(/'/g,"\\'")}', poster_path:'${series.poster_path}', type:'tv'}, this)">
      <span class="icon-bookmark">${isWL ? '📌' : '🔖'}</span>
    </button>
    ${year ? `<span class="card-year">${year}</span>` : ''}
    ${rating ? `<span class="card-rating">⭐ ${rating}</span>` : ''}
    <img src="${posterUrl}" alt="${itemTitle}" loading="lazy">
    <div class="movie-title">${itemTitle}</div>
  </a>`;
}

// --- Hero Spotlight ---
async function renderHeroSpotlight() {
  const spotlightEl = document.getElementById('hero-spotlight');
  if (!spotlightEl) return;
  try {
    const trending = await fetchTMDB('/trending/movie/week');
    const filtered = filterAdultContent(trending.results || []).filter(m => m.backdrop_path);
    if (filtered.length === 0) return;
    const movie = filtered[Math.floor(Math.random() * Math.min(5, filtered.length))];
    spotlightEl.innerHTML = `
      <div class="spotlight-bg" style="background-image: url('https://image.tmdb.org/t/p/original${movie.backdrop_path}')"></div>
      <div class="spotlight-content">
        <div class="spotlight-title">${movie.title}</div>
        <div class="spotlight-overview">${movie.overview || ''}</div>
        <div class="spotlight-actions">
          <a href="movie_detail.html?id=${movie.id}" class="spotlight-btn primary">▶ Watch Now</a>
          <a href="movie_detail.html?id=${movie.id}" class="spotlight-btn secondary">ℹ More Info</a>
        </div>
      </div>
    `;
    // Hide the static hero text when spotlight is active
    const heroTitle = document.querySelector('.hero-title');
    const heroSub = document.querySelector('.hero-subtitle');
    if (heroTitle) heroTitle.style.display = 'none';
    if (heroSub) heroSub.style.display = 'none';
  } catch (e) { /* silent, keep static hero */ }
}

// --- Home Page Carousels ---
async function renderHomeCarousels() {
  const rows = {
    'top10-movies-row': null,
    'top10-series-row': null,
    'trending-row': null,
    'popular-row': null,
    'recommended-row': null
  };
  // Show skeletons
  for (const id of Object.keys(rows)) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = createSkeletonCards(8);
  }
  try {
    await loadGenreMaps();
    // Render spotlight
    renderHeroSpotlight();

    // Fetch all data in parallel
    const [topMovies, topSeries, trending, popular, recommended] = await Promise.all([
      fetchTMDB('/movie/top_rated', { page: 1 }),
      fetchTMDB('/tv/top_rated', { page: 1 }),
      fetchTMDB('/trending/movie/week'),
      fetchTMDB('/movie/popular'),
      fetchTMDB('/discover/movie', { sort_by: 'vote_average.desc', 'vote_count.gte': 1000 })
    ]);

    const setRow = (id, items, cardFn) => {
      const el = document.getElementById(id);
      if (el) {
        const html = items.map(cardFn).join('');
        el.innerHTML = html || '<div style="color:var(--text-muted);padding:1rem;">Nothing found.</div>';
        observeCards(el);
      }
    };

    setRow('top10-movies-row', filterAdultContent(topMovies.results).slice(0, 10), createCarouselMovieCard);
    setRow('top10-series-row', filterAdultContent(topSeries.results).slice(0, 10), createCarouselSeriesCard);
    setRow('trending-row', filterAdultContent(trending.results).slice(0, 12), createCarouselMovieCard);
    setRow('popular-row', filterAdultContent(popular.results).slice(0, 12), createCarouselMovieCard);
    setRow('recommended-row', filterAdultContent(recommended.results).slice(0, 12), createCarouselMovieCard);
  } catch (e) {
    for (const id of Object.keys(rows)) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div style="color:var(--accent);padding:1rem;">Failed to load.</div>';
    }
  }
}

// --- Carousel Scroll ---
function scrollRow(rowId, dir) {
  const row = document.getElementById(rowId);
  if (row) {
    const card = row.querySelector('.carousel-card');
    const scrollAmount = card ? card.offsetWidth + 16 : 200;
    row.scrollBy({ left: dir * scrollAmount * 2, behavior: 'smooth' });
  }
}

// --- Tab Switching ---
function switchTab(tabGroup, tabIndex) {
  const tabs = document.querySelectorAll(`.${tabGroup} .nav-link`);
  const panes = document.querySelectorAll(`.${tabGroup} .tab-pane`);
  tabs.forEach((tab, i) => {
    tab.classList.toggle('active', i === tabIndex);
    if (panes[i]) {
      panes[i].classList.toggle('show', i === tabIndex);
      panes[i].classList.toggle('active', i === tabIndex);
    }
  });
}

// --- Init Home Page ---
if (document.getElementById('trending-row') && typeof TMDB_API_KEY !== 'undefined') {
  renderHomeCarousels();
}

// ============================================
// Movies List Page (with Pagination)
// ============================================
async function fetchGenres() {
  const data = await fetchTMDB('/genre/movie/list');
  return data.genres;
}

let moviesCurrentPage = 1;
let moviesLastParams = {};
let moviesTotalPages = 1;
const ITEMS_PER_PAGE = 40; // 40 items per page (2 TMDb pages of 20)

async function renderMoviesList(params = {}, page = 1) {
  const grid = document.getElementById('movies-grid');
  if (!grid) return;
  grid.innerHTML = createSkeletonGrid(20);
  moviesLastParams = params;
  moviesCurrentPage = page;

  try {
    // TMDb gives 20/page. We fire BOTH requests immediately but process them one by one
    // so the first 20 show up 2x faster.
    const tmdbPage1 = (page * 2) - 1;
    const tmdbPage2 = page * 2;
    let totalPages = 1;
    const seen = new Set();
    const isRomance = params.genre === '10749';
    const romanceKeywords = ['erotic', 'sexy', 'seductive', 'tempting', 'forbidden', 'taboo', 'mature', 'adult', 'nude', 'nudity', 'sexual', 'intimate', 'passionate', 'steamy', 'stepmom', 'stepmother', 'provocative', 'suggestive'];

    let p1, p2;
    if (params.query) {
      p1 = fetchTMDB('/search/movie', { query: params.query, page: tmdbPage1 });
      p2 = fetchTMDB('/search/movie', { query: params.query, page: tmdbPage2 });
    } else {
      const discoverParams = { 
        sort_by: params.sort || 'popularity.desc' 
      };
      if (params.year) discoverParams.primary_release_year = params.year;
      if (params.genre) discoverParams.with_genres = params.genre;
      p1 = fetchTMDB('/discover/movie', { ...discoverParams, page: tmdbPage1 });
      p2 = fetchTMDB('/discover/movie', { ...discoverParams, page: tmdbPage2 });
    }

    // Helper to filter and dedup
    const processResults = (data) => {
      let filtered = filterAdultContent(data.results || []);
      if (isRomance) {
        filtered = filtered.filter(m => {
          const t = (m.title || '').toLowerCase();
          const o = (m.overview || '').toLowerCase();
          return !romanceKeywords.some(k => t.includes(k) || o.includes(k));
        });
      }
      return filtered.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
    };

    // Parallel fetch for Page 1 and Page 2
    const [d1, d2] = await Promise.all([p1, p2]);
    
    totalPages = Math.ceil((d1.total_results || 0) / ITEMS_PER_PAGE);
    const results1 = processResults(d1);
    const results2 = processResults(d2);

    if (results1.length > 0 || results2.length > 0) {
      grid.innerHTML = [...results1, ...results2].map(createMovieCard).join('');
      observeCards(grid);
    } else {
      grid.innerHTML = '<div style="color:var(--accent);padding:2rem;">No movies found.</div>';
    }

    moviesTotalPages = totalPages;
    renderPagination('movies-pagination', page, totalPages, (p) => {
      renderMoviesList(moviesLastParams, p);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } catch (e) {
    grid.innerHTML = '<div style="color:var(--accent);padding:2rem;">Failed to load movies.</div>';
  }
}

async function populateGenreDropdown() {
  const select = document.getElementById('genre-select');
  if (!select) return;
  select.innerHTML = '<option value="">All Genres</option>';
  try {
    const genres = await fetchGenres();
    genres.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      select.appendChild(opt);
    });
  } catch { /* silent */ }
}

if (document.getElementById('movies-grid')) {
  loadGenreMaps().then(() => {
    populateGenreDropdown();
    renderMoviesList();
    // Autocomplete on movie filter search input
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

// ============================================
// Series List Page (with Pagination)
// ============================================
async function fetchSeriesGenres() {
  const data = await fetchTMDB('/genre/tv/list');
  return data.genres;
}

let seriesCurrentPage = 1;
let seriesLastParams = {};
let seriesTotalPages = 1;

async function renderSeriesList(params = {}, page = 1) {
  const grid = document.getElementById('series-grid');
  if (!grid) return;
  grid.innerHTML = createSkeletonGrid(20);
  seriesLastParams = params;
  seriesCurrentPage = page;

  try {
    const tmdbPage1 = (page * 2) - 1;
    const tmdbPage2 = page * 2;
    let totalPages = 1;
    const seen = new Set();
    let p1, p2;

    if (params.query) {
      p1 = fetchTMDB('/search/tv', { query: params.query, page: tmdbPage1 });
      p2 = fetchTMDB('/search/tv', { query: params.query, page: tmdbPage2 });
    } else {
      const discoverParams = { 
        sort_by: params.sort || 'popularity.desc' 
      };
      if (params.year) discoverParams.first_air_date_year = params.year;
      if (params.genre) discoverParams.with_genres = params.genre;
      p1 = fetchTMDB('/discover/tv', { ...discoverParams, page: tmdbPage1 });
      p2 = fetchTMDB('/discover/tv', { ...discoverParams, page: tmdbPage2 });
    }

    const processResults = (data) => {
      let filtered = filterAdultContent(data.results || []);
      return filtered.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
    };

    // Parallel fetch for Page 1 and Page 2
    const [d1, d2] = await Promise.all([p1, p2]);
    
    totalPages = Math.ceil((d1.total_results || 0) / ITEMS_PER_PAGE);
    const results1 = processResults(d1);
    const results2 = processResults(d2);

    if (results1.length > 0 || results2.length > 0) {
      grid.innerHTML = [...results1, ...results2].map(createSeriesCard).join('');
      observeCards(grid);
    } else {
      grid.innerHTML = '<div style="color:var(--accent);padding:2rem;">No series found.</div>';
    }

    seriesTotalPages = totalPages;
    renderPagination('series-pagination', page, totalPages, (p) => {
      renderSeriesList(seriesLastParams, p);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } catch (e) {
    grid.innerHTML = '<div style="color:var(--accent);padding:2rem;">Failed to load series.</div>';
  }
}

async function populateSeriesGenreDropdown() {
  const select = document.getElementById('series-genre-select');
  if (!select) return;
  select.innerHTML = '<option value="">All Genres</option>';
  try {
    const genres = await fetchSeriesGenres();
    genres.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      select.appendChild(opt);
    });
  } catch { /* silent */ }
}

if (document.getElementById('series-grid')) {
  loadGenreMaps().then(() => {
    populateSeriesGenreDropdown();
    renderSeriesList();
    // Autocomplete on series filter search input
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

// ============================================
// Movie Detail Page
// ============================================
async function renderMovieDetail() {
  const posterCard = document.getElementById('movie-poster-card');
  const infoCard = document.getElementById('movie-info-card');
  const heroBg = document.getElementById('movie-hero-bg');
  const playerSection = document.getElementById('movie-player-section');
  const castSection = document.getElementById('movie-cast-section');
  const recsSection = document.getElementById('movie-recommendations');
  if (!posterCard || !infoCard || !heroBg || !playerSection || !castSection) return;
  const urlParams = new URLSearchParams(window.location.search);
  const movieId = urlParams.get('id');
  if (!movieId) {
    posterCard.innerHTML = infoCard.innerHTML = playerSection.innerHTML = castSection.innerHTML = '<div style="color:var(--accent)">Movie not found.</div>';
    return;
  }
  posterCard.innerHTML = infoCard.innerHTML = playerSection.innerHTML = castSection.innerHTML = '<div class="spinner"></div>';
  try {
    const [movie, credits, videos] = await Promise.all([
      fetchTMDB(`/movie/${movieId}`),
      fetchTMDB(`/movie/${movieId}/credits`),
      fetchTMDB(`/movie/${movieId}/videos`)
    ]);
    const cast = credits.cast ? credits.cast.slice(0, 12) : [];
    const trailer = (videos.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer');

    // Hero BG
    heroBg.style.backgroundImage = movie.backdrop_path ? `url(https://image.tmdb.org/t/p/original${movie.backdrop_path})` : 'none';
    heroBg.style.backgroundSize = 'cover';
    heroBg.style.backgroundPosition = 'center';

    // Update page title
    document.title = `${movie.title} — Poflix`;

    // Poster
    posterCard.innerHTML = `<img src="https://image.tmdb.org/t/p/w500${movie.poster_path}" alt="${movie.title}" loading="lazy">`;

    // Info
    const isW = isWatched(movie.id);
    const isWL = isWishlisted(movie.id);
    infoCard.innerHTML = `
      <h1 class="movie-title-detail">${movie.title}</h1>
      <div class="movie-meta-detail">
        <span>📅 ${movie.release_date}</span>
        <span>⏱️ ${movie.runtime} min</span>
        <span>⭐ ${movie.vote_average.toFixed(1)}</span>
      </div>
      <div class="movie-genres-detail">${movie.genres.map(g => `<span>${g.name}</span>`).join('')}</div>
      <p class="movie-overview-detail">${movie.overview}</p>
      <div class="movie-actions">
        <button class="btn-watched-detail${isW ? ' active' : ''}" onclick="toggleWatched({id:'${movie.id}', title:'${(movie.title||'').replace(/'/g,"\\'")}', poster_path:'${movie.poster_path}', type:'movie'}, this)">
          ${isW ? '✔ Watched' : '👁️ Mark as Watched'}
        </button>
        <button class="btn-wishlist-detail${isWL ? ' active' : ''}" data-wishlist-id="${movie.id}" onclick="toggleWishlist({id:'${movie.id}', title:'${(movie.title||'').replace(/'/g,"\\'")}', poster_path:'${movie.poster_path}', type:'movie'}, this)">
          ${isWL ? '📌 In Wishlist' : '🔖 Add to Wishlist'}
        </button>
      </div>
    `;

    // Streaming sources
    const streamUrls = [
      `https://vidlink.pro/movie/${movieId}`,
      `https://vidsrc.net/embed/movie/${movieId}`,
      `https://embed.su/embed/movie/${movieId}`,
      `https://multiembed.mov/?video_id=${movieId}`,
      `https://www.NontonGo.win/embed/movie/${movieId}`,
      `https://player.videasy.net/movie/${movieId}`
    ];
    playerSection.innerHTML = `
      <h4>▶ Watch Now</h4>
      <ul class="nav nav-tabs" id="streamTab" role="tablist">
        ${streamUrls.map((url, i) => `<li role="presentation"><button class="nav-link${i===0?' active':''}" data-source="${i}">Source ${i+1}</button></li>`).join('')}
      </ul>
      <div class="tab-content" id="movie-player-frame">
        <iframe src="${streamUrls[0]}" width="100%" height="480" allowfullscreen></iframe>
      </div>
      ${trailer ? `<div class="ratio ratio-16x9"><iframe src="https://www.youtube.com/embed/${trailer.key}" allowfullscreen></iframe></div>` : ''}
    `;
    document.querySelectorAll('#streamTab .nav-link').forEach((btn, i) => {
      btn.onclick = function() {
        document.querySelectorAll('#streamTab .nav-link').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('movie-player-frame').innerHTML = `<iframe src="${streamUrls[i]}" width="100%" height="480" allowfullscreen></iframe>`;
      };
    });

    // Cast
    castSection.innerHTML = `
      <h4>🎭 Cast</h4>
      <div class="movie-cast-list">
        ${cast.map(actor => `
          <a href="search.html?q=${encodeURIComponent(actor.name)}" class="movie-cast-card">
            ${actor.profile_path ? `<img src="https://image.tmdb.org/t/p/w185${actor.profile_path}" alt="${actor.name}">` : '<div style="width:64px;height:64px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;">🎭</div>'}
            <div class="cast-name">${actor.name}</div>
            <div class="cast-character">${actor.character || ''}</div>
          </a>
        `).join('')}
      </div>
    `;

    // Recommendations
    if (recsSection) {
      try {
        const recs = await fetchTMDB(`/movie/${movieId}/recommendations`);
        const filteredRecs = filterAdultContent(recs.results || []).slice(0, 10);
        if (filteredRecs.length > 0) {
          recsSection.innerHTML = `
            <h4>💡 You Might Also Like</h4>
            <div class="recommendations-grid">
              ${filteredRecs.map(createCarouselMovieCard).join('')}
            </div>
          `;
          observeCards(recsSection);
        } else {
          recsSection.innerHTML = '';
        }
      } catch { recsSection.innerHTML = ''; }
    }
  } catch (e) {
    posterCard.innerHTML = infoCard.innerHTML = playerSection.innerHTML = castSection.innerHTML = '<div style="color:var(--accent)">Failed to load movie details.</div>';
  }
}

// ============================================
// Series Detail Page
// ============================================
async function renderSeriesDetail() {
  const posterCard = document.getElementById('series-poster-card');
  const infoCard = document.getElementById('series-info-card');
  const heroBg = document.getElementById('series-hero-bg');
  const playerSection = document.getElementById('series-player-section');
  const castSection = document.getElementById('series-cast-section');
  const recsSection = document.getElementById('series-recommendations');
  if (!posterCard || !infoCard || !heroBg || !playerSection || !castSection) return;
  const urlParams = new URLSearchParams(window.location.search);
  const seriesId = urlParams.get('id');
  if (!seriesId) {
    posterCard.innerHTML = infoCard.innerHTML = playerSection.innerHTML = castSection.innerHTML = '<div style="color:var(--accent)">Series not found.</div>';
    return;
  }
  posterCard.innerHTML = infoCard.innerHTML = playerSection.innerHTML = castSection.innerHTML = '<div class="spinner"></div>';
  try {
    const [series, credits, videos] = await Promise.all([
      fetchTMDB(`/tv/${seriesId}`),
      fetchTMDB(`/tv/${seriesId}/credits`),
      fetchTMDB(`/tv/${seriesId}/videos`)
    ]);
    const cast = credits.cast ? credits.cast.slice(0, 12) : [];
    const trailer = (videos.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer');
    const seasons = series.seasons || [];
    let currentSeasonIdx = 0;
    let currentEpisode = 1;
    let currentSource = 0;

    // Hero BG
    heroBg.style.backgroundImage = series.backdrop_path ? `url(https://image.tmdb.org/t/p/original${series.backdrop_path})` : 'none';
    heroBg.style.backgroundSize = 'cover';
    heroBg.style.backgroundPosition = 'center';

    // Update page title
    document.title = `${series.name} — Poflix`;

    // Poster
    posterCard.innerHTML = `<img src="https://image.tmdb.org/t/p/w500${series.poster_path}" alt="${series.name}" loading="lazy">`;

    // Info
    const isW = isWatched(series.id);
    const isWL = isWishlisted(series.id);
    infoCard.innerHTML = `
      <h1 class="movie-title-detail">${series.name}</h1>
      <div class="movie-meta-detail">
        <span>📅 ${series.first_air_date}</span>
        <span>📺 ${series.number_of_seasons} Seasons</span>
        <span>⭐ ${series.vote_average.toFixed(1)}</span>
      </div>
      <div class="movie-genres-detail">${series.genres.map(g => `<span>${g.name}</span>`).join('')}</div>
      <p class="movie-overview-detail">${series.overview}</p>
      <div class="movie-actions">
        <button class="btn-watched-detail${isW ? ' active' : ''}" onclick="toggleWatched({id:'${series.id}', title:'${(series.name||'').replace(/'/g,"\\'")}', poster_path:'${series.poster_path}', type:'tv'}, this)">
          ${isW ? '✔ Watched' : '👁️ Mark as Watched'}
        </button>
        <button class="btn-wishlist-detail${isWL ? ' active' : ''}" data-wishlist-id="${series.id}" onclick="toggleWishlist({id:'${series.id}', title:'${(series.name||'').replace(/'/g,"\\'")}', poster_path:'${series.poster_path}', type:'tv'}, this)">
          ${isWL ? '📌 In Wishlist' : '🔖 Add to Wishlist'}
        </button>
      </div>
    `;

    async function renderPlayerSection(fade = false) {
      const season = seasons[currentSeasonIdx];
      if (!season) return;
      let episodes = [];
      if (fade) playerSection.innerHTML = '<div class="spinner"></div>';
      try {
        const seasonData = await fetchTMDB(`/tv/${seriesId}/season/${season.season_number}`);
        episodes = seasonData.episodes || [];
      } catch {}

      const seasonTabs = seasons.map((s, i) =>
        `<button class="series-season-tab${i === currentSeasonIdx ? ' active' : ''}" data-season-idx="${i}">Season ${s.season_number}</button>`
      ).join('');

      const episodesList = episodes.map(ep =>
        `<div class="series-episode-card${ep.episode_number === currentEpisode ? ' active' : ''}" data-ep="${ep.episode_number}">
          ${ep.still_path ? `<img src="https://image.tmdb.org/t/p/w300${ep.still_path}" alt="${ep.name}" loading="lazy">` : '<div style="width:100%;height:90px;background:var(--surface);border-radius:var(--radius-sm) var(--radius-sm) 0 0;"></div>'}
          <div class="ep-title">Ep ${ep.episode_number}: ${ep.name}</div>
          <div class="ep-meta">${ep.air_date || ''}</div>
          <div class="ep-overview">${ep.overview || 'No description.'}</div>
        </div>`
      ).join('');

      const seriesStreamUrls = [
        `https://vidsrc.xyz/embed/tv/${seriesId}/${season.season_number}/${currentEpisode}`,
        `https://embed.su/embed/tv/${seriesId}/${season.season_number}/${currentEpisode}`,
        `https://www.nontongo.win/embed/tv/${seriesId}/${season.season_number}/${currentEpisode}`,
        `https://player.videasy.net/tv/${seriesId}/${season.season_number}/${currentEpisode}`
      ];

      const streamTabs = seriesStreamUrls.map((url, i) =>
        `<li role="presentation"><button class="nav-link${currentSource === i ? ' active' : ''}" data-source="${i}">Source ${i+1}</button></li>`
      ).join('');

      playerSection.innerHTML = `
        <h4>▶ Watch Now</h4>
        <div class="series-season-tabs">${seasonTabs}</div>
        <div class="series-episodes-window">
          <div class="series-episodes-list">${episodesList}</div>
        </div>
        <ul class="nav nav-tabs">${streamTabs}</ul>
        <div class="tab-content">
          <iframe src="${seriesStreamUrls[currentSource]}" width="100%" height="480" allowfullscreen></iframe>
        </div>
        ${trailer ? `<div class="ratio ratio-16x9"><iframe src="https://www.youtube.com/embed/${trailer.key}" allowfullscreen></iframe></div>` : ''}
      `;

      // Season tab events
      playerSection.querySelectorAll('.series-season-tab').forEach((btn, i) => {
        btn.onclick = async function() {
          currentSeasonIdx = i;
          currentEpisode = 1;
          await renderPlayerSection(true);
        };
      });
      // Episode card events
      playerSection.querySelectorAll('.series-episode-card').forEach(btn => {
        btn.onclick = async function() {
          const ep = parseInt(btn.getAttribute('data-ep'));
          if (!isNaN(ep)) {
            currentEpisode = ep;
            await renderPlayerSection(true);
          }
        };
      });
      // Source tab events
      playerSection.querySelectorAll('.nav-link[data-source]').forEach(btn => {
        btn.onclick = async function() {
          currentSource = parseInt(btn.getAttribute('data-source'));
          await renderPlayerSection(true);
        };
      });
    }

    await renderPlayerSection();

    // Cast
    castSection.innerHTML = `
      <h4>🎭 Cast</h4>
      <div class="series-cast-list">
        ${cast.map(actor => `
          <a href="search.html?q=${encodeURIComponent(actor.name)}" class="series-cast-card">
            ${actor.profile_path ? `<img src="https://image.tmdb.org/t/p/w185${actor.profile_path}" alt="${actor.name}">` : '<div style="width:64px;height:64px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;">🎭</div>'}
            <div class="cast-name">${actor.name}</div>
            <div class="cast-character">${actor.character || ''}</div>
          </a>
        `).join('')}
      </div>
    `;

    // Recommendations
    if (recsSection) {
      try {
        const recs = await fetchTMDB(`/tv/${seriesId}/recommendations`);
        const filteredRecs = filterAdultContent(recs.results || []).slice(0, 10);
        if (filteredRecs.length > 0) {
          recsSection.innerHTML = `
            <h4>💡 You Might Also Like</h4>
            <div class="recommendations-grid">
              ${filteredRecs.map(createCarouselSeriesCard).join('')}
            </div>
          `;
          observeCards(recsSection);
        } else {
          recsSection.innerHTML = '';
        }
      } catch { recsSection.innerHTML = ''; }
    }
  } catch (e) {
    posterCard.innerHTML = infoCard.innerHTML = playerSection.innerHTML = castSection.innerHTML = '<div style="color:var(--accent)">Failed to load series details.</div>';
  }
}

// ============================================
// Search Page
// ============================================
async function renderSearchResults() {
  const moviesGrid = document.getElementById('search-movies');
  const seriesGrid = document.getElementById('search-series');
  const actorDiv = document.getElementById('search-actor');
  const title = document.getElementById('search-title');
  if (!moviesGrid || !seriesGrid || !actorDiv) return;
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q');
  if (!query) {
    title.textContent = 'No search query provided.';
    moviesGrid.innerHTML = seriesGrid.innerHTML = actorDiv.innerHTML = '';
    return;
  }
  title.textContent = `Search Results for "${query}"`;
  // Fill search input with query
  const searchInputs = document.querySelectorAll('.search-form input[name="q"]');
  searchInputs.forEach(input => input.value = query);

  moviesGrid.innerHTML = createSkeletonGrid(8);
  seriesGrid.innerHTML = createSkeletonGrid(8);
  actorDiv.innerHTML = '<div class="spinner"></div>';
  try {
    await loadGenreMaps();
    // Movies
    const movieData = await fetchTMDB('/search/movie', { query, page: 1 });
    if (movieData.results && movieData.results.length > 0) {
      const filtered = filterAdultContent(movieData.results);
      moviesGrid.innerHTML = filtered.slice(0, 12).map(createMovieCard).join('');
      observeCards(moviesGrid);
    } else {
      moviesGrid.innerHTML = '<div style="color:var(--accent);padding:1rem;">No movies found.</div>';
    }
    // Series
    const seriesData = await fetchTMDB('/search/tv', { query, page: 1 });
    if (seriesData.results && seriesData.results.length > 0) {
      const filtered = filterAdultContent(seriesData.results);
      seriesGrid.innerHTML = filtered.slice(0, 12).map(createSeriesCard).join('');
      observeCards(seriesGrid);
    } else {
      seriesGrid.innerHTML = '<div style="color:var(--accent);padding:1rem;">No series found.</div>';
    }
    // Actor
    const personData = await fetchTMDB('/search/person', { query });
    if (personData.results && personData.results.length > 0) {
      const actor = personData.results[0];

      // Fetch full actor details (bio, birthday, etc.) + credits in parallel
      let actorDetails = {};
      let actorMovies = [], actorSeries = [];
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
      const age = birthday ? Math.floor((Date.now() - new Date(birthday).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : '';

      // Truncate bio for display
      const bioShort = bio.length > 400 ? bio.slice(0, 400) + '...' : bio;

      let actorHtml = `<div class="actor-profile-card" style="background:var(--bg-glass);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--border-subtle);border-radius:var(--radius-xl);padding:1.5rem;margin-bottom:2rem;display:flex;gap:1.5rem;align-items:flex-start;flex-wrap:wrap;">
        <div style="flex-shrink:0;text-align:center;">
          ${actor.profile_path ? `<img src="https://image.tmdb.org/t/p/w185${actor.profile_path}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid var(--accent);box-shadow:0 0 20px var(--accent-glow);" alt="${actor.name}">` : '<div style="width:120px;height:120px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:2.5rem;">🎭</div>'}
        </div>
        <div style="flex:1;min-width:200px;">
          <div style="font-size:1.4rem;font-weight:800;margin-bottom:0.3rem;">${actor.name}</div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.6rem;">
            <span style="background:rgba(139,92,246,0.15);color:#a78bfa;padding:0.2rem 0.6rem;border-radius:var(--radius-full);font-size:0.78rem;font-weight:600;">${actorDetails.known_for_department || actor.known_for_department || 'Acting'}</span>
            ${actorMovies.length > 0 ? `<span style="background:var(--accent-soft);color:var(--accent);padding:0.2rem 0.6rem;border-radius:var(--radius-full);font-size:0.78rem;font-weight:600;">🎬 ${actorMovies.length} Movies</span>` : ''}
            ${actorSeries.length > 0 ? `<span style="background:rgba(56,189,248,0.12);color:#38bdf8;padding:0.2rem 0.6rem;border-radius:var(--radius-full);font-size:0.78rem;font-weight:600;">📺 ${actorSeries.length} Series</span>` : ''}
          </div>
          <div style="display:flex;gap:1rem;flex-wrap:wrap;font-size:0.82rem;color:var(--text-muted);margin-bottom:0.6rem;">
            ${birthday ? `<span>🎂 ${birthday}${age ? ` (${deathday ? 'was ' : ''}${age} yrs)` : ''}</span>` : ''}
            ${deathday ? `<span>✝ ${deathday}</span>` : ''}
            ${birthplace ? `<span>📍 ${birthplace}</span>` : ''}
          </div>
          ${bioShort ? `<div id="actor-bio-text" style="font-size:0.88rem;color:var(--text-secondary);line-height:1.65;">${bioShort}${bio.length > 400 ? `<button id="actor-bio-expand" style="background:none;border:none;color:var(--accent);cursor:pointer;font-family:inherit;font-size:0.85rem;padding-left:0.3rem;">Read more</button>` : ''}</div>` : ''}
        </div>
      </div>`;

      if (actorMovies.length > 0) {
        const showCount = 8;
        actorHtml += `<h4 style="margin:1rem 0 0.8rem;">🎬 Movies (${actorMovies.length})</h4><div class="animated-grid" id="actor-movies-grid">${actorMovies.slice(0, showCount).map(createMovieCard).join('')}</div>`;
        if (actorMovies.length > showCount) {
          actorHtml += `<button id="show-more-actor-movies" style="margin:1rem 0;background:var(--surface);border:1px solid var(--border-subtle);color:var(--text-primary);padding:0.5rem 1.2rem;border-radius:var(--radius-full);cursor:pointer;font-family:inherit;">Show All ${actorMovies.length} Movies</button>`;
        }
      }
      if (actorSeries.length > 0) {
        const showCount = 8;
        actorHtml += `<h4 style="margin:1rem 0 0.8rem;">📺 Series (${actorSeries.length})</h4><div class="animated-grid" id="actor-series-grid">${actorSeries.slice(0, showCount).map(createSeriesCard).join('')}</div>`;
        if (actorSeries.length > showCount) {
          actorHtml += `<button id="show-more-actor-series" style="margin:1rem 0;background:var(--surface);border:1px solid var(--border-subtle);color:var(--text-primary);padding:0.5rem 1.2rem;border-radius:var(--radius-full);cursor:pointer;font-family:inherit;">Show All ${actorSeries.length} Series</button>`;
        }
      }
      actorDiv.innerHTML = actorHtml;
      // Bio expand handler
      const bioExpandBtn = document.getElementById('actor-bio-expand');
      if (bioExpandBtn && bio.length > 400) {
        bioExpandBtn.onclick = function() {
          document.getElementById('actor-bio-text').innerHTML = bio;
        };
      }
      // Show more handlers
      const showMoreMovies = document.getElementById('show-more-actor-movies');
      if (showMoreMovies) {
        showMoreMovies.onclick = function() {
          document.getElementById('actor-movies-grid').innerHTML = actorMovies.map(createMovieCard).join('');
          observeCards(document.getElementById('actor-movies-grid'));
          this.style.display = 'none';
        };
      }
      const showMoreSeries = document.getElementById('show-more-actor-series');
      if (showMoreSeries) {
        showMoreSeries.onclick = function() {
          document.getElementById('actor-series-grid').innerHTML = actorSeries.map(createSeriesCard).join('');
          observeCards(document.getElementById('actor-series-grid'));
          this.style.display = 'none';
        };
      }
    } else {
      actorDiv.innerHTML = '<div style="color:var(--text-muted);padding:1rem;">No actors found.</div>';
    }
  } catch (e) {
    moviesGrid.innerHTML = seriesGrid.innerHTML = actorDiv.innerHTML = '<div style="color:var(--accent);padding:1rem;">Failed to load search results.</div>';
  }
}

if (document.getElementById('search-movies')) renderSearchResults();

// --- Init Detail Pages ---
if (document.getElementById('movie-poster-card')) {
  loadGenreMaps().then(() => renderMovieDetail());
}
if (document.getElementById('series-poster-card')) {
  loadGenreMaps().then(() => renderSeriesDetail());
}

// ============================================
// Profile Page — Load from localStorage
// ============================================
// ============================================
// Profile Page — Load from localStorage
// ============================================
function renderProfilePage() {
  const watchedMoviesGrid = document.getElementById('watched-movies-grid');
  const watchedSeriesGrid = document.getElementById('watched-series-grid');
  
  if (!watchedMoviesGrid && !watchedSeriesGrid) return;

  try {
    const watched = getStorage('watched') || [];
    const watchedMovies = watched.filter(item => item.type === 'movie');
    const watchedSeries = watched.filter(item => item.type === 'tv' || item.type === 'series');

    const renderGrid = (grid, items, cardFn, emptyMsg) => {
      if (!grid) return;
      if (items && items.length > 0) {
        grid.innerHTML = items.map(cardFn).join('');
        observeCards(grid);
      } else {
        grid.innerHTML = `<div class="profile-empty">${emptyMsg}</div>`;
      }
    };

    renderGrid(watchedMoviesGrid, watchedMovies, createMovieCard, "You haven't watched any movies yet.");
    renderGrid(watchedSeriesGrid, watchedSeries, createSeriesCard, "You haven't watched any series yet.");
  } catch (err) {
    console.error("Profile render failed", err);
  }
}

function renderWishlistPage() {
  const wishlistMoviesGrid = document.getElementById('wishlist-movies-grid');
  const wishlistSeriesGrid = document.getElementById('wishlist-series-grid');
  
  if (!wishlistMoviesGrid && !wishlistSeriesGrid) return;

  try {
    const wishlist = getStorage('wishlist') || [];
    const wishlistMovies = wishlist.filter(item => item.type === 'movie');
    const wishlistSeries = wishlist.filter(item => item.type === 'tv' || item.type === 'series');

    const renderGrid = (grid, items, cardFn, emptyMsg) => {
      if (!grid) return;
      if (items && items.length > 0) {
        grid.innerHTML = items.map(cardFn).join('');
        observeCards(grid);
      } else {
        grid.innerHTML = `<div class="profile-empty">${emptyMsg}</div>`;
      }
    };

    renderGrid(wishlistMoviesGrid, wishlistMovies, createMovieCard, 'Your movie wishlist is empty. Start adding!');
    renderGrid(wishlistSeriesGrid, wishlistSeries, createSeriesCard, 'Your series wishlist is empty. Start adding!');
  } catch (err) {
    console.error("Wishlist render failed", err);
  }
}

// --- Instant Page Loading (Render from cache first) ---
if (document.getElementById('watched-movies-grid')) {
  renderProfilePage(); // Show cached results immediately
  loadGenreMaps().then(() => renderProfilePage()); // Update genres if map was loading
}
if (document.getElementById('wishlist-movies-grid')) {
  renderWishlistPage(); // Show cached results immediately
  loadGenreMaps().then(() => renderWishlistPage()); // Update genres if map was loading
}

// --- User Stats Logic ---
function renderStatsDashboard() {
  const container = document.getElementById('stats-dashboard');
  if (!container) return;
  
  const watched = getStorage('watched') || [];
  const meta = getStorage('watched_metadata') || {};
  
  let totalMinutes = 0;
  const genreCounts = {};
  
  watched.forEach(item => {
    const m = meta[item.id];
    if (m) {
      totalMinutes += m.runtime || 0;
      (m.genres || []).forEach(g => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    }
  });
  
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const topGenre = Object.entries(genreCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || 'Unknown';
  
  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${watched.length}</div>
        <div class="stat-label">Watched Titles</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${days}d ${hours}h</div>
        <div class="stat-label">Total Watch Time</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${topGenre}</div>
        <div class="stat-label">Favorite Genre</div>
      </div>
    </div>
  `;
}

// Refresh stats when profile updates
const originalRefresh = triggerUIRefresh;
triggerUIRefresh = function(listType) {
  originalRefresh(listType);
  if (listType === 'watched') renderStatsDashboard();
};

if (document.getElementById('stats-dashboard')) {
  renderStatsDashboard();
}

// --- Dice Logic (Random Discovery) ---
async function rollDice() {
  try {
    const randomPage = Math.floor(Math.random() * 5) + 1;
    const data = await fetchTMDB('/movie/top_rated', { page: randomPage });
    const movies = filterAdultContent(data.results || []);
    if (movies.length === 0) return;
    const randomMovie = movies[Math.floor(Math.random() * movies.length)];
    window.location.href = `movie_detail.html?id=${randomMovie.id}`;
  } catch (e) {
    alert("The dice are rolling a bit slow. Try again!");
  }
}

// ============================================
// Intersection Observer for Card Animations
// ============================================
function observeCards(container) {
  if (!('IntersectionObserver' in window)) return;
  const cards = container.querySelectorAll('.animated-card, .carousel-card');
  cards.forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.animation = 'none';
  });
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, idx) => {
      if (entry.isIntersecting) {
        const card = entry.target;
        const delay = parseInt(card.dataset.obsIdx || 0) * 60;
        setTimeout(() => {
          card.style.transition = 'opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        }, delay);
        observer.unobserve(card);
      }
    });
  }, { threshold: 0.1 });
  cards.forEach((card, i) => {
    card.dataset.obsIdx = i;
    observer.observe(card);
  });
}

// ============================================
// Navbar: Hamburger Toggle & Active Link
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Hamburger toggle
  const toggle = document.getElementById('navbar-toggle');
  const nav = document.getElementById('navbar-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('open');
      nav.classList.toggle('open');
      const navbarElem = document.querySelector('.navbar');
      if (navbarElem) navbarElem.classList.toggle('open');
    });
    
    // Ensure "Dice" icon exists in the navbar dynamically
    if (!nav.querySelector('.surprise-link')) {
      const li = document.createElement('li');
      li.innerHTML = '<a href="#" onclick="event.preventDefault(); rollDice();" class="surprise-link" title="Roll Dice">🎲</a>';
      nav.appendChild(li);
    }
  }

  // Active nav link
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navbar-nav li a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // Navbar scroll effect
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 30);
    }, { passive: true });
  }

  // Back to top button
  const backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Multi-Tab Sync: Instantly reflect changes made in other tabs
  window.addEventListener('storage', (e) => {
    if (e.key === 'watched') triggerUIRefresh('watched');
    if (e.key === 'wishlist') triggerUIRefresh('wishlist');
  });

  // Global navbar search autocomplete
  const navbarSearchInput = document.querySelector('.navbar .search-form input[name="q"]');
  if (navbarSearchInput) {
    initSearchAutocomplete(navbarSearchInput, { type: 'multi' });
  }
});