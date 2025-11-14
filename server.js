const express = require('express');
const axios = require('axios');
const app = express();

/**
 * This server provides an endpoint to process a raw JSON output from a PDF extraction service.
 * The primary goal is to clean and restructure the data for consumption by an AI model.
 * It transforms the deeply nested JSON into a simplified structure that includes text content
 * along with its spatial bounding box coordinates, which is essential for layout-aware analysis.
 */

// Increase the payload size limit to handle very large JSON files from complex PDFs.
app.use(express.json({ limit: '500mb' }));

/**
 * @route POST /clean-pdf-json
 * @desc Fetches a raw PDF JSON from a URL, cleans it, and returns a structured format with text and coordinates.
 * @body {string} url - The URL of the raw JSON file to process.
 * @body {string} [apiKey] - An optional API key to include in the request headers.
 */
app.post('/clean-pdf-json', async (req, res) => {
  try {
    const { url, apiKey } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required in the request body.' });
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
    
    // Navigate to the array of pages in the nested structure.
    const pages = fullData.document?.page || [];
    
    console.log(`Found ${pages.length} pages to process.`);
    
    if (!Array.isArray(pages) || pages.length === 0) {
      return res.json({
        error: 'No pages found in the document structure.',
        data: { pages: [] },
        originalSize: originalSize,
        cleanedSize: 0,
        savedCharacters: originalSize,
        estimatedTokensSaved: Math.round(originalSize / 4)
      });
    }
    
    const cleanedPagesContent = [];
    
    for (const page of pages) {
      const pageElements = [];
      const rows = page.row || [];

      if (Array.isArray(rows)) {
        for (const row of rows) {
          const columns = row.column || [];
          if (Array.isArray(columns)) {
            for (const column of columns) {
              const textObj = column.text;
              
              // FINAL CORRECTION: Check if textObj is an object and has the '#text' property.
              // This robustly handles cases where column.text is an empty string "" or null.
              if (textObj && typeof textObj === 'object' && textObj['#text']) {
                const textContent = String(textObj['#text']).trim();
                
                // The coordinates are attributes of the textObj.
                const x = parseFloat(textObj['@x']);
                const y = parseFloat(textObj['@y']);
                const w = parseFloat(textObj['@width']);
                const h = parseFloat(textObj['@height']);

                // Only add the element if we have valid text AND valid numerical coordinates.
                if (textContent && !isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h)) {
                  pageElements.push({
                    text: textContent,
                    bbox: [x, y, x + w, y + h] // Storing as [x1, y1, x2, y2]
                  });
                }
              }
            }
          }
        }
      }
      
      if (pageElements.length > 0) {
        cleanedPagesContent.push(pageElements);
      }
    }
    
    const cleanedData = {
      pages: cleanedPagesContent 
    };

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
    res.status(500).json({ 
      error: 'Failed to process PDF JSON.', 
      details: error.message, 
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
});

/**
 * @route GET /health
 * @desc A simple health check endpoint to confirm the server is running.
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF cleaning server is running on port ${PORT}`);
});
