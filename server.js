// server.js (Complete Backend with SQLite)

// =====================================================================
// --- 1. Module Imports ---
// This section imports all the necessary packages for your server to run.
// It's best practice to keep all 'require' statements at the top of the file.
// =====================================================================
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config(); // Loads the secret API key from your .env file
const sqlite3 = require('sqlite3').verbose();


// =====================================================================
// --- 2. Server Setup & Middleware ---
// Create the Express app instance and apply all middleware here.
// =====================================================================
const app = express();
const port = process.env.PORT || 3001; // Use a single port variable

// Apply middleware. CORS and express.json should be applied before any routes.
app.use(cors()); // Allows your HTML file to communicate with this server
app.use(express.json({ limit: '10mb' })); // Allows the server to read JSON data from requests


// =====================================================================
// --- 3. Database Setup ---
// Connect to the SQLite database and create tables if they don't exist.
// This should only be done once.
// =====================================================================
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        // Create the submitted_content table
        db.run(`CREATE TABLE IF NOT EXISTS submitted_content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt TEXT NOT NULL,
            schema TEXT,
            ai_response TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Error creating submitted_content table:', err.message);
        });

        // Create the formulas table
        db.run(`CREATE TABLE IF NOT EXISTS formulas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            category TEXT,
            subject TEXT,
            topic TEXT,
            sub_topic TEXT,
            formula TEXT,
            description TEXT,
            variables TEXT, -- Stored as JSON string
            connections TEXT, -- Stored as JSON string
            examples TEXT, -- Stored as JSON string
            verified_by_ai BOOLEAN DEFAULT FALSE,
            custom_user TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Error creating formulas table:', err.message);
        });

        // Create the problems table
        db.run(`CREATE TABLE IF NOT EXISTS problems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            answer TEXT NOT NULL,
            formulaKeys TEXT, -- Stored as JSON string
            difficulty TEXT,
            subject TEXT,
            topic TEXT,
            analysis TEXT,
            hint TEXT,
            custom_user TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Error creating problems table:', err.message);
        });
    }
});


// =====================================================================
// --- 4. API Endpoints ---
// All your server routes and logic should be defined here.
// =====================================================================

// --- DEBUGGING: Log environment variables to server console ---
// You can uncomment this section to debug your .env file
/*
console.log("--- Environment Variables Loaded ---");
console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "Loaded" : "NOT FOUND");
console.log("FIREBASE_API_KEY:", process.env.FIREBASE_API_KEY ? "Loaded" : "NOT FOUND");
console.log("FIREBASE_AUTH_DOMAIN:", process.env.FIREBASE_AUTH_DOMAIN ? "Loaded" : "NOT FOUND");
console.log("FIREBASE_PROJECT_ID:", process.env.FIREBASE_PROJECT_ID ? "Loaded" : "NOT FOUND");
console.log("FIREBASE_STORAGE_BUCKET:", process.env.FIREBASE_STORAGE_BUCKET ? "Loaded" : "NOT FOUND");
console.log("FIREBASE_MESSAGING_SENDER_ID:", process.env.FIREBASE_MESSAGING_SENDER_ID ? "Loaded" : "NOT FOUND");
console.log("FIREBASE_APP_ID:", process.env.FIREBASE_APP_ID ? "Loaded" : "NOT FOUND");
console.log("------------------------------------");
*/

// Endpoint to serve Firebase and Gemini configurations to the frontend
app.get('/api/config', (req, res) => {
    try {
        const config = {
            firebaseApiKey: process.env.FIREBASE_API_KEY,
            firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN,
            firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
            firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            firebaseAppId: process.env.FIREBASE_APP_ID,
            geminiApiKey: process.env.GEMINI_API_KEY // Include Gemini API key here
        };
        console.log("Sending config to frontend...");
        res.json({ success: true, data: config });
    } catch (error) {
        console.error("Error serving config:", error);
        res.status(500).json({ success: false, error: "Failed to load configuration." });
    }
});

// API Endpoints for AI calls
app.post('/api/call-gemini', async (req, res) => {
    try {
        const { prompt, schema } = req.body;
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

        if (!GEMINI_API_KEY) {
            return res.status(400).json({ success: false, error: "Gemini API key is missing. Please ensure it's provided in your .env file." });
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

        const generationConfig = schema ? {
            responseMimeType: "application/json",
            responseSchema: schema,
        } : undefined;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig,
        });

        const response = await result.response;
        const text = response.text();

        db.run("INSERT INTO submitted_content (prompt, schema, ai_response) VALUES (?, ?, ?)",
            [prompt, schema ? JSON.stringify(schema) : null, text],
            function(err) {
                if (err) {
                    console.error("Error saving AI interaction:", err.message);
                } else {
                    console.log(`AI interaction saved with ID: ${this.lastID}`);
                }
            }
        );

        res.json({ success: true, data: text });

    } catch (error) {
        console.error("Error in /api/call-gemini:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint to save submitted content
app.post('/api/save-content', (req, res) => {
    const { prompt, schema, ai_response } = req.body;

    if (!prompt) {
        return res.status(400).json({ success: false, error: 'Prompt is required.' });
    }

    const stmt = db.prepare("INSERT INTO submitted_content (prompt, schema, ai_response) VALUES (?, ?, ?)");
    stmt.run(prompt, schema ? JSON.stringify(schema) : null, ai_response, function(err) {
        if (err) {
            console.error("Error saving content:", err.message);
            return res.status(500).json({ success: false, error: 'Failed to save content.', dbError: err.message });
        }
        console.log(`Content saved with ID: ${this.lastID}`);
        res.json({ success: true, message: 'Content saved successfully.', id: this.lastID });
    });
    stmt.finalize();
});

// Endpoint to get all saved content
app.get('/api/get-saved-content', (req, res) => {
    db.all("SELECT id, prompt, schema, ai_response, timestamp FROM submitted_content ORDER BY timestamp DESC", [], (err, rows) => {
        if (err) {
            console.error("Error retrieving content:", err.message);
            return res.status(500).json({ success: false, error: 'Failed to retrieve content.', dbError: err.message });
        }
        const content = rows.map(row => ({
            ...row,
            schema: row.schema ? JSON.parse(row.schema) : null
        }));
        res.json({ success: true, data: content });
    });
});

// Endpoint to save or update a formula
app.post('/api/save-formula', async (req, res) => {
    const {
        key, category, subject, topic, sub_topic,
        formula, description, variables, connections, examples,
        verified_by_ai, custom_user
    } = req.body;

    if (!key || !formula) {
        return res.status(400).json({ success: false, error: 'Key and formula are required.' });
    }

    db.get("SELECT id FROM formulas WHERE key = ?", [key], (err, row) => {
        if (err) {
            console.error("Error checking formula existence:", err.message);
            return res.status(500).json({ success: false, error: 'Database error.', dbError: err.message });
        }

        let sql;
        let params;
        const stringifiedVariables = variables ? JSON.stringify(variables) : null;
        const stringifiedConnections = connections ? JSON.stringify(connections) : null;
        const stringifiedExamples = examples ? JSON.stringify(examples) : null;

        if (row) {
            sql = `UPDATE formulas SET
                     category = ?, subject = ?, topic = ?, sub_topic = ?,
                     formula = ?, description = ?, variables = ?, connections = ?, examples = ?,
                     verified_by_ai = ?, custom_user = ?, timestamp = CURRENT_TIMESTAMP
                   WHERE key = ?`;
            params = [
                category, subject, topic, sub_topic,
                formula, description, stringifiedVariables, stringifiedConnections, stringifiedExamples,
                verified_by_ai, custom_user, key
            ];
        } else {
            sql = `INSERT INTO formulas (
                     key, category, subject, topic, sub_topic,
                     formula, description, variables, connections, examples,
                     verified_by_ai, custom_user
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            params = [
                key, category, subject, topic, sub_topic,
                formula, description, stringifiedVariables, stringifiedConnections, stringifiedExamples,
                verified_by_ai, custom_user
            ];
        }

        db.run(sql, params, function(insertErr) {
            if (insertErr) {
                console.error("Error saving/updating formula:", insertErr.message);
                return res.status(500).json({ success: false, error: 'Failed to save formula.', dbError: insertErr.message });
            }
            console.log(`Formula '${key}' saved/updated. ID: ${row ? row.id : this.lastID}`);
            res.json({ success: true, message: 'Formula saved successfully.', id: row ? row.id : this.lastID });
        });
    });
});

