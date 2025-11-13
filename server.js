const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json({ limit: '500mb' }));

app.post('/clean-pdf-json', async (req, res) => {
  try {
    const { url, apiKey } = req.body;
    
    console.log('Fetching URL:', url);
    
    // Fetch the JSON file
    const headers = apiKey ? { 'x-api-key': apiKey } : {};
    const response = await axios.get(url, { 
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    const fullData = response.data;
    
    // Handle different JSON structures from PDF.co
    const pages = fullData.pages || fullData.document?.pages || [];
    
    console.log('Data structure:', {
      hasPages: pages.length > 0,
      pagesLength: pages.length,
      topLevelKeys: Object.keys(fullData)
    });
    
    if (pages.length === 0) {
      return res.json({
        error: 'No pages found',
        dataStructure: Object.keys(fullData),
        pages: [],
        originalSize: 0,
        cleanedSize: 0,
        savedCharacters: 0,
        estimatedTokensSaved: 0
      });
    }
    
    function cleanEmptyText(obj) {
      if (Array.isArray(obj)) {
        return obj
          .map(item => cleanEmptyText(item))
          .filter(item => {
            if (typeof item === 'object' && item !== null) {
              if (item.text === "" || item.text === null) return false;
              if (Object.keys(item).length === 0) return false;
            }
            return true;
          });
      } else if (typeof obj === 'object' && obj !== null) {
        const cleaned = {};
        for (const key in obj) {
          const value = cleanEmptyText(obj[key]);
          if (value !== "" && value !== null && 
              !(Array.isArray(value) && value.length === 0) &&
              !(typeof value === 'object' && Object.keys(value).length === 0)) {
            cleaned[key] = value;
          }
        }
        return cleaned;
      }
      return obj;
    }
    
    const cleanedPages = [];
    let originalSize = 0;
    let cleanedSize = 0;
    
    console.log(`Processing ${pages.length} pages...`);
    
    for (const page of pages) {
      originalSize += JSON.stringify(page).length;
      const cleanedPage = cleanEmptyText(page);
      const cleanedStr = JSON.stringify(cleanedPage);
      
      if (cleanedStr.length > 50) {
        cleanedPages.push(cleanedPage);
        cleanedSize += cleanedStr.length;
      }
    }
    
    console.log(`Cleaned ${cleanedPages.length} pages`);
    
    res.json({
      pages: cleanedPages,
      originalSize,
      cleanedSize,
      savedCharacters: originalSize - cleanedSize,
      estimatedTokensSaved: Math.round((originalSize - cleanedSize) / 4)
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
