// Load config
// Make sure to include <script src="config.js"></script> before this script in your HTML

async function fetchTMDB(endpoint, params = {}) {
  params['api_key'] = TMDB_API_KEY;
  const url = `${TMDB_BASE_URL}${endpoint}?` + new URLSearchParams(params).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error('TMDb API error');
  return res.json();
}

function createMovieCard(movie) {
  return `<a href="movie_detail.html?id=${movie.id}" class="carousel-card">
    <img src="https://image.tmdb.org/t/p/w342${movie.poster_path}" alt="${movie.title}">
    <div class="movie-title">${movie.title}</div>
  </a>`;
}

async function renderHomeCarousels() {
  const trendingRow = document.getElementById('trending-row');
  const popularRow = document.getElementById('popular-row');
  const recommendedRow = document.getElementById('recommended-row');
  const top10MoviesRow = document.getElementById('top10-movies-row');
  const top10SeriesRow = document.getElementById('top10-series-row');
  if (top10MoviesRow) top10MoviesRow.innerHTML = '<div>Loading...</div>';
  if (top10SeriesRow) top10SeriesRow.innerHTML = '<div>Loading...</div>';
  trendingRow.innerHTML = '<div>Loading...</div>';
  popularRow.innerHTML = '<div>Loading...</div>';
  recommendedRow.innerHTML = '<div>Loading...</div>';
  try {
    // Top 10 Movies
    if (top10MoviesRow) {
      const topMovies = await fetchTMDB('/movie/top_rated', { page: 1 });
      top10MoviesRow.innerHTML = topMovies.results.slice(0, 10).map(createMovieCard).join('');
    }
    // Top 10 Series
    if (top10SeriesRow) {
      const topSeries = await fetchTMDB('/tv/top_rated', { page: 1 });
      top10SeriesRow.innerHTML = topSeries.results.slice(0, 10).map(createSeriesCard).join('');
    }
    // Trending
    const trending = await fetchTMDB('/trending/movie/week');
    trendingRow.innerHTML = trending.results.slice(0, 12).map(createMovieCard).join('');
    // Popular
    const popular = await fetchTMDB('/movie/popular');
    popularRow.innerHTML = popular.results.slice(0, 12).map(createMovieCard).join('');
    // Recommended
    const recommended = await fetchTMDB('/discover/movie', { sort_by: 'vote_average.desc', 'vote_count.gte': 1000 });
    recommendedRow.innerHTML = recommended.results.slice(0, 12).map(createMovieCard).join('');
  } catch (e) {
    if (top10MoviesRow) top10MoviesRow.innerHTML = '<div style="color:#e50914">Failed to load.</div>';
    if (top10SeriesRow) top10SeriesRow.innerHTML = '<div style="color:#e50914">Failed to load.</div>';
    trendingRow.innerHTML = popularRow.innerHTML = recommendedRow.innerHTML = '<div style="color:#e50914">Failed to load movies.</div>';
  }
}

// Carousel scroll logic
function scrollRow(rowId, dir) {
  const row = document.getElementById(rowId);
  if (row) {
    const card = row.querySelector('.carousel-card');
    const scrollAmount = card ? card.offsetWidth + 24 : 240;
    row.scrollBy({ left: dir * scrollAmount * 2, behavior: 'smooth' });
  }
}
// Tab switching logic
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

// On home page, render carousels
if (document.getElementById('trending-row') && typeof TMDB_API_KEY !== 'undefined') {
  renderHomeCarousels();
}

// --- Movies List Page Logic ---
async function fetchGenres() {
  const data = await fetchTMDB('/genre/movie/list');
  return data.genres;
}

function createMovieCard(movie) {
  return `<a href="movie_detail.html?id=${movie.id}" class="animated-card">
    <img src="https://image.tmdb.org/t/p/w342${movie.poster_path}" alt="${movie.title}">
    <div class="movie-title">${movie.title}</div>
  </a>`;
}

async function renderMoviesList(params = {}) {
  const grid = document.getElementById('movies-grid');
  grid.innerHTML = '<div>Loading...</div>';
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
      grid.innerHTML = data.results.slice(0, 20).map(createMovieCard).join('');
    } else {
      grid.innerHTML = '<div style="color:#e50914">No movies found.</div>';
    }
  } catch (e) {
    grid.innerHTML = '<div style="color:#e50914">Failed to load movies.</div>';
  }
}

