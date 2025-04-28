require('dotenv').config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const NodeCache = require("node-cache");
const natural = require('natural');
const app = express();
const port = 3000;


// API Keys
const UNSPLASH_KEY = process.env.unplash_api;
const BRAVE_API_KEY = process.env.brave_api;


// Cache setup
const cache = new NodeCache({ stdTTL: 3600 });

// Middleware
app.use(cors());
app.use(express.json());

// Helper functions
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url?.substring(0, 50) || 'unknown';
  }
}

function calculateTextSimilarity(query, text) {
  if (!query || !text) return 0;
  
  const tokenizer = new natural.WordTokenizer();
  const queryTokens = tokenizer.tokenize(query.toLowerCase()) || [];
  const textTokens = tokenizer.tokenize((text || '').toLowerCase()) || [];
  const allText = `${text || ''}`.toLowerCase();
  
  if (queryTokens.length === 0 || textTokens.length === 0) return 0;

  const tfidf = new natural.TfIdf();
  tfidf.addDocument(allText);
  let tfidfScore = 0;
  
  queryTokens.forEach(token => {
    tfidf.listTerms(0).forEach(term => {
      if (term.term === token) {
        tfidfScore += term.tfidf;
      }
    });
  });
  
  const normalizedScore = tfidfScore / queryTokens.length;
  return isNaN(normalizedScore) ? 0 : Math.min(normalizedScore, 1);
}

function calculateSimilarityScores(query, results) {
  return results.map(result => {
    const titleScore = calculateTextSimilarity(query, result.title);
    const snippetScore = calculateTextSimilarity(query, result.snippet);
    const combinedScore = (titleScore * 0.7) + (snippetScore * 0.3);
    
    return {
      ...result,
      similarityScore: isNaN(combinedScore) ? 0 : combinedScore
    };
  })
  .sort((a, b) => b.similarityScore - a.similarityScore)
  .slice(0, 10);
}

function calculateImageSimilarityScores(query, images) {
  return images.map(image => {
    const titleScore = calculateTextSimilarity(query, image.title || '');
    const descriptionScore = calculateTextSimilarity(query, image.description || '');
    const combinedScore = (titleScore * 0.6) + (descriptionScore * 0.4);
    
    return {
      ...image,
      similarityScore: isNaN(combinedScore) ? 0 : Math.max(0, Math.min(1, combinedScore))
    };
  })
  // .filter(image => image.similarityScore > 0) 
  .sort((a, b) => b.similarityScore - a.similarityScore);
}

// Endpoints
app.get("/suggest", async (req, res) => {
  try {
    const query = req.query.q?.trim() || '';
    if (!query || query.length < 2) return res.json([]);

    const response = await axios.get(
      "https://suggestqueries.google.com/complete/search",
      {
        params: { q: query, client: "firefox", hl: "en" },
        timeout: 2000
      }
    );

    res.json((response.data[1] || []).slice(0, 5));
  } catch (error) {
    const query = req.query.q?.trim() || '';
    res.json([`${query} web`, `${query} search`, `${query} images`]);
  }
});

app.get("/search", async (req, res) => {
  try {
    const query = req.query.q?.trim();
    if (!query || query.length < 2) {
      return res.status(400).json({ error: "Query must be at least 2 characters" });
    }

    const cacheKey = `search-${query}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const response = await axios.get(
      "https://api.search.brave.com/res/v1/web/search",
      {
        params: { q: query, count: 20 },
        headers: {
          'X-Subscription-Token': BRAVE_API_KEY,
          'Accept': 'application/json',
          'User-Agent': 'SearchApp/1.0'
        },
        timeout: 10000
      }
    );

    let results = response.data.web?.results?.map(result => ({
      title: result.title,
      link: result.url,
      snippet: result.description,
      source: "Brave"
    })) || [];

    results = calculateSimilarityScores(query, results);

    cache.set(cacheKey, results);
    res.json(results);
  } catch (error) {
    console.error("Search error:", error.message);
    res.status(500).json([]);
  }
});

app.get("/image-search", async (req, res) => {
  try {
    const query = req.query.q?.trim();
    if (!query || query.length < 2) return res.status(400).json([]);

    const cacheKey = `unsplash-${query}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const response = await axios.get("https://api.unsplash.com/search/photos", {
      params: { query: query, per_page: 20, client_id: UNSPLASH_KEY },
      timeout: 8000
    });

    let results = response.data.results.map(photo => ({
      imageUrl: photo.urls.regular,
      sourceUrl: photo.links.html,
      title: photo.description || `Photo by ${photo.user.name}`,
      description: photo.alt_description || '',
      displayLink: "unsplash.com",
      width: photo.width,
      height: photo.height,
      source: "Unsplash"
    }));

    results = calculateImageSimilarityScores(query, results);

    cache.set(cacheKey, results);
    res.json(results);
  } catch (error) {
    const fallback = getFallbackImages(query);
    res.json(calculateImageSimilarityScores(query, fallback));
  }
});

function getFallbackImages(query) {
  return Array(5).fill().map((_, i) => ({
    imageUrl: `https://source.unsplash.com/300x300/?${encodeURIComponent(query)}&sig=${i}`,
    sourceUrl: `https://unsplash.com/s/photos/${encodeURIComponent(query)}`,
    title: `Fallback image for ${query}`,
    description: `Image related to ${query}`,
    displayLink: "unsplash.com",
    width: 300,
    height: 300,
    source: "Unsplash"
  }));
}

app.use(express.static("public"));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});