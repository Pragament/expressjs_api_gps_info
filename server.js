const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5001; // Changed from 5000 to 5001

// Middleware
app.use(cors());
app.use(express.json());

// Load JSON Data
const dataFilePath = path.join(__dirname, 'data.json');
let jsonData = [];

try {
    const rawData = fs.readFileSync(dataFilePath, 'utf8');
    jsonData = JSON.parse(rawData);

    // If JSON has a root "items" key, extract it
    if (jsonData.items) {
        jsonData = jsonData.items;
    }

    console.log("✅ Data loaded successfully. Total records:", jsonData.length);
} catch (error) {
    console.error("❌ Error reading JSON file:", error);
}

// 🔄 Normalize Text Function (removes special characters and makes lowercase)
const normalizeText = (text) => text.replace(/[^a-zA-Z0-9 ]/g, "").toLowerCase();

// ✅ Search API Endpoint (Fixes Case Sensitivity & Special Character Issues)
app.get('/api/v1/search/:searchtext', (req, res) => {
    const { searchtext } = req.params;
    const normalizedSearchText = normalizeText(searchtext);

    console.log("🔎 Searching for:", normalizedSearchText);

    if (jsonData.length === 0) {
        return res.json({
            message: "❌ No data loaded",
            total_results: 0,
            search_text: searchtext,
            results: []
        });
    }

    const filteredData = jsonData.filter(item =>
        normalizeText(item.multiline_text).includes(normalizedSearchText)
    );

    console.log("🔍 Found:", filteredData.length, "results");

    res.json({
        total_results: filteredData.length,
        search_text: searchtext,
        results: filteredData
    });
});

// ✅ Filter API Endpoint (Supports Sub-Category & Languages)
app.get('/api/v1/filter/all', (req, res) => {
    const { "sub-category-id": subCategoryId, languages, current_page = 1 } = req.query;
    const page = parseInt(current_page) || 1;
    const limit = 10;
    const startIndex = (page - 1) * limit;

    let filteredData = jsonData;

    // ✅ Filter by sub-category ID
    if (subCategoryId) {
        filteredData = filteredData.filter(item => item["category-id"] === subCategoryId);
    }

    // ✅ Filter by languages and correctly extract text
    if (languages) {
        const langArray = languages.split(","); // Convert "te,hi" → ["te", "hi"]

        filteredData = filteredData
            .filter(item => item.languages.some(lang => langArray.includes(lang))) // Keep matching items
            .map(item => {
                // ✅ Split `multiline_text` into separate language entries
                const allTexts = item.multiline_text.split("\n");

                // ✅ Use array position to match the correct language
                const langMapping = {
                    "en": 0, "ta": 1, "hi": 2, "te": 3, "kn": 4, "ml": 5
                };

                // ✅ Extract only the requested languages
                const filteredTexts = langArray.map(lang => {
                    const index = langMapping[lang]; // Get position of language in `multiline_text`
                    return allTexts[index] || ""; // Return text if available
                }).filter(text => text !== ""); // Remove empty results

                return {
                    ...item,
                    multiline_text: filteredTexts.length > 0 ? filteredTexts.join("\n") : "(No matching text found)"
                };
            });
    }

    // ✅ Pagination logic
    const total_count = filteredData.length;
    const total_pages = Math.ceil(total_count / limit);
    const paginatedResults = filteredData.slice(startIndex, startIndex + limit);

    res.json({
        total_count,
        current_page: page,
        total_pages,
        next_page: page < total_pages ? page + 1 : null,
        next_page_api: page < total_pages ? `?sub-category-id=${subCategoryId}&languages=${languages}&current_page=${page + 1}` : null,
        results: paginatedResults
    });
});

// ✅ Fetch ALL data (No filters, No pagination)
app.get('/api/v1/data/full', (req, res) => {
    res.json({
        total_count: jsonData.length,
        current_page: 1, // Always 1 since no pagination
        total_pages: 1,  // Everything is returned at once
        next_page: null,
        next_page_api: null,
        results: jsonData // ✅ Changed "items" to "results"
    });
});

// ✅ Default Route
app.get('/', (req, res) => {
    res.send('Welcome to the Updated Express.js Backend');
});

// ✅ Start Server
app.listen(PORT, () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);
    console.log(`➡️ Search API: http://localhost:${PORT}/api/v1/search/{searchtext}`);
    console.log(`➡️ Filter API: http://localhost:${PORT}/api/v1/filter/all?sub-category-id={subcategoryid}&languages={te,hi}&current_page={pagenumber}`);
    console.log(`➡️ Full Data API: http://localhost:${PORT}/api/v1/data/full`);
});