async function populateGenreDropdown() {
  const select = document.getElementById('genre-select');
  select.innerHTML = '<option value="">All Genres</option>';
  try {
    const genres = await fetchGenres();
    genres.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      select.appendChild(opt);
    });
  } catch (e) {
    select.innerHTML = '<option value="">All Genres</option>';
  }
}

if (document.getElementById('movies-grid')) {
  populateGenreDropdown();
  renderMoviesList();
  document.getElementById('movie-filter-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const query = document.getElementById('movie-query').value.trim();
    const genre = document.getElementById('genre-select').value;
    const year = document.getElementById('movie-year').value.trim();
    renderMoviesList({ query, genre, year });
  });
}

// --- Series List Page Logic ---
async function fetchSeriesGenres() {
  const data = await fetchTMDB('/genre/tv/list');
  return data.genres;
}

function createSeriesCard(series) {
  return `<a href="series_detail.html?id=${series.id}" class="animated-card">
    <img src="https://image.tmdb.org/t/p/w342${series.poster_path}" alt="${series.name}">
    <div class="movie-title">${series.name}</div>
  </a>`;
}

async function renderSeriesList(params = {}) {
  const grid = document.getElementById('series-grid');
  grid.innerHTML = '<div>Loading...</div>';
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
      grid.innerHTML = data.results.slice(0, 20).map(createSeriesCard).join('');
    } else {
      grid.innerHTML = '<div style="color:#e50914">No series found.</div>';
    }
  } catch (e) {
    grid.innerHTML = '<div style="color:#e50914">Failed to load series.</div>';
  }
}

async function populateSeriesGenreDropdown() {
  const select = document.getElementById('series-genre-select');
  select.innerHTML = '<option value="">All Genres</option>';
  try {
    const genres = await fetchSeriesGenres();
    genres.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      select.appendChild(opt);
    });
  } catch (e) {
    select.innerHTML = '<option value="">All Genres</option>';
  }
}

if (document.getElementById('series-grid')) {
  populateSeriesGenreDropdown();
  renderSeriesList();
  document.getElementById('series-filter-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const query = document.getElementById('series-query').value.trim();
    const genre = document.getElementById('series-genre-select').value;
    const year = document.getElementById('series-year').value.trim();
    renderSeriesList({ query, genre, year });
  });
}

