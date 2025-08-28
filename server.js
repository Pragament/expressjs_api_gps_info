const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5001; // Changed from 5000 to 5001

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

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

// Load Neighborhoods Data
const neighborhoodsFilePath = path.join(__dirname, 'neighborhoods_data_ss.json');
let neighborhoodsData = [];
try {
    const rawNeighborhoods = fs.readFileSync(neighborhoodsFilePath, 'utf8');
    neighborhoodsData = JSON.parse(rawNeighborhoods);
    console.log("✅ Neighborhoods data loaded. Total records:", neighborhoodsData.length);
} catch (error) {
    console.error("❌ Error reading neighborhoods JSON file:", error);
    console.log("ℹ️ Using empty neighborhoods data array. Please ensure neighborhoods_data_ss.json exists with valid JSON data.");
}

// Load Pincode Data from CSV
const pincodeFilePath = path.join(__dirname, 'pincode_with_lat_long.csv');
let pincodeData = [];

try {
    const rawPincodeData = fs.readFileSync(pincodeFilePath, 'utf8');
    const lines = rawPincodeData.split('\n');
    const headers = lines[0].split(',');
    
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            const values = lines[i].split(',');
            const pincodeRecord = {};
            
            headers.forEach((header, index) => {
                pincodeRecord[header.trim()] = values[index] ? values[index].trim() : '';
            });
            
            // Convert latitude and longitude to numbers
            if (pincodeRecord.Latitude && pincodeRecord.Longitude) {
                pincodeRecord.Latitude = parseFloat(pincodeRecord.Latitude);
                pincodeRecord.Longitude = parseFloat(pincodeRecord.Longitude);
            }
            
            pincodeData.push(pincodeRecord);
        }
    }
    
    console.log("✅ Pincode data loaded successfully. Total records:", pincodeData.length);
} catch (error) {
    console.error("❌ Error reading pincode CSV file:", error);
    console.log("ℹ️ Using empty pincode data array. Please ensure pincode_with_lat_long.csv exists.");
}

// Haversine formula to calculate distance between two lat/lng points in km
function haversineDistance(lat1, lon1, lat2, lon2) {
    function toRad(x) { return x * Math.PI / 180; }
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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
app.get("/api/mp/:pincode", async (req, res) => {
  try {
    const { pincode } = req.params;

    // Example: POST request to PRS India MPTrack with pincode
    const response = await axios.post("https://prsindia.org/mptrack", {
      search: pincode,
    });

    // NOTE: PRS returns HTML, not JSON → so you may need to parse it
    // If you want structured JSON, you can scrape/parse here
    res.send(response.data);

  } catch (error) {
    console.error("Error fetching MP data:", error.message);
    res.status(500).json({ error: "Failed to fetch MP data" });
  }
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

// Helper function to generate Wikipedia URL from place name
function generateWikipediaUrl(placeName) {
    if (!placeName || placeName === 'N/A') return null;
    
    // Clean the place name for URL
    const cleanName = placeName
        .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .trim();
    
    if (cleanName.length === 0) return null;
    
    return `https://en.wikipedia.org/wiki/${cleanName}`;
}

// API: Get neighborhoods within a given range (km) of given lat/lng (returns only required fields)
app.get('/api/v1/neighborhoods/nearby', (req, res) => {
    const { lat, lng, range } = req.query;
    if (!lat || !lng) {
        return res.status(400).json({ message: "lat and lng query parameters are required" });
    }
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const maxDistance = range ? parseFloat(range) : 50; // Default to 50km if not provided
    if (isNaN(latitude) || isNaN(longitude) || isNaN(maxDistance)) {
        return res.status(400).json({ message: "lat, lng, and range must be valid numbers" });
    }
    const results = neighborhoodsData
        .map(place => {
            const distance = haversineDistance(latitude, longitude, place.latitude, place.longitude);
            return {
                placeName: place.placeName,
                placeType: place.placeType,
                country: place.country,
                state: place.state,
                region: place.region,
                district: place.district,
                pincode: place.pincode,
                lokSabhaConstituency: (() => {
                    const lokSabha = place.lokSabhaConstituency || place.LokSabhaConstituency;
                    return (lokSabha && lokSabha !== 'N/A') ? lokSabha : null;
                })(),
                vidhanSabhaConstituency: (() => {
                    const vidhanSabha = place.vidhanSabhaConstituency || place.VidhanSabhaConstituency || place.AssemblyConstituency;
                    return (vidhanSabha && vidhanSabha !== 'N/A') ? vidhanSabha : null;
                })(),
                imageUrls: place.imageUrls,
                wikipediaUrl: generateWikipediaUrl(place.placeName),
                distance_km: parseFloat(distance.toFixed(2))
            };
        })
        .filter(place => place.distance_km <= maxDistance)
        .sort((a, b) => a.distance_km - b.distance_km);
    res.json({
        count: results.length,
        input: { lat: latitude, lng: longitude, range: maxDistance },
        places: results
    });
});


// Debug endpoint to check raw data
app.get('/api/v1/debug/constituencies', (req, res) => {
    const sampleData = neighborhoodsData.slice(0, 5).map(place => ({
        placeName: place.placeName,
        lokSabhaConstituency: place.lokSabhaConstituency,
        vidhanSabhaConstituency: place.vidhanSabhaConstituency,
        LokSabhaConstituency: place.LokSabhaConstituency,
        VidhanSabhaConstituency: place.VidhanSabhaConstituency,
        AssemblyConstituency: place.AssemblyConstituency
    }));
    res.json(sampleData);
});

// Debug endpoint to check processed data
app.get('/api/v1/debug/processed', (req, res) => {
    const { lat, lng } = req.query;
    const latitude = parseFloat(lat) || 17;
    const longitude = parseFloat(lng) || 78;
    
    const sampleData = neighborhoodsData.slice(0, 5).map(place => {
        const distance = haversineDistance(latitude, longitude, place.latitude, place.longitude);
        return {
            placeName: place.placeName,
            raw_lokSabha: place.lokSabhaConstituency,
            raw_vidhanSabha: place.vidhanSabhaConstituency,
            processed_lokSabha: (() => {
                const lokSabha = place.lokSabhaConstituency || place.LokSabhaConstituency;
                return (lokSabha && lokSabha !== 'N/A') ? lokSabha : null;
            })(),
            processed_vidhanSabha: (() => {
                const vidhanSabha = place.vidhanSabhaConstituency || place.VidhanSabhaConstituency || place.AssemblyConstituency;
                return (vidhanSabha && vidhanSabha !== 'N/A') ? vidhanSabha : null;
            })(),
            distance_km: parseFloat(distance.toFixed(2))
        };
    });
    res.json(sampleData);
});

// 🔍 Search Pincode by Number
app.get('/api/v1/pincode/search', (req, res) => {
    const { pincode, state, district, office } = req.query;
    
    let filteredData = pincodeData;
    
    // Filter by pincode
    if (pincode) {
        filteredData = filteredData.filter(record => 
            record.Pincode && record.Pincode.toString().includes(pincode.toString())
        );
    }
    
    // Filter by state
    if (state) {
        filteredData = filteredData.filter(record => 
            record.StateName && record.StateName.toLowerCase().includes(state.toLowerCase())
        );
    }
    
    // Filter by district
    if (district) {
        filteredData = filteredData.filter(record => 
            record.District && record.District.toLowerCase().includes(district.toLowerCase())
        );
    }
    
    // Filter by office name
    if (office) {
        filteredData = filteredData.filter(record => 
            record.OfficeName && record.OfficeName.toLowerCase().includes(office.toLowerCase())
        );
    }
    
    res.json({
        count: filteredData.length,
        filters: { pincode, state, district, office },
        results: filteredData
    });
});

// 🔍 Get Pincode Details by Exact Pincode
app.get('/api/v1/pincode/:pincode', (req, res) => {
    const { pincode } = req.params;
    
    const pincodeDetails = pincodeData.filter(record => 
        record.Pincode && record.Pincode.toString() === pincode.toString()
    );
    
    if (pincodeDetails.length === 0) {
        return res.status(404).json({ 
            message: "Pincode not found",
            pincode: pincode
        });
    }
    
    res.json({
        pincode: pincode,
        count: pincodeDetails.length,
        details: pincodeDetails
    });
});

// 🔍 Get Pincodes by State
app.get('/api/v1/pincode/state/:state', (req, res) => {
    const { state } = req.params;
    
    const statePincodes = pincodeData.filter(record => 
        record.StateName && record.StateName.toLowerCase().includes(state.toLowerCase())
    );
    
    res.json({
        state: state,
        count: statePincodes.length,
        pincodes: statePincodes
    });
});

// 🔍 Get Pincodes by District
app.get('/api/v1/pincode/district/:district', (req, res) => {
    const { district } = req.params;
    
    const districtPincodes = pincodeData.filter(record => 
        record.District && record.District.toLowerCase().includes(district.toLowerCase())
    );
    
    res.json({
        district: district,
        count: districtPincodes.length,
        pincodes: districtPincodes
    });
});

// 🔍 Find Nearest Pincodes by Coordinates
app.get('/api/v1/pincode/nearby', (req, res) => {
    const { lat, lng, range = 50 } = req.query;
    
    if (!lat || !lng) {
        return res.status(400).json({ 
            message: "lat and lng query parameters are required" 
        });
    }
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const maxDistance = parseFloat(range);
    
    if (isNaN(latitude) || isNaN(longitude) || isNaN(maxDistance)) {
        return res.status(400).json({ 
            message: "lat, lng, and range must be valid numbers" 
        });
    }
    
    const nearbyPincodes = pincodeData
        .filter(record => record.Latitude && record.Longitude)
        .map(record => {
            const distance = haversineDistance(latitude, longitude, record.Latitude, record.Longitude);
            return {
                ...record,
                distance_km: parseFloat(distance.toFixed(2))
            };
        })
        .filter(record => record.distance_km <= maxDistance)
        .sort((a, b) => a.distance_km - b.distance_km);
    
    res.json({
        count: nearbyPincodes.length,
        input: { lat: latitude, lng: longitude, range: maxDistance },
        pincodes: nearbyPincodes
    });
});

// 🔍 Get All States
app.get('/api/v1/pincode/states', (req, res) => {
    const states = [...new Set(pincodeData.map(record => record.StateName).filter(Boolean))].sort();
    
    res.json({
        count: states.length,
        states: states
    });
});

// 🔍 Get Districts by State
app.get('/api/v1/pincode/states/:state/districts', (req, res) => {
    const { state } = req.params;
    
    const districts = [...new Set(
        pincodeData
            .filter(record => record.StateName && record.StateName.toLowerCase().includes(state.toLowerCase()))
            .map(record => record.District)
            .filter(Boolean)
    )].sort();
    
    res.json({
        state: state,
        count: districts.length,
        districts: districts
    });
});

// 🔍 Enhanced Neighborhoods API with Pincode Integration
app.get('/api/v1/neighborhoods/nearby/enhanced', (req, res) => {
    const { lat, lng, range = 50 } = req.query;
    
    if (!lat || !lng) {
        return res.status(400).json({ 
            message: "lat and lng query parameters are required" 
        });
    }
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const maxDistance = parseFloat(range);
    
    if (isNaN(latitude) || isNaN(longitude) || isNaN(maxDistance)) {
        return res.status(400).json({ 
            message: "lat, lng, and range must be valid numbers" 
        });
    }
    
    // Get nearby neighborhoods
    const nearbyNeighborhoods = neighborhoodsData
        .map(place => {
            const distance = haversineDistance(latitude, longitude, place.latitude, place.longitude);
            return {
                placeName: place.placeName,
                placeType: place.placeType,
                country: place.country,
                state: place.state,
                region: place.region,
                district: place.district,
                pincode: place.pincode,
                lokSabhaConstituency: (() => {
                    const lokSabha = place.lokSabhaConstituency || place.LokSabhaConstituency;
                    return (lokSabha && lokSabha !== 'N/A') ? lokSabha : null;
                })(),
                vidhanSabhaConstituency: (() => {
                    const vidhanSabha = place.vidhanSabhaConstituency || place.VidhanSabhaConstituency || place.AssemblyConstituency;
                    return (vidhanSabha && vidhanSabha !== 'N/A') ? vidhanSabha : null;
                })(),
                imageUrls: place.imageUrls,
                wikipediaUrl: generateWikipediaUrl(place.placeName),
                distance_km: parseFloat(distance.toFixed(2))
            };
        })
        .filter(place => place.distance_km <= maxDistance)
        .sort((a, b) => a.distance_km - b.distance_km);
    
    // Get nearby pincodes
    const nearbyPincodes = pincodeData
        .filter(record => record.Latitude && record.Longitude)
        .map(record => {
            const distance = haversineDistance(latitude, longitude, record.Latitude, record.Longitude);
            return {
                pincode: record.Pincode,
                officeName: record.OfficeName,
                district: record.District,
                stateName: record.StateName,
                divisionName: record.DivisionName,
                regionName: record.RegionName,
                latitude: record.Latitude,
                longitude: record.Longitude,
                distance_km: parseFloat(distance.toFixed(2))
            };
        })
        .filter(record => record.distance_km <= maxDistance)
        .sort((a, b) => a.distance_km - b.distance_km);
    
    res.json({
        count: {
            neighborhoods: nearbyNeighborhoods.length,
            pincodes: nearbyPincodes.length
        },
        input: { lat: latitude, lng: longitude, range: maxDistance },
        neighborhoods: nearbyNeighborhoods,
        pincodes: nearbyPincodes
    });
});

// 🔍 Get Nearby Places with Pincode Information (Combined Array)
app.get('/api/v1/places/nearby', (req, res) => {
    const { lat, lng, range = 50 } = req.query;
    
    if (!lat || !lng) {
        return res.status(400).json({ 
            message: "lat and lng query parameters are required" 
        });
    }
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const maxDistance = parseFloat(range);
    
    if (isNaN(latitude) || isNaN(longitude) || isNaN(maxDistance)) {
        return res.status(400).json({ 
            message: "lat, lng, and range must be valid numbers" 
        });
    }
    
    const nearbyPlaces = [];
    
    // Add neighborhoods with pincode info
    neighborhoodsData.forEach(place => {
        const distance = haversineDistance(latitude, longitude, place.latitude, place.longitude);
        if (distance <= maxDistance) {
            nearbyPlaces.push({
                type: "neighborhood",
                placeName: place.placeName,
                placeType: place.placeType,
                country: place.country,
                state: place.state,
                region: place.region,
                district: place.district,
                pincode: place.pincode,
                latitude: place.latitude,
                longitude: place.longitude,
                lokSabhaConstituency: (() => {
                    const lokSabha = place.lokSabhaConstituency || place.LokSabhaConstituency;
                    return (lokSabha && lokSabha !== 'N/A') ? lokSabha : null;
                })(),
                vidhanSabhaConstituency: (() => {
                    const vidhanSabha = place.vidhanSabhaConstituency || place.VidhanSabhaConstituency || place.AssemblyConstituency;
                    return (vidhanSabha && vidhanSabha !== 'N/A') ? vidhanSabha : null;
                })(),
                imageUrls: place.imageUrls,
                wikipediaUrl: generateWikipediaUrl(place.placeName),
                distance_km: parseFloat(distance.toFixed(2)),
                // Pincode information (if available)
                pincodeInfo: null
            });
        }
    });
    
    // Add pincode locations
    pincodeData.forEach(record => {
        if (record.Latitude && record.Longitude) {
            const distance = haversineDistance(latitude, longitude, record.Latitude, record.Longitude);
            if (distance <= maxDistance) {
                nearbyPlaces.push({
                    type: "pincode",
                    placeName: record.OfficeName,
                    placeType: "Post Office",
                    country: "India",
                    state: record.StateName,
                    region: record.RegionName,
                    district: record.District,
                    pincode: record.Pincode,
                    latitude: record.Latitude,
                    longitude: record.Longitude,
                    lokSabhaConstituency: null,
                    vidhanSabhaConstituency: null,
                    imageUrls: [],
                    wikipediaUrl: null,
                    distance_km: parseFloat(distance.toFixed(2)),
                    // Detailed pincode information
                    pincodeInfo: {
                        officeName: record.OfficeName,
                        divisionName: record.DivisionName,
                        regionName: record.RegionName,
                        stateName: record.StateName,
                        district: record.District,
                        pincode: record.Pincode
                    }
                });
            }
        }
    });
    
    // Sort by distance
    nearbyPlaces.sort((a, b) => a.distance_km - b.distance_km);
    
    res.json({
        count: nearbyPlaces.length,
        input: { 
            lat: latitude, 
            lng: longitude, 
            range: maxDistance 
        },
        places: nearbyPlaces
    });
});

// 🔍 Get Nearby Places with Enhanced Pincode Matching
app.get('/api/v1/places/nearby/enhanced', (req, res) => {
    const { lat, lng, range = 50 } = req.query;
    
    if (!lat || !lng) {
        return res.status(400).json({ 
            message: "lat and lng query parameters are required" 
        });
    }
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const maxDistance = parseFloat(range);
    
    if (isNaN(latitude) || isNaN(longitude) || isNaN(maxDistance)) {
        return res.status(400).json({ 
            message: "lat, lng, and range must be valid numbers" 
        });
    }
    
    const nearbyPlaces = [];
    
    // Process neighborhoods and try to match with pincode data
    neighborhoodsData.forEach(place => {
        const distance = haversineDistance(latitude, longitude, place.latitude, place.longitude);
        if (distance <= maxDistance) {
            // Try to find matching pincode data
            let matchedPincode = null;
            if (place.pincode) {
                matchedPincode = pincodeData.find(p => 
                    p.Pincode && p.Pincode.toString() === place.pincode.toString()
                );
            }
            
            // If no exact match, find nearest pincode within 5km
            if (!matchedPincode) {
                const nearbyPincodes = pincodeData
                    .filter(p => p.Latitude && p.Longitude)
                    .map(p => ({
                        ...p,
                        distance: haversineDistance(place.latitude, place.longitude, p.Latitude, p.Longitude)
                    }))
                    .filter(p => p.distance <= 5) // Within 5km
                    .sort((a, b) => a.distance - b.distance);
                
                if (nearbyPincodes.length > 0) {
                    matchedPincode = nearbyPincodes[0];
                }
            }
            
            nearbyPlaces.push({
                type: "neighborhood",
                placeName: place.placeName,
                placeType: place.placeType,
                country: place.country,
                state: place.state,
                region: place.region,
                district: place.district,
                pincode: place.pincode,
                latitude: place.latitude,
                longitude: place.longitude,
                lokSabhaConstituency: (() => {
                    const lokSabha = place.lokSabhaConstituency || place.LokSabhaConstituency;
                    return (lokSabha && lokSabha !== 'N/A') ? lokSabha : null;
                })(),
                vidhanSabhaConstituency: (() => {
                    const vidhanSabha = place.vidhanSabhaConstituency || place.VidhanSabhaConstituency || place.AssemblyConstituency;
                    return (vidhanSabha && vidhanSabha !== 'N/A') ? vidhanSabha : null;
                })(),
                imageUrls: place.imageUrls,
                wikipediaUrl: generateWikipediaUrl(place.placeName),
                distance_km: parseFloat(distance.toFixed(2)),
                // Enhanced pincode information
                pincodeInfo: matchedPincode ? {
                    officeName: matchedPincode.OfficeName,
                    divisionName: matchedPincode.DivisionName,
                    regionName: matchedPincode.RegionName,
                    stateName: matchedPincode.StateName,
                    district: matchedPincode.District,
                    pincode: matchedPincode.Pincode,
                    matchType: place.pincode ? "exact" : "nearest",
                    matchDistance: matchedPincode.distance ? parseFloat(matchedPincode.distance.toFixed(2)) : 0
                } : null
            });
        }
    });
    
    // Add standalone pincode locations (not already included in neighborhoods)
    pincodeData.forEach(record => {
        if (record.Latitude && record.Longitude) {
            const distance = haversineDistance(latitude, longitude, record.Latitude, record.Longitude);
            if (distance <= maxDistance) {
                // Check if this pincode is already included in neighborhoods
                const alreadyIncluded = nearbyPlaces.some(place => 
                    place.pincode && place.pincode.toString() === record.Pincode.toString()
                );
                
                if (!alreadyIncluded) {
                    nearbyPlaces.push({
                        type: "pincode",
                        placeName: record.OfficeName,
                        placeType: "Post Office",
                        country: "India",
                        state: record.StateName,
                        region: record.RegionName,
                        district: record.District,
                        pincode: record.Pincode,
                        latitude: record.Latitude,
                        longitude: record.Longitude,
                        lokSabhaConstituency: null,
                        vidhanSabhaConstituency: null,
                        imageUrls: [],
                        wikipediaUrl: null,
                        distance_km: parseFloat(distance.toFixed(2)),
                        pincodeInfo: {
                            officeName: record.OfficeName,
                            divisionName: record.DivisionName,
                            regionName: record.RegionName,
                            stateName: record.StateName,
                            district: record.District,
                            pincode: record.Pincode,
                            matchType: "direct",
                            matchDistance: 0
                        }
                    });
                }
            }
        }
    });
    
    // Sort by distance
    nearbyPlaces.sort((a, b) => a.distance_km - b.distance_km);
    
    res.json({
        count: nearbyPlaces.length,
        input: { 
            lat: latitude, 
            lng: longitude, 
            range: maxDistance 
        },
        places: nearbyPlaces
    });
});

// ✅ Default Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ✅ Start Server
app.listen(PORT, () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);
    console.log(`➡️ Search, Filter & Pagination API: http://localhost:${PORT}/api/v1/items?searchtext={searchtext}&sub-category-id={subcategoryid}&languages={te,hi}&current_page={pagenumber}`);
    console.log(`➡️ Full Data API: http://localhost:${PORT}/api/v1/data/full`);
    console.log(`➡️ Pincode Search API: http://localhost:${PORT}/api/v1/pincode/search?pincode={pincode}&state={state}&district={district}`);
    console.log(`➡️ Enhanced Neighborhoods API: http://localhost:${PORT}/api/v1/neighborhoods/nearby/enhanced?lat={lat}&lng={lng}&range={range}`);
    console.log(`➡️ Nearby Places with Pincode: http://localhost:${PORT}/api/v1/places/nearby?lat={lat}&lng={lng}&range={range}`);
    console.log(`➡️ Enhanced Nearby Places: http://localhost:${PORT}/api/v1/places/nearby/enhanced?lat={lat}&lng={lng}&range={range}`);
});
