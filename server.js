const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;

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

// ✅ API Endpoint to fetch FULL data (NO filtering, NO pagination)
app.get('/api/data/full', (req, res) => {
    res.json(jsonData);
});

// ✅ API Endpoint to fetch data with filtering and pagination
app.get('/api/data', (req, res) => {
    let { category, search, page = 1, limit = 10 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    let filteredData = jsonData;

    // Filter by category-id
    if (category) {
        filteredData = filteredData.filter(item => item["category-id"] === category);
    }

    // Search in multiline_text
    if (search) {
        filteredData = filteredData.filter(item => 
            item.multiline_text.toLowerCase().includes(search.toLowerCase())
        );
    }

    // Pagination Logic
    const total_count = filteredData.length;
    const total_pages = Math.ceil(total_count / limit);
    const startIndex = (page - 1) * limit;
    const paginatedItems = filteredData.slice(startIndex, startIndex + limit);

    res.json({
        total_count,
        keyword: search || "",
        items_per_page: limit,
        total_pages,
        current_page: page,
        next_page: page < total_pages ? page + 1 : null,
        next_page_api: page < total_pages ? `?page=${page + 1}&limit=${limit}` : null,
        items: paginatedItems
    });
});

// Default route
app.get('/', (req, res) => {
    res.send('Welcome to the Express.js Backend');
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);
    console.log(`➡️ Full data API: http://localhost:${PORT}/api/data/full`);
    console.log(`➡️ Paginated data API: http://localhost:${PORT}/api/data`);
});