// --- Movie Detail Page Logic ---
async function renderMovieDetail() {
  const posterCard = document.getElementById('movie-poster-card');
  const infoCard = document.getElementById('movie-info-card');
  const heroBg = document.getElementById('movie-hero-bg');
  const playerSection = document.getElementById('movie-player-section');
  const castSection = document.getElementById('movie-cast-section');
  if (!posterCard || !infoCard || !heroBg || !playerSection || !castSection) return;
  const urlParams = new URLSearchParams(window.location.search);
  const movieId = urlParams.get('id');
  if (!movieId) {
    posterCard.innerHTML = infoCard.innerHTML = playerSection.innerHTML = castSection.innerHTML = '<div style="color:#e50914">Movie not found.</div>';
    return;
  }
  posterCard.innerHTML = infoCard.innerHTML = playerSection.innerHTML = castSection.innerHTML = '<div class="spinner"></div>';
  try {
    const movie = await fetchTMDB(`/movie/${movieId}`);
    const credits = await fetchTMDB(`/movie/${movieId}/credits`);
    const videos = await fetchTMDB(`/movie/${movieId}/videos`);
    const cast = credits.cast ? credits.cast.slice(0, 12) : [];
    const trailer = (videos.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer');
    // Hero BG
    heroBg.style.backgroundImage = movie.backdrop_path ? `url(https://image.tmdb.org/t/p/original${movie.backdrop_path})` : 'none';
    heroBg.style.backgroundSize = 'cover';
    heroBg.style.backgroundPosition = 'center';
    heroBg.style.opacity = 0.35;
    // Poster
    posterCard.innerHTML = `<img src="https://image.tmdb.org/t/p/w500${movie.poster_path}" alt="${movie.title}" loading="lazy">`;
    // Info
    infoCard.innerHTML = `
      <div class="movie-title-main">${movie.title}</div>
      <div class="movie-meta">
        <span class="badge">${movie.release_date ? movie.release_date.slice(0,4) : ''}</span>
        <span>${(movie.genres||[]).map(g=>g.name).join(', ')}</span>
        <span>⭐ ${movie.vote_average}/10</span>
        <span>${movie.vote_count} votes</span>
      </div>
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
    // Player
    playerSection.innerHTML = `
      <h4>Watch Now</h4>
      <ul class="nav nav-tabs" id="streamTab" role="tablist" style="margin-bottom:0;">
        ${streamUrls.map((url, i) => `<li class="nav-item" role="presentation"><button class="nav-link${i===0?' active':''}" data-source="${i}">Source ${i+1}</button></li>`).join('')}
      </ul>
      <div class="tab-content" id="movie-player-frame">
        <iframe src="${streamUrls[0]}" width="100%" height="400" allowfullscreen style="border:none;"></iframe>
      </div>
      ${trailer ? `<div class="ratio ratio-16x9 mt-3"><iframe src="https://www.youtube.com/embed/${trailer.key}" allowfullscreen></iframe></div>` : ''}
    `;
    // Player source switching
    document.querySelectorAll('#streamTab .nav-link').forEach((btn, i) => {
      btn.onclick = function() {
        document.querySelectorAll('#streamTab .nav-link').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('movie-player-frame').innerHTML = `<iframe src="${streamUrls[i]}" width="100%" height="400" allowfullscreen style="border:none;"></iframe>`;
      };
    });
    // Cast
    castSection.innerHTML = `
      <h4>Cast</h4>
      <div class="movie-cast-list">
        ${cast.map(actor => `
          <div class="movie-cast-card">
            ${actor.profile_path ? `<img src="https://image.tmdb.org/t/p/w185${actor.profile_path}" alt="${actor.name}">` : '<div style="width:70px;height:70px;border-radius:50%;background:#333;"></div>'}
            <div class="cast-name">${actor.name}</div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    posterCard.innerHTML = infoCard.innerHTML = playerSection.innerHTML = castSection.innerHTML = '<div style="color:#e50914">Failed to load movie details.</div>';
  }
}

// --- Series Detail Page Logic ---
async function renderSeriesDetail() {
  const posterCard = document.getElementById('series-poster-card');
  const infoCard = document.getElementById('series-info-card');
  const heroBg = document.getElementById('series-hero-bg');
  const playerSection = document.getElementById('series-player-section');
  const castSection = document.getElementById('series-cast-section');
  if (!posterCard || !infoCard || !heroBg || !playerSection || !castSection) return;
  const urlParams = new URLSearchParams(window.location.search);
  const seriesId = urlParams.get('id');
  if (!seriesId) {
    posterCard.innerHTML = infoCard.innerHTML = playerSection.innerHTML = castSection.innerHTML = '<div style="color:#e50914">Series not found.</div>';
    return;
  }
  posterCard.innerHTML = infoCard.innerHTML = playerSection.innerHTML = castSection.innerHTML = '<div class="spinner"></div>';
  try {
    const series = await fetchTMDB(`/tv/${seriesId}`);
    const credits = await fetchTMDB(`/tv/${seriesId}/credits`);
    const videos = await fetchTMDB(`/tv/${seriesId}/videos`);
    const cast = credits.cast ? credits.cast.slice(0, 12) : [];
    const trailer = (videos.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer');
    const seasons = series.seasons || [];
    let currentSeasonIdx = 0;
    let currentEpisode = 1;
    let currentSource = 0; // 0: Source 1, 1: Source 2

    // Hero BG
    heroBg.style.backgroundImage = series.backdrop_path ? `url(https://image.tmdb.org/t/p/original${series.backdrop_path})` : 'none';
    heroBg.style.backgroundSize = 'cover';
    heroBg.style.backgroundPosition = 'center';
    heroBg.style.opacity = 0.35;
    // Poster
    posterCard.innerHTML = `<img src="https://image.tmdb.org/t/p/w500${series.poster_path}" alt="${series.name}" loading="lazy">`;
    // Info
    infoCard.innerHTML = `
      <div class="series-title-main">${series.name}</div>
      <div class="series-meta">
        <span class="badge">${series.first_air_date ? series.first_air_date.slice(0,4) : ''}</span>
        <span>${(series.genres||[]).map(g=>g.name).join(', ')}</span>
        <span>⭐ ${series.vote_average}/10</span>
        <span>${series.vote_count} votes</span>
      </div>
      <div class="series-overview">${series.overview || ''}</div>
    `;

    async function renderPlayerSection(fade = false) {
      const season = seasons[currentSeasonIdx];
      let episodes = [];
      if (fade) playerSection.innerHTML = '<div class="spinner"></div>';
      try {
        const seasonData = await fetchTMDB(`/tv/${seriesId}/season/${season.season_number}`);
        episodes = seasonData.episodes || [];
      } catch {}
      // Season tabs
      const seasonTabs = seasons.map((s, i) =>
        `<button class="series-season-tab${i===currentSeasonIdx?' active':''}" data-season-idx="${i}">Season ${s.season_number}</button>`
      ).join('');
      // Episodes list
      const episodesList = episodes.map(ep =>
        `<div class="series-episode-card${ep.episode_number===currentEpisode?' active':''}" data-ep="${ep.episode_number}">
          ${ep.still_path ? `<img src=\"https://image.tmdb.org/t/p/w300${ep.still_path}\" alt=\"${ep.name}\">` : ''}
          <div class="ep-title">Ep ${ep.episode_number}: ${ep.name}</div>
          <div class="ep-meta">${ep.air_date || ''}</div>
          <div class="ep-overview">${ep.overview || 'No description.'}</div>
        </div>`
      ).join('');
      // Streaming sources for series
      const seriesStreamUrls = [
        `https://vidsrc.xyz/embed/tv/${seriesId}/${season.season_number}/${currentEpisode}`,
        `https://embed.su/embed/tv/${seriesId}/${season.season_number}/${currentEpisode}`,
        `https://www.nontongo.win/embed/tv/${seriesId}/${season.season_number}/${currentEpisode}`,
        `https://player.videasy.net/tv/${seriesId}/${season.season_number}/${currentEpisode}`
      ];
      const streamTabs = seriesStreamUrls.map((url, i) => `<li class="nav-item" role="presentation"><button class="nav-link${currentSource===i?' active':''}" data-source="${i}">Source ${i+1}</button></li>`).join('');
      const streamIframe = `<iframe src="${seriesStreamUrls[currentSource]}" width="100%" height="400" allowfullscreen style="border:none;"></iframe>`;
      playerSection.innerHTML = `
        <h4>Watch Now</h4>
        <div class="series-season-tabs">${seasonTabs}</div>
        <div class="series-episodes-window">
          <div class="series-episodes-list">${episodesList}</div>
        </div>
        <ul class="nav nav-tabs" style="margin-bottom:0;">${streamTabs}</ul>
        <div class="tab-content">${streamIframe}</div>
        ${trailer ? `<div class="ratio ratio-16x9 mt-3"><iframe src="https://www.youtube.com/embed/${trailer.key}" allowfullscreen></iframe></div>` : ''}
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
      <h4>Cast</h4>
      <div class="series-cast-list">
        ${cast.map(actor => `
          <div class="series-cast-card">
            ${actor.profile_path ? `<img src="https://image.tmdb.org/t/p/w185${actor.profile_path}" alt="${actor.name}">` : '<div style="width:70px;height:70px;border-radius:50%;background:#333;"></div>'}
            <div class="cast-name">${actor.name}</div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    posterCard.innerHTML = infoCard.innerHTML = playerSection.innerHTML = castSection.innerHTML = '<div style="color:#e50914">Failed to load series details.</div>';
  }
}

// --- Search Page Logic ---
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
  moviesGrid.innerHTML = seriesGrid.innerHTML = actorDiv.innerHTML = '<div>Loading...</div>';
  try {
    // Movies
    const movieData = await fetchTMDB('/search/movie', { query, page: 1 });
    if (movieData.results && movieData.results.length > 0) {
      moviesGrid.innerHTML = movieData.results.slice(0, 12).map(createMovieCard).join('');
    } else {
      moviesGrid.innerHTML = '<div style="color:#e50914">No movies found.</div>';
    }
    // Series
    const seriesData = await fetchTMDB('/search/tv', { query, page: 1 });
    if (seriesData.results && seriesData.results.length > 0) {
      seriesGrid.innerHTML = seriesData.results.slice(0, 12).map(createSeriesCard).join('');
    } else {
      seriesGrid.innerHTML = '<div style="color:#e50914">No series found.</div>';
    }
    // Actor
    const personData = await fetchTMDB('/search/person', { query });
    if (personData.results && personData.results.length > 0) {
      const actor = personData.results[0];
      let actorHtml = `<div class="col-4 col-md-2 text-center mb-2">
        ${actor.profile_path ? `<img src="https://image.tmdb.org/t/p/w185${actor.profile_path}" class="img-fluid rounded-circle" alt="${actor.name}">` : ''}
        <div style="font-size:0.9rem;">${actor.name}</div>
      </div>`;
      // Fetch actor's movies and series
      let actorMovies = [];
      let actorSeries = [];
      try {
        const actorMoviesData = await fetchTMDB(`/person/${actor.id}/movie_credits`);
        actorMovies = actorMoviesData.cast || [];
      } catch {}
      try {
        const actorSeriesData = await fetchTMDB(`/person/${actor.id}/tv_credits`);
        actorSeries = actorSeriesData.cast || [];
      } catch {}
      // Movies section
      if (actorMovies.length > 0) {
        const showCount = 8;
        actorHtml += `<div><strong>Movies:</strong></div><div class="animated-grid" id="actor-movies-grid">${actorMovies.slice(0, showCount).map(createMovieCard).join('')}</div>`;
        if (actorMovies.length > showCount) {
          actorHtml += `<button id="show-more-actor-movies" style="margin:1rem 0;">Show More</button>`;
        }
      }
      // Series section
      if (actorSeries.length > 0) {
        const showCount = 8;
        actorHtml += `<div><strong>Series:</strong></div><div class="animated-grid" id="actor-series-grid">${actorSeries.slice(0, showCount).map(createSeriesCard).join('')}</div>`;
        if (actorSeries.length > showCount) {
          actorHtml += `<button id="show-more-actor-series" style="margin:1rem 0;">Show More</button>`;
        }
      }
      actorDiv.innerHTML = actorHtml;
      // Add event listeners for Show More buttons
      if (actorMovies.length > 8) {
        document.getElementById('show-more-actor-movies').onclick = function() {
          document.getElementById('actor-movies-grid').innerHTML = actorMovies.map(createMovieCard).join('');
          this.style.display = 'none';
        };
      }
      if (actorSeries.length > 8) {
        document.getElementById('show-more-actor-series').onclick = function() {
          document.getElementById('actor-series-grid').innerHTML = actorSeries.map(createSeriesCard).join('');
          this.style.display = 'none';
        };
      }
    } else {
      actorDiv.innerHTML = '<div style="color:#e50914">No actor found.</div>';
    }
  } catch (e) {
    moviesGrid.innerHTML = seriesGrid.innerHTML = actorDiv.innerHTML = '<div style="color:#e50914">Failed to load search results.</div>';
  }
}

if (document.getElementById('search-movies')) renderSearchResults();

// On detail pages, render details
if (document.getElementById('movie-poster-card')) renderMovieDetail();
if (document.getElementById('series-poster-card')) renderSeriesDetail();

// --- Animation and Micro-interactions Enhancements ---

function animateGridItems(gridSelector = '.animated-grid .animated-card') {
  const cards = document.querySelectorAll(gridSelector);
  cards.forEach((card, i) => {
    card.style.opacity = 0;
    card.style.transform = 'translateY(30px) scale(0.98)';
    setTimeout(() => {
      card.style.transition = 'opacity 0.5s cubic-bezier(.4,2,.3,1), transform 0.5s cubic-bezier(.4,2,.3,1)';
      card.style.opacity = 1;
      card.style.transform = 'translateY(0) scale(1)';
    }, 80 * i);
  });
}

function addButtonRippleEffect() {
  document.querySelectorAll('.btn, .search-form button').forEach(btn => {
    btn.addEventListener('click', function(e) {
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.left = (e.offsetX || e.clientX - btn.getBoundingClientRect().left) + 'px';
      ripple.style.top = (e.offsetY || e.clientY - btn.getBoundingClientRect().top) + 'px';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });
}

// Add ripple effect CSS
(function injectRippleCSS() {
  if (document.getElementById('ripple-style')) return;
  const style = document.createElement('style');
  style.id = 'ripple-style';
  style.textContent = `
    .ripple {
      position: absolute;
      border-radius: 50%;
      transform: scale(0);
      animation: ripple 0.6s linear;
      background: rgba(229,9,20,0.35);
      pointer-events: none;
      z-index: 10;
      width: 60px;
      height: 60px;
      left: 50%;
      top: 50%;
      margin-left: -30px;
      margin-top: -30px;
    }
    @keyframes ripple {
      to {
        transform: scale(2.5);
        opacity: 0;
      }
    }
    .btn, .search-form button { position: relative; overflow: hidden; }
  `;
  document.head.appendChild(style);
})();

// Animate cards on grid update
const origRenderMoviesList = renderMoviesList;
renderMoviesList = async function(params = {}) {
  await origRenderMoviesList(params);
  animateGridItems();
};

// Animate on initial load
if (document.getElementById('movies-grid')) {
  window.addEventListener('DOMContentLoaded', () => {
    animateGridItems();
    addButtonRippleEffect();
  });
} 