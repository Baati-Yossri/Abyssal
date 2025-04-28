// DOM Elements
const input = document.getElementById("search-input");
const suggestionsBox = document.getElementById("suggestions");
const resultsContainer = document.getElementById("results");
const searchForm = document.getElementById("search-form");
const logo = document.querySelector(".logo");
const body = document.body;

// State
let currentSearchType = "web";
let currentQuery = "";
let suggestionTimer;
let originalQuery = "";

// Main Search Function
async function performSearch(query, type = "web") {
  query = query?.trim();
  if (!query || query.length < 2) {
    showErrorMessage("Please enter at least 2 characters");
    return;
  }

  clearSuggestions();
  currentQuery = query;
  currentSearchType = type;
  setLoadingState(true);
  resultsContainer.innerHTML = "";

  try {
    const endpoint = type === "image" ? "/image-search" : "/search";
    const startTime = performance.now();
    
    const response = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`);
    
    if (!response.ok) throw new Error(`Search failed (${response.status})`);

    const results = await response.json();

    if (type === "image") {
      if (results.length === 0) showNoImagesMessage(query);
      else displayImages(results);
    } else {
      displayWebResults(results, query);
    }

    window.history.pushState(
      { query, type },
      "",
      `?q=${encodeURIComponent(query)}&type=${type}`
    );

  } catch (error) {
    console.error("Search error:", error);
    showErrorMessage(
      type === "image" 
        ? "Couldn't load images. Try again later." 
        : "Search failed. Please try different terms."
    );
    if (type === "image") displayImages([]);
  } finally {
    setLoadingState(false);
  }
}

// Display Functions
function displayWebResults(results, query) {
  const safeResults = Array.isArray(results) ? results : [];
  resultsContainer.innerHTML = `
    <div class="result-categories">
      <div class="categories">
        <span class="${currentSearchType === "web" ? "active" : ""}" data-type="web">All</span>
        <span class="${currentSearchType === "image" ? "active" : ""}" data-type="image">Images</span>
      </div>
      <div class="similarity-info">
        Results ranked by relevance to "${query}"
      </div>
    </div>
    <div class="search-stats">About ${safeResults.length} results</div>
    ${safeResults.map(result => `
      <div class="result-item">
        <div class="result-url">${extractDomain(result.link)} • ${result.source || "Web"}
          <span class="relevance-badge">${Math.round((result.similarityScore || 0) * 100)}% match</span>
        </div>
        <a href="${result.link}" class="result-title">${result.title || "No title"}</a>
        <p class="result-snippet">${result.snippet || "No description available"}</p>
      </div>
    `).join("")}
  `;
  setupCategoryTabs();
}

function displayImages(images) {
  const safeImages = Array.isArray(images) ? images : [];
  resultsContainer.innerHTML = `
    <div class="result-categories">
      <div class="categories">
        <span class="${currentSearchType === "web" ? "active" : ""}" data-type="web">All</span>
        <span class="active" data-type="image">Images</span>
      </div>
      <div class="similarity-info">
        Images ranked by relevance to "${currentQuery}"
      </div>
    </div>
    <div class="search-stats">${safeImages.length} images for "${currentQuery}"</div>
    <div class="image-grid">
      ${safeImages.map(img => `
        <a href="${img.sourceUrl}" target="_blank" class="image-card">
          <img src="${img.imageUrl}" 
               alt="${img.title}" 
               loading="lazy"
               width="${img.width || 300}"
               height="${img.height || 300}">
          <div class="image-info">
            <div class="image-title">${truncateText(img.title, 50)}</div>
            <div class="image-meta">
              <span class="image-credit">Photo via ${img.source}</span>
              <span class="relevance-badge">${Math.round((img.similarityScore || 0) * 100)}% match</span>
            </div>
          </div>
        </a>
      `).join("")}
    </div>
  `;
  setupCategoryTabs();
}

function showNoImagesMessage(query) {
  resultsContainer.innerHTML = `
    <div class="no-images">
      <p>No images found for "${query}"</p>
      <a href="https://unsplash.com/s/photos/${encodeURIComponent(query)}" 
         target="_blank"
         class="unsplash-fallback">
        Search directly on Unsplash
      </a>
    </div>
  `;
}

// Suggestions Functions
function fetchSuggestions(query) {
  if (!query || query.length < 2) {
    clearSuggestions();
    return;
  }

  clearTimeout(suggestionTimer);
  suggestionTimer = setTimeout(async () => {
    try {
      const response = await fetch(`/suggest?q=${encodeURIComponent(query)}`);
      if (!response.ok) return;
      
      const suggestions = await response.json();
      showSuggestions(Array.isArray(suggestions) ? suggestions : []);
    } catch (error) {
      console.error("Suggestions error:", error);
      clearSuggestions();
    }
  }, 300);
}

function showSuggestions(suggestions) {
  const safeSuggestions = Array.isArray(suggestions) ? suggestions.slice(0, 5) : [];
  
  suggestionsBox.innerHTML = safeSuggestions.map(suggestion => `
    <li tabindex="0">${suggestion}</li>
  `).join("");

  positionSuggestionsBox();
  suggestionsBox.style.display = safeSuggestions.length ? "block" : "none";

  
  Array.from(suggestionsBox.children).forEach(li => {
    li.addEventListener("click", () => {
      input.value = li.textContent;
      performSearch(input.value.trim());
    });
    
    li.addEventListener("mouseover", () => {
      document.querySelectorAll('#suggestions li').forEach(item => {
        item.classList.remove("suggestion-active");
      });
      li.classList.add("suggestion-active");
    });
  });
}

// Helper Functions
function extractDomain(url) {
  if (!url) return "";
  try {
    const domain = new URL(url).hostname.replace("www.", "");
    return domain.length > 30 ? `${domain.substring(0, 30)}...` : domain;
  } catch {
    return url.length > 30 ? `${url.substring(0, 30)}...` : url;
  }
}

function truncateText(text, maxLength) {
  if (!text) return "";
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
}

function setLoadingState(isLoading) {
  if (isLoading) {
    body.classList.add("has-results");
    if (logo) logo.classList.add("searching");
    resultsContainer.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Searching ${currentSearchType === "image" ? "images" : "the web"} for "${currentQuery}"...</p>
      </div>
    `;
  } else {
    if (logo) logo.classList.remove("searching");
  }
}

