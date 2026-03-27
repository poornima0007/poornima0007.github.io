// ============================================
// Poflix — Enhanced Script
// ============================================

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
async function fetchTMDB(endpoint, params = {}) {
  params['api_key'] = TMDB_API_KEY;
  const url = `${TMDB_BASE_URL}${endpoint}?` + new URLSearchParams(params).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error('TMDb API error');
  return res.json();
}

// --- Genre Cache ---
let genreMapMovie = {};
let genreMapTV = {};
async function loadGenreMaps() {
  try {
    const [movieGenres, tvGenres] = await Promise.all([
      fetchTMDB('/genre/movie/list'),
      fetchTMDB('/genre/tv/list')
    ]);
    (movieGenres.genres || []).forEach(g => genreMapMovie[g.id] = g.name);
    (tvGenres.genres || []).forEach(g => genreMapTV[g.id] = g.name);
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
  const idx = arr.findIndex(i => i.id === item.id);
  if (idx >= 0) { arr.splice(idx, 1); } else { arr.push(item); }
  setStorage(key, arr);
  return idx < 0; // returns true if added
}

// --- Skeleton Loaders ---
function createSkeletonCards(count = 8, className = 'skeleton skeleton-card') {
  return Array(count).fill(`<div class="${className}"></div>`).join('');
}
function createSkeletonGrid(count = 12) {
  return Array(count).fill('<div class="skeleton skeleton-card-grid"></div>').join('');
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
  return `<a href="movie_detail.html?id=${movie.id}" class="animated-card" data-id="${movie.id}">
    ${year ? `<span class="card-year">${year}</span>` : ''}
    ${rating ? `<span class="card-rating">⭐ ${rating}</span>` : ''}
    <img src="${posterUrl}" alt="${movie.title}" loading="lazy">
    <div class="movie-title">${movie.title}</div>
  </a>`;
}

function createSeriesCard(series) {
  const year = (series.first_air_date || '').slice(0, 4);
  const rating = series.vote_average ? series.vote_average.toFixed(1) : '';
  const posterUrl = series.poster_path
    ? `https://image.tmdb.org/t/p/w342${series.poster_path}`
    : '';
  if (!posterUrl) return '';
  return `<a href="series_detail.html?id=${series.id}" class="animated-card" data-id="${series.id}">
    ${year ? `<span class="card-year">${year}</span>` : ''}
    ${rating ? `<span class="card-rating">⭐ ${rating}</span>` : ''}
    <img src="${posterUrl}" alt="${series.name}" loading="lazy">
    <div class="movie-title">${series.name}</div>
  </a>`;
}

function createCarouselMovieCard(movie) {
  const year = (movie.release_date || '').slice(0, 4);
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '';
  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
    : '';
  if (!posterUrl) return '';
  return `<a href="movie_detail.html?id=${movie.id}" class="carousel-card" data-id="${movie.id}">
    ${year ? `<span class="card-year">${year}</span>` : ''}
    ${rating ? `<span class="card-rating">⭐ ${rating}</span>` : ''}
    <img src="${posterUrl}" alt="${movie.title}" loading="lazy">
    <div class="movie-title">${movie.title}</div>
  </a>`;
}

function createCarouselSeriesCard(series) {
  const year = (series.first_air_date || '').slice(0, 4);
  const rating = series.vote_average ? series.vote_average.toFixed(1) : '';
  const posterUrl = series.poster_path
    ? `https://image.tmdb.org/t/p/w342${series.poster_path}`
    : '';
  if (!posterUrl) return '';
  return `<a href="series_detail.html?id=${series.id}" class="carousel-card" data-id="${series.id}">
    ${year ? `<span class="card-year">${year}</span>` : ''}
    ${rating ? `<span class="card-rating">⭐ ${rating}</span>` : ''}
    <img src="${posterUrl}" alt="${series.name}" loading="lazy">
    <div class="movie-title">${series.name}</div>
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
// Movies List Page
// ============================================
async function fetchGenres() {
  const data = await fetchTMDB('/genre/movie/list');
  return data.genres;
}

async function renderMoviesList(params = {}) {
  const grid = document.getElementById('movies-grid');
  if (!grid) return;
  grid.innerHTML = createSkeletonGrid(12);
  try {
    let data;
    if (params.query) {
      data = await fetchTMDB('/search/movie', { query: params.query, page: 1 });
    } else {
      const discoverParams = { sort_by: 'popularity.desc', page: 1 };
      if (params.year) discoverParams.primary_release_year = params.year;
      if (params.genre) discoverParams.with_genres = params.genre;
      data = await fetchTMDB('/discover/movie', discoverParams);
    }
    if (data.results && data.results.length > 0) {
      let filtered = filterAdultContent(data.results);
      if (params.genre === '10749') {
        const romanceKeywords = ['erotic', 'sexy', 'seductive', 'tempting', 'forbidden', 'taboo', 'mature', 'adult', 'nude', 'nudity', 'sexual', 'intimate', 'passionate', 'steamy', 'stepmom', 'stepmother', 'provocative', 'suggestive'];
        filtered = filtered.filter(m => {
          const t = (m.title || '').toLowerCase();
          const o = (m.overview || '').toLowerCase();
          return !romanceKeywords.some(k => t.includes(k) || o.includes(k));
        });
      }
      grid.innerHTML = filtered.slice(0, 20).map(createMovieCard).join('');
      observeCards(grid);
    } else {
      grid.innerHTML = '<div style="color:var(--accent);padding:2rem;">No movies found.</div>';
    }
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
  });
  document.getElementById('movie-filter-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const query = document.getElementById('movie-query').value.trim();
    const genre = document.getElementById('genre-select').value;
    const year = document.getElementById('movie-year').value.trim();
    renderMoviesList({ query, genre, year });
  });
}

// ============================================
// Series List Page
// ============================================
async function fetchSeriesGenres() {
  const data = await fetchTMDB('/genre/tv/list');
  return data.genres;
}

async function renderSeriesList(params = {}) {
  const grid = document.getElementById('series-grid');
  if (!grid) return;
  grid.innerHTML = createSkeletonGrid(12);
  try {
    let data;
    if (params.query) {
      data = await fetchTMDB('/search/tv', { query: params.query, page: 1 });
    } else {
      const discoverParams = { sort_by: 'popularity.desc', page: 1 };
      if (params.year) discoverParams.first_air_date_year = params.year;
      if (params.genre) discoverParams.with_genres = params.genre;
      data = await fetchTMDB('/discover/tv', discoverParams);
    }
    if (data.results && data.results.length > 0) {
      const filtered = filterAdultContent(data.results);
      grid.innerHTML = filtered.slice(0, 20).map(createSeriesCard).join('');
      observeCards(grid);
    } else {
      grid.innerHTML = '<div style="color:var(--accent);padding:2rem;">No series found.</div>';
    }
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
  });
  document.getElementById('series-filter-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const query = document.getElementById('series-query').value.trim();
    const genre = document.getElementById('series-genre-select').value;
    const year = document.getElementById('series-year').value.trim();
    renderSeriesList({ query, genre, year });
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
    const genrePills = (movie.genres || []).map(g => `<span class="badge">${g.name}</span>`).join('');
    infoCard.innerHTML = `
      <div class="movie-title-main">${movie.title}</div>
      <div class="movie-meta">
        <span class="badge">${movie.release_date ? movie.release_date.slice(0,4) : ''}</span>
        <span>⭐ ${movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}/10</span>
        <span>${movie.vote_count || 0} votes</span>
        <span>${movie.runtime ? movie.runtime + ' min' : ''}</span>
      </div>
      <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">${genrePills}</div>
      <div class="movie-overview">${movie.overview || ''}</div>
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
          <div class="movie-cast-card">
            ${actor.profile_path ? `<img src="https://image.tmdb.org/t/p/w185${actor.profile_path}" alt="${actor.name}">` : '<div style="width:64px;height:64px;border-radius:50%;background:var(--surface);"></div>'}
            <div class="cast-name">${actor.name}</div>
          </div>
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
    const genrePills = (series.genres || []).map(g => `<span class="badge">${g.name}</span>`).join('');
    infoCard.innerHTML = `
      <div class="series-title-main">${series.name}</div>
      <div class="series-meta">
        <span class="badge">${series.first_air_date ? series.first_air_date.slice(0,4) : ''}</span>
        <span>⭐ ${series.vote_average ? series.vote_average.toFixed(1) : 'N/A'}/10</span>
        <span>${series.vote_count || 0} votes</span>
        <span>${series.number_of_seasons || '?'} Season${(series.number_of_seasons||0) !== 1 ? 's' : ''}</span>
      </div>
      <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">${genrePills}</div>
      <div class="series-overview">${series.overview || ''}</div>
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
          <div class="series-cast-card">
            ${actor.profile_path ? `<img src="https://image.tmdb.org/t/p/w185${actor.profile_path}" alt="${actor.name}">` : '<div style="width:64px;height:64px;border-radius:50%;background:var(--surface);"></div>'}
            <div class="cast-name">${actor.name}</div>
          </div>
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
      let actorHtml = `<div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
        ${actor.profile_path ? `<img src="https://image.tmdb.org/t/p/w185${actor.profile_path}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid var(--border-subtle);" alt="${actor.name}">` : ''}
        <div><strong style="font-size:1.2rem;">${actor.name}</strong><br><span style="color:var(--text-muted);font-size:0.85rem;">Known for: ${actor.known_for_department || 'Acting'}</span></div>
      </div>`;

      let actorMovies = [], actorSeries = [];
      try {
        const actorMoviesData = await fetchTMDB(`/person/${actor.id}/movie_credits`);
        actorMovies = filterAdultContent(actorMoviesData.cast || []);
      } catch {}
      try {
        const actorSeriesData = await fetchTMDB(`/person/${actor.id}/tv_credits`);
        actorSeries = filterAdultContent(actorSeriesData.cast || []);
      } catch {}

      if (actorMovies.length > 0) {
        const showCount = 8;
        actorHtml += `<h4 style="margin:1rem 0 0.8rem;">🎬 Movies</h4><div class="animated-grid" id="actor-movies-grid">${actorMovies.slice(0, showCount).map(createMovieCard).join('')}</div>`;
        if (actorMovies.length > showCount) {
          actorHtml += `<button id="show-more-actor-movies" style="margin:1rem 0;background:var(--surface);border:1px solid var(--border-subtle);color:var(--text-primary);padding:0.5rem 1.2rem;border-radius:var(--radius-full);cursor:pointer;font-family:inherit;">Show More</button>`;
        }
      }
      if (actorSeries.length > 0) {
        const showCount = 8;
        actorHtml += `<h4 style="margin:1rem 0 0.8rem;">📺 Series</h4><div class="animated-grid" id="actor-series-grid">${actorSeries.slice(0, showCount).map(createSeriesCard).join('')}</div>`;
        if (actorSeries.length > showCount) {
          actorHtml += `<button id="show-more-actor-series" style="margin:1rem 0;background:var(--surface);border:1px solid var(--border-subtle);color:var(--text-primary);padding:0.5rem 1.2rem;border-radius:var(--radius-full);cursor:pointer;font-family:inherit;">Show More</button>`;
        }
      }
      actorDiv.innerHTML = actorHtml;
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
function renderProfilePage() {
  const favMoviesGrid = document.getElementById('fav-movies-grid');
  const favSeriesGrid = document.getElementById('fav-series-grid');
  const watchlistMoviesGrid = document.getElementById('watchlist-movies-grid');
  const watchlistSeriesGrid = document.getElementById('watchlist-series-grid');
  if (!favMoviesGrid) return;

  const favMovies = getStorage('fav-movies');
  const favSeries = getStorage('fav-series');
  const wlMovies = getStorage('watchlist-movies');
  const wlSeries = getStorage('watchlist-series');

  const renderGrid = (grid, items, cardFn, emptyMsg) => {
    if (items.length > 0) {
      grid.innerHTML = items.map(cardFn).join('');
      observeCards(grid);
    } else {
      grid.innerHTML = `<div class="profile-empty">${emptyMsg}</div>`;
    }
  };

  renderGrid(favMoviesGrid, favMovies, createMovieCard, 'No favorite movies yet. Browse and add some!');
  renderGrid(favSeriesGrid, favSeries, createSeriesCard, 'No favorite series yet. Browse and add some!');
  renderGrid(watchlistMoviesGrid, wlMovies, createMovieCard, 'Your movie watchlist is empty. Start adding!');
  renderGrid(watchlistSeriesGrid, wlSeries, createSeriesCard, 'Your series watchlist is empty. Start adding!');
}

if (document.getElementById('fav-movies-grid')) {
  loadGenreMaps().then(() => renderProfilePage());
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
    });
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
});