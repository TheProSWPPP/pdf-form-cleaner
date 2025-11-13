const express = require('express');
const axios =require('axios');
const app = express();

// Increase the limit to handle very large JSON files from complex PDFs
app.use(express.json({ limit: '500mb' }));

app.post('/clean-pdf-json', async (req, res) => {
  try {
    const { url, apiKey } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required in the request body.' });
    }
    
    console.log('Fetching URL:', url);
    
    // Fetch the JSON file from the provided URL
    const headers = apiKey ? { 'x-api-key': apiKey } : {};
    const response = await axios.get(url, { 
      headers,
      responseType: 'json', // Ensure axios parses the JSON automatically
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const fullData = response.data;
    const originalSize = JSON.stringify(fullData).length;
    
    // Navigate to the array of pages in the nested structure
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
    
    // Iterate through each page to extract and flatten text
    for (const page of pages) {
      const pageTexts = [];
      const rows = page.row || [];

      if (Array.isArray(rows)) {
        for (const row of rows) {
          const columns = row.column || [];
          if (Array.isArray(columns)) {
            for (const column of columns) {
              // The target text is nested inside column.text['#text']
              const textObj = column.text;
              if (textObj && typeof textObj === 'object' && textObj['#text']) {
                const textContent = String(textObj['#text']).trim(); // Ensure it's a string and trim whitespace
                if (textContent) {
                  pageTexts.push(textContent);
                }
              }
            }
          }
        }
      }
      
      // Join all extracted text from a single page into one coherent string
      if (pageTexts.length > 0) {
        cleanedPagesContent.push(pageTexts.join(' '));
      }
    }
    
    // This is the new, simplified data structure for the AI
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
    // Provide a more detailed error response for easier debugging
    res.status(500).json({ 
      error: 'Failed to process PDF JSON.', 
      details: error.message, 
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
});

// A simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF cleaning server is running on port ${PORT}`);
});