// Endpoint to get all formulas
app.get('/api/get-formulas', (req, res) => {
    db.all("SELECT * FROM formulas ORDER BY key ASC", [], (err, rows) => {
        if (err) {
            console.error("Error retrieving formulas:", err.message);
            return res.status(500).json({ success: false, error: 'Failed to retrieve formulas.', dbError: err.message });
        }
        const formulas = rows.map(row => ({
            ...row,
            variables: row.variables ? JSON.parse(row.variables) : [],
            connections: row.connections ? JSON.parse(row.connections) : [],
            examples: row.examples ? JSON.parse(row.examples) : []
        }));
        res.json({ success: true, formulas: formulas });
    });
});

// Endpoint to save a new problem
app.post('/api/save-problem', (req, res) => {
    const { text, answer, formulaKeys, difficulty, subject, topic, analysis, hint, custom_user } = req.body;

    if (!text || !answer) {
        return res.status(400).json({ success: false, error: 'Problem text and answer are required.' });
    }

    const stringifiedFormulaKeys = formulaKeys ? JSON.stringify(formulaKeys) : null;

    const stmt = db.prepare(`INSERT INTO problems (
        text, answer, formulaKeys, difficulty, subject, topic, analysis, hint, custom_user
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(text, answer, stringifiedFormulaKeys, difficulty, subject, topic, analysis, hint, custom_user, function(err) {
        if (err) {
            console.error("Error saving problem:", err.message);
            return res.status(500).json({ success: false, error: 'Failed to save problem.', dbError: err.message });
        }
        console.log(`Problem saved with ID: ${this.lastID}`);
        res.json({ success: true, message: 'Problem saved successfully.', id: this.lastID });
    });
    stmt.finalize();
});

// Endpoint to get all problems
app.get('/api/get-problems', (req, res) => {
    db.all("SELECT * FROM problems ORDER BY timestamp DESC", [], (err, rows) => {
        if (err) {
            console.error("Error retrieving problems:", err.message);
            return res.status(500).json({ success: false, error: 'Failed to retrieve problems.', dbError: err.message });
        }
        const problems = rows.map(row => ({
            ...row,
            formulaKeys: row.formulaKeys ? JSON.parse(row.formulaKeys) : []
        }));
        res.json({ success: true, problems: problems });
    });
});


// =====================================================================
// --- 5. Start the Server ---
// This should be the last thing in your file.
// =====================================================================
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
