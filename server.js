const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json({ limit: '500mb' }));

// Helper function to flatten all text elements on a page into a single string.
const getPageAsText = (page) => {
  const pageTexts = [];
  const rows = page.row || [];
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const columns = row.column || [];
      if (Array.isArray(columns)) {
        for (const column of columns) {
          const textObj = column.text;
          if (textObj && typeof textObj === 'object' && textObj['#text']) {
            const textContent = String(textObj['#text']).trim();
            if (textContent) {
              pageTexts.push(textContent);
            }
          }
        }
      }
    }
  }
  return pageTexts.join(' ');
};

app.post('/clean-pdf-json', async (req, res) => {
  try {
    const { url, apiKey } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required.' });
    }
    
    console.log('Fetching URL:', url);
    const headers = apiKey ? { 'x-api-key': apiKey } : {};
    const response = await axios.get(url, { 
      headers,
      responseType: 'json',
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const fullData = response.data;
    const originalSize = JSON.stringify(fullData).length;
    const pages = fullData.document?.page || [];
    console.log(`Found ${pages.length} pages to process.`);
    
    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: 'No pages found in document.' });
    }
    
    const cleanedPagesContent = [];
    
    // Define the data signatures for a critical page
    const basinRegex = /B-[\w\d]+/g;
    const acreageRegex = /\d+\.\d{2} ac\./g;
    const MIN_MATCH_COUNT = 3; // Threshold to qualify a page as a drainage map

    for (const page of pages) {
      const pageTextForScanning = getPageAsText(page);

      // Heuristic Check: Does this page contain the data we need?
      const basinMatches = pageTextForScanning.match(basinRegex);
      const acreageMatches = pageTextForScanning.match(acreageRegex);

      const isCriticalPage = 
        (basinMatches && basinMatches.length >= MIN_MATCH_COUNT) &&
        (acreageMatches && acreageMatches.length >= MIN_MATCH_COUNT);

      if (isCriticalPage) {
        console.log(`Page ${page['@index']}: Detected as a critical drainage map. Processing with details.`);
        // DETAILED PROCESSING for critical pages
        const pageElements = [];
        const rows = page.row || [];
        if (Array.isArray(rows)) {
          for (const row of rows) {
            const columns = row.column || [];
            if (Array.isArray(columns)) {
              for (const column of columns) {
                const textObj = column.text;
                if (textObj && typeof textObj === 'object' && textObj['#text']) {
                  const textContent = String(textObj['#text']).trim();
                  
                  const x = parseFloat(parseFloat(textObj['@x']).toFixed(2));
                  const y = parseFloat(parseFloat(textObj['@y']).toFixed(2));
                  const w = parseFloat(parseFloat(textObj['@width']).toFixed(2));
                  const h = parseFloat(parseFloat(textObj['@height']).toFixed(2));

                  if (textContent && !isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h)) {
                    pageElements.push({
                      text: textContent,
                      bbox: [x, y, x + w, y + h]
                    });
                  }
                }
              }
            }
          }
        }
        cleanedPagesContent.push({ type: 'detailed', content: pageElements });
      } else {
        // SIMPLE PROCESSING for all other pages
        cleanedPagesContent.push({ type: 'simple', content: pageTextForScanning });
      }
    }
    
    const cleanedData = { pages: cleanedPagesContent };
    const cleanedSize = JSON.stringify(cleanedData).length;
    const savedCharacters = originalSize - cleanedSize;
    
    console.log(`Processing complete. Original size: ${originalSize}, Cleaned size: ${cleanedSize}, Saved: ${savedCharacters} chars.`);
    
    res.json({
      data: cleanedData,
      originalSize,
      cleanedSize,
      savedCharacters,
      estimatedTokensSaved: Math.round(savedCharacters / 4)
    });
    
  } catch (error) {
    console.error('An error occurred:', error.message);
    res.status(500).json({ error: 'Failed to process PDF JSON.', details: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF cleaning server is running on port ${PORT}`);
});
