const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

app.post('/clean-pdf-json', async (req, res) => {
  try {
    const { url } = req.body;
    
    // Fetch the JSON file
    const response = await axios.get(url);
    const fullData = response.data;
    
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
    
    for (const page of fullData.pages || []) {
      originalSize += JSON.stringify(page).length;
      const cleanedPage = cleanEmptyText(page);
      const cleanedStr = JSON.stringify(cleanedPage);
      
      if (cleanedStr.length > 50) {
        cleanedPages.push(cleanedPage);
        cleanedSize += cleanedStr.length;
      }
    }
    
    res.json({
      pages: cleanedPages,
      originalSize,
      cleanedSize,
      savedCharacters: originalSize - cleanedSize,
      estimatedTokensSaved: Math.round((originalSize - cleanedSize) / 4)
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

