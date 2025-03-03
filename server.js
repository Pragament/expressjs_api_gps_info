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

app.get('/api/v1/items', (req, res) => {
    const { searchtext = "", "sub-category-id": subCategoryId, languages, current_page = 1, items_per_page = 10 } = req.query;

    const page = Math.max(1, parseInt(current_page) || 1); // ✅ Ensures page is at least 1
    const limit = parseInt(items_per_page) || 10;
    const startIndex = (page - 1) * limit;
    let filteredData = jsonData;

    // Search filter
    if (searchtext) {
        const normalizedSearchText = normalizeText(searchtext);
        filteredData = filteredData.filter(item =>
            normalizeText(item.multiline_text).includes(normalizedSearchText)
        );
    }

    // Sub-category filter
    if (subCategoryId) {
        filteredData = filteredData.filter(item => item["category-id"] === subCategoryId);
    }

    // Language filter
    if (languages) {
        const langArray = languages.split(",");
        filteredData = filteredData
            .filter(item => item.languages.some(lang => langArray.includes(lang)))
            .map(item => {
                const allTexts = item.multiline_text.split("\n");
                const langMapping = { "en": 0, "ta": 1, "hi": 2, "te": 3, "kn": 4, "ml": 5 };
                const filteredTexts = langArray.map(lang => allTexts[langMapping[lang]] || "").filter(text => text !== "");
                
                return {
                    ...item,
                    multiline_text: filteredTexts.length > 0 ? filteredTexts.join("\n") : "(No matching text found)"
                };
            });
    }

    // Pagination logic
    const total_count = filteredData.length;
    const total_pages = Math.ceil(total_count / limit);
    const paginatedResults = filteredData.slice(startIndex, startIndex + limit);

    res.json({
        total_count: total_count.toString(),
        keyword: searchtext || "",
        items_per_page: limit.toString(),
        total_pages: total_pages.toString(),
        current_page: page.toString(),
        next_page: page < total_pages ? (page + 1).toString() : "",
        next_page_api: page < total_pages ? `/api/v1/items?searchtext=${searchtext}&sub-category-id=${subCategoryId}&languages=${languages}&current_page=${page + 1}&items_per_page=${limit}` : "",
        items: paginatedResults
    });
});



// ✅ Fetch ALL Data Without Pagination (Full JSON Structure)
app.get('/api/v1/data/full', (req, res) => {
    res.json({
        total_count: jsonData.length.toString(),
        keyword: "", // No search keyword since it's full data
        items_per_page: jsonData.length.toString(), // All items in one response
        total_pages: "1", // Only one page since we return everything
        current_page: "1",
        next_page: "",
        next_page_api: "",
        items: jsonData // Return entire dataset
    });
});

// ✅ Get a Single Item by ID
app.get('/api/v1/item/:id', (req, res) => {
    const { id } = req.params;
    const item = jsonData.find(item => item["category-id"] === id);

    if (!item) {
        return res.status(404).json({ message: "Item not found" });
    }

    res.json(item);
});

// ✅ Get All Unique Languages in Data
app.get('/api/v1/languages', (req, res) => {
    const allLanguages = new Set();
    jsonData.forEach(item => {
        item.languages.forEach(lang => allLanguages.add(lang));
    });

    res.json({ languages: Array.from(allLanguages) });
});

// ✅ Get All Categories Available
app.get('/api/v1/categories', (req, res) => {
    const categories = [...new Set(jsonData.map(item => item["category-id"]))];
    res.json({ categories });
});

// ✅ Delete an Item by ID
app.delete('/api/v1/item/:id', (req, res) => {
    const { id } = req.params;
    const index = jsonData.findIndex(item => item["category-id"] === id);

    if (index === -1) {
        return res.status(404).json({ message: "Item not found" });
    }

    jsonData.splice(index, 1);
    res.json({ message: "Item deleted successfully", total_count: jsonData.length.toString() });
});

// ✅ Update an Item by ID
app.put('/api/v1/item/:id', (req, res) => {
    const { id } = req.params;
    const updatedData = req.body;

    const index = jsonData.findIndex(item => item["category-id"] === id);
    if (index === -1) {
        return res.status(404).json({ message: "Item not found" });
    }

    jsonData[index] = { ...jsonData[index], ...updatedData };
    res.json({ message: "Item updated successfully", updated_item: jsonData[index] });
});

// ✅ Get a Random Item
app.get('/api/v1/item/random', (req, res) => {
    if (jsonData.length === 0) {
        return res.status(404).json({ message: "No data available" });
    }

    const randomItem = jsonData[Math.floor(Math.random() * jsonData.length)];
    res.json(randomItem);
});

// ✅ Get Items Sorted by Category
app.get('/api/v1/items/sorted', (req, res) => {
    const sortedData = jsonData.slice().sort((a, b) => a["category-id"] - b["category-id"]);

    res.json({ total_count: sortedData.length.toString(), results: sortedData });
});

// ✅ Default Route
app.get('/', (req, res) => {
    res.send('Welcome to the Updated Express.js Backend');
});

// ✅ Start Server
app.listen(PORT, () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);
    console.log(`➡️ Search, Filter & Pagination API: http://localhost:${PORT}/api/v1/items?searchtext={searchtext}&sub-category-id={subcategoryid}&languages={te,hi}&current_page={pagenumber}`);
    console.log(`➡️ Full Data API: http://localhost:${PORT}/api/v1/data/full`);
});