function showErrorMessage(message) {
  resultsContainer.innerHTML = `
    <div class="error-state">
      <p>${message}</p>
      <button onclick="performSearch(currentQuery, currentSearchType)">Try Again</button>
    </div>
  `;
}

function positionSuggestionsBox() {
  const inputRect = input.getBoundingClientRect();
  const containerRect = searchForm.getBoundingClientRect();
  
  if (body.classList.contains("has-results")) {
    suggestionsBox.style.position = "fixed";
    suggestionsBox.style.top = `${inputRect.bottom + window.scrollY}px`;
    suggestionsBox.style.left = "46.4%";
    suggestionsBox.style.transform = "translateX(-50%)";
    suggestionsBox.style.width = "500px";
    suggestionsBox.style.maxWidth = "600px";
  } else {
    suggestionsBox.style.position = "absolute";
    suggestionsBox.style.top = "100%";
    suggestionsBox.style.left = "0";
    suggestionsBox.style.width = "449.5px";
    suggestionsBox.style.transform = "none";
    suggestionsBox.style.maxWidth = "500px";
  }
}

function clearSuggestions() {
  suggestionsBox.innerHTML = "";
  suggestionsBox.style.display = "none";
}

function setupCategoryTabs() {
  document.querySelectorAll(".categories span").forEach(tab => {
    tab.addEventListener("click", () => {
      const query = input.value.trim();
      if (!query) return;
      
      const type = tab.dataset.type;
      if (type) performSearch(query, type);
    });
  });
}

// Event Listeners
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  performSearch(input.value.trim());
});

input.addEventListener("input", () => {
  originalQuery = input.value.trim();
  const query = input.value.trim();
  if (query) {
    fetchSuggestions(query);
    positionSuggestionsBox();
  } else {
    clearSuggestions();
  }
});

input.addEventListener("focus", () => {
  if (input.value.trim()) {
    fetchSuggestions(input.value.trim());
    positionSuggestionsBox();
  }
});

document.addEventListener("click", (e) => {
  if (!suggestionsBox.contains(e.target) && e.target !== input) {
    clearSuggestions();
  }
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    input.value = originalQuery;
    clearSuggestions();
    input.blur();
  }
  
  if (suggestionsBox.children.length > 0) {
    const current = document.querySelector(".suggestion-active");
    const items = Array.from(suggestionsBox.children);
    let index = current ? items.indexOf(current) : -1;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      index = (index + 1) % items.length;
      items.forEach(item => item.classList.remove("suggestion-active"));
      items[index].classList.add("suggestion-active");
    } 
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      index = (index - 1 + items.length) % items.length;
      items.forEach(item => item.classList.remove("suggestion-active"));
      items[index].classList.add("suggestion-active");
    } 
    else if (e.key === "Enter") {
      if (current) {
        e.preventDefault();
        input.value = current.textContent;
        performSearch(input.value.trim());
        clearSuggestions();
      }
    }
  }
});

window.addEventListener("resize", () => {
  positionSuggestionsBox();
});

window.addEventListener("popstate", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get("q");
  const type = urlParams.get("type");
  
  if (query) {
    input.value = query;
    performSearch(query, type || "web");
  } else {
    resetToHomepage();
  }
});

if (logo) {
  logo.addEventListener("click", resetToHomepage);
}

// Utility Functions
function resetToHomepage() {
  body.classList.remove("has-results");
  resultsContainer.innerHTML = "";
  input.value = "";
  clearSuggestions();
  input.focus();
  window.history.pushState({}, "", "/");
}

// Initialize
function init() {
  input.focus();
  
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get("q");
  const type = urlParams.get("type");
  
  if (query) {
    input.value = query;
    performSearch(query, type || "web");
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
}

// Start the application
init();