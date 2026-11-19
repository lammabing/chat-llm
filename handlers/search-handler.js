import axios from 'axios';

export function createSearchHandler(ctx) {
  const { config } = ctx;
  async function handleSearchRequest(ws, message) {
    const { query } = message;

    if (!query) {
      ws.send(JSON.stringify({ type: 'error', message: 'Please provide a search query' }));
      return;
    }

    try {
      ws.send(JSON.stringify({ type: 'search_started', query: query }));

      let searchResults;

      switch (config.searchProvider.toLowerCase()) {
        case 'duckduckgo':
          searchResults = await searchDuckDuckGo(query);
          break;
        case 'tavily':
          if (!config.searchApiKey) {
            throw new Error('Tavily API key not configured. Please set SEARCH_API_KEY environment variable.');
          }
          searchResults = await searchTavily(query, config.searchApiKey);
          break;
        case 'serpapi':
          if (!config.searchApiKey) {
            throw new Error('SerpAPI key not configured. Please set SEARCH_API_KEY environment variable.');
          }
          searchResults = await searchSerpAPI(query, config.searchApiKey);
          break;
        default:
          throw new Error(`Unsupported search provider: ${config.searchProvider}`);
      }

      ws.send(JSON.stringify({ type: 'search_results', results: searchResults, provider: config.searchProvider }));
    } catch (error) {
      console.error('Search error:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Search failed: ${error.message}` }));
    }
  }

  async function searchDuckDuckGo(query) {
    try {
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 }
      });

      const results = [];
      if (response.data.RelatedTopics && response.data.RelatedTopics.length > 0) {
        response.data.RelatedTopics.slice(0, 5).forEach(topic => {
          if (topic.FirstURL && topic.Text) {
            results.push({ title: topic.Text, url: topic.FirstURL, content: topic.Text });
          }
        });
      } else {
        if (response.data.AbstractText) {
          results.push({
            title: response.data.Heading || query,
            url: response.data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            content: response.data.AbstractText
          });
        }
      }
      return results;
    } catch (error) {
      console.error('DuckDuckGo search error:', error.message);
      throw error;
    }
  }

  async function searchTavily(query, apiKey) {
    try {
      const response = await axios.post('https://api.tavily.com/search', {
        api_key: apiKey,
        query: query,
        include_answer: true,
        include_sources: true,
        max_results: 3
      });
      return response.data.results;
    } catch (error) {
      console.error('Tavily search error:', error.message);
      throw error;
    }
  }

  async function searchSerpAPI(query, apiKey) {
    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: { api_key: apiKey, q: query, google_domain: 'google.com', gl: 'us', hl: 'en' }
      });

      const results = [];
      if (response.data.organic_results) {
        response.data.organic_results.slice(0, 5).forEach(result => {
          results.push({ title: result.title, url: result.link, content: result.snippet || result.title });
        });
      }
      return results;
    } catch (error) {
      console.error('SerpAPI search error:', error.message);
      throw error;
    }
  }

  return { handleSearchRequest };
}
