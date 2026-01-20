/**
 * expressBookReviews - Main Router Configuration
 * 
 * This file defines the public routes for the book review application.
 * It includes endpoints for user registration, book retrieval by various
 * criteria (ISBN, author, title), and asynchronous versions of these operations.
 * 
 * Key Features:
 * - User registration with validation
 * - Synchronous and asynchronous book search
 * - Comprehensive error handling with edge case coverage
 * - Input validation middleware
 * - Rate limiting for async endpoints
 */

const express = require('express');
const axios = require('axios');
let books = require("./booksdb.js");
let isValid = require("./auth_users.js").isValid;
let users = require("./auth_users.js").users;
const public_users = express.Router();

// Configuration: Server URL for async requests
// Uses environment variables for flexibility, defaults to localhost:5000
const URL = `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 5000}`;

/**
 * ============================================
 * INPUT VALIDATION MIDDLEWARE FUNCTIONS
 * ============================================
 * These middleware functions validate input before processing requests.
 * They prevent malformed data from reaching the main route handlers.
 */

/**
 * Validates user registration data
 * Checks for required fields, data types, and minimum length requirements
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const validateRegistration = (req, res, next) => {
    try {
        const { username, password } = req.body;
        
        // EDGE CASE: Check if body is empty or undefined
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ 
                error: "Empty request body",
                message: "Request body cannot be empty"
            });
        }
        
        // Check for missing required fields
        if (username === undefined || password === undefined) {
            return res.status(400).json({ 
                error: "Missing required fields",
                message: "Both username and password are required"
            });
        }
        
        // Validate data types
        if (typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ 
                error: "Invalid data type",
                message: "Username and password must be strings"
            });
        }
        
        // Trim and validate username
        const trimmedUsername = username.trim();
        if (trimmedUsername.length === 0) {
            return res.status(400).json({ 
                error: "Invalid username",
                message: "Username cannot be empty or whitespace only"
            });
        }
        
        if (trimmedUsername.length < 3) {
            return res.status(400).json({ 
                error: "Invalid username",
                message: "Username must be at least 3 characters long"
            });
        }
        
        // EDGE CASE: Check for excessive username length
        if (trimmedUsername.length > 50) {
            return res.status(400).json({ 
                error: "Invalid username",
                message: "Username must be less than 50 characters"
            });
        }
        
        // Validate password strength
        if (password.length < 6) {
            return res.status(400).json({ 
                error: "Weak password",
                message: "Password must be at least 6 characters long"
            });
        }
        
        // EDGE CASE: Check for common insecure passwords (basic check)
        const commonPasswords = ['password', '123456', 'qwerty', 'letmein', 'welcome'];
        if (commonPasswords.includes(password.toLowerCase())) {
            return res.status(400).json({ 
                error: "Insecure password",
                message: "Please choose a stronger password"
            });
        }
        
        // EDGE CASE: Check for SQL injection patterns (basic)
        const sqlInjectionPatterns = [';', '--', '/*', '*/', 'xp_'];
        for (const pattern of sqlInjectionPatterns) {
            if (trimmedUsername.includes(pattern) || password.includes(pattern)) {
                return res.status(400).json({ 
                    error: "Invalid input",
                    message: "Input contains potentially harmful characters"
                });
            }
        }
        
        // Attach trimmed username to request for use in route handler
        req.trimmedUsername = trimmedUsername;
        next();
    } catch (error) {
        console.error('Validation middleware error:', error);
        res.status(500).json({ 
            error: "Validation error",
            message: "An error occurred during input validation"
        });
    }
};

/**
 * Validates ISBN parameter from route
 * Ensures ISBN is provided and follows basic ISBN format rules
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const validateIsbn = (req, res, next) => {
    try {
        const isbn = req.params.isbn;
        
        // EDGE CASE: Check if ISBN parameter is missing
        if (isbn === undefined) {
            return res.status(400).json({ 
                error: "Missing ISBN parameter",
                message: "ISBN parameter is required in the URL"
            });
        }
        
        // Convert to string if it's a number
        const isbnStr = String(isbn).trim();
        
        // EDGE CASE: Check for empty string after trimming
        if (isbnStr === '') {
            return res.status(400).json({ 
                error: "Empty ISBN",
                message: "ISBN cannot be empty or whitespace only"
            });
        }
        
        // EDGE CASE: Check for reasonable ISBN length
        // ISBN-10: 10 digits, ISBN-13: 13 digits, allow for dashes
        if (isbnStr.length > 17) { // ISBN-13 with dashes can be up to 17 chars
            return res.status(400).json({ 
                error: "Invalid ISBN length",
                message: "ISBN is too long"
            });
        }
        
        // Basic ISBN format validation (allowing digits and dashes)
        if (!/^[0-9\-]+$/.test(isbnStr)) {
            return res.status(400).json({ 
                error: "Invalid ISBN format",
                message: "ISBN must contain only digits and hyphens"
            });
        }
        
        // Attach cleaned ISBN to request
        req.cleanedIsbn = isbnStr;
        next();
    } catch (error) {
        console.error('ISBN validation error:', error);
        res.status(500).json({ 
            error: "Validation error",
            message: "An error occurred during ISBN validation"
        });
    }
};

/**
 * Validates search parameters (author or title)
 * Checks for presence, type, and reasonable length of search terms
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const validateSearchParams = (req, res, next) => {
    try {
        // Determine which parameter we're validating (author or title)
        const paramName = req.params.author ? 'author' : 'title';
        const param = req.params[paramName];
        
        // EDGE CASE: Check if parameter is missing
        if (param === undefined) {
            return res.status(400).json({ 
                error: "Missing search parameter",
                message: `${paramName} parameter is required in the URL`
            });
        }
        
        // Convert to string if it's a number
        const paramStr = String(param).trim();
        
        // EDGE CASE: Check for empty string after trimming
        if (paramStr === '') {
            return res.status(400).json({ 
                error: "Empty search term",
                message: `${paramName} cannot be empty or whitespace only`
            });
        }
        
        // EDGE CASE: Check for minimum search term length
        if (paramStr.length < 2) {
            return res.status(400).json({ 
                error: "Search term too short",
                message: `${paramName} must be at least 2 characters long`
            });
        }
        
        // Prevent extremely long search terms (DoS protection)
        if (paramStr.length > 100) {
            return res.status(400).json({ 
                error: "Search term too long",
                message: `${paramName} must be less than 100 characters`
            });
        }
        
        // EDGE CASE: Check for potentially malicious patterns
        const maliciousPatterns = ['<script>', 'javascript:', 'onload=', 'onerror='];
        const lowerParam = paramStr.toLowerCase();
        for (const pattern of maliciousPatterns) {
            if (lowerParam.includes(pattern)) {
                return res.status(400).json({ 
                    error: "Invalid search term",
                    message: "Search term contains potentially harmful content"
                });
            }
        }
        
        // Attach cleaned parameter to request
        req.cleanedParam = paramStr;
        req.paramName = paramName;
        next();
    } catch (error) {
        console.error('Search parameter validation error:', error);
        res.status(500).json({ 
            error: "Validation error",
            message: "An error occurred during search parameter validation"
        });
    }
};

/**
 * ============================================
 * USER REGISTRATION ENDPOINT
 * ============================================
 * Registers new users with validation and duplicate checking
 */
public_users.post("/register", validateRegistration, (req, res) => {
    try {
        const { password } = req.body;
        const trimmedUsername = req.trimmedUsername;
        
        // EDGE CASE: Check if users array exists and is valid
        if (!Array.isArray(users)) {
            console.error('Users array is not properly initialized');
            return res.status(500).json({ 
                error: "Server configuration error",
                message: "User database is not available"
            });
        }
        
        // Check for duplicate username (case-insensitive comparison)
        const userExists = users.some(u => 
            u.username && u.username.toLowerCase() === trimmedUsername.toLowerCase()
        );
        
        if (userExists) {
            return res.status(409).json({ 
                error: "Username already exists",
                message: `Username '${trimmedUsername}' is already taken`,
                suggestion: "Please choose a different username"
            });
        }
        
        // EDGE CASE: Check maximum users limit (prevent memory exhaustion)
        const MAX_USERS = 10000;
        if (users.length >= MAX_USERS) {
            return res.status(503).json({ 
                error: "Service temporarily unavailable",
                message: "User registration is currently at capacity"
            });
        }
        
        // Add new user to the users array
        // NOTE: In production, password should be hashed before storing!
        users.push({
            "username": trimmedUsername,
            "password": password,
            "createdAt": new Date().toISOString() // Track registration time
        });
        
        // Log successful registration (in production, use structured logging)
        console.log(`New user registered: ${trimmedUsername} at ${new Date().toISOString()}`);
        
        // Return success response with 201 Created status
        res.status(201).json({ 
            message: "User registered successfully",
            username: trimmedUsername,
            registeredAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        
        // EDGE CASE: Handle specific database/array errors
        if (error instanceof TypeError && error.message.includes('users.push')) {
            return res.status(500).json({ 
                error: "Database error",
                message: "Failed to save user data"
            });
        }
        
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to register user. Please try again later.",
            requestId: Date.now().toString(36)
        });
    }
});

/**
 * ============================================
 * SYNCHRONOUS BOOK RETRIEVAL ENDPOINTS
 * ============================================
 * These endpoints directly query the in-memory books database
 */

/**
 * GET / - Retrieve all books in the shop
 */
public_users.get('/', function (req, res) {
    try {
        // EDGE CASE: Check if books database is loaded
        if (!books || typeof books !== 'object') {
            console.error('Books database is not properly loaded');
            return res.status(503).json({ 
                error: "Service unavailable",
                message: "Book database is not available. Please try again later."
            });
        }
        
        const bookCount = Object.keys(books).length;
        
        // EDGE CASE: Handle empty bookstore
        if (bookCount === 0) {
            return res.status(200).json({ 
                message: "The bookstore is currently empty",
                count: 0,
                books: {}
            });
        }
        
        // EDGE CASE: Check for circular references or deep nesting
        try {
            // Test if books can be serialized to JSON
            JSON.stringify(books);
        } catch (serializeError) {
            console.error('Books data contains circular references:', serializeError);
            return res.status(500).json({ 
                error: "Data serialization error",
                message: "Unable to process book data"
            });
        }
        
        // Return all books with count
        return res.status(200).json({
            count: bookCount,
            books: books,
            retrievedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error retrieving book list:', error);
        
        // EDGE CASE: Handle specific error types
        if (error instanceof RangeError && error.message.includes('Maximum call stack')) {
            return res.status(500).json({ 
                error: "Data processing error",
                message: "Book data is too large or complex to process"
            });
        }
        
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to retrieve book list. Please try again later.",
            requestId: Date.now().toString(36)
        });
    }
});

/**
 * GET /isbn/:isbn - Retrieve book details by ISBN
 */
public_users.get('/isbn/:isbn', validateIsbn, function (req, res) {
    try {
        const isbn = req.cleanedIsbn;
        
        // EDGE CASE: Check if books database exists
        if (!books || typeof books !== 'object') {
            return res.status(503).json({ 
                error: "Service unavailable",
                message: "Book database is not available"
            });
        }
        
        // Try to find book by ISBN (handle both with and without dashes)
        let book = books[isbn];
        
        // EDGE CASE: Try alternative ISBN formats (without dashes)
        if (!book) {
            const isbnWithoutDashes = isbn.replace(/-/g, '');
            book = books[isbnWithoutDashes];
        }
        
        // EDGE CASE: Check if book exists with the given ISBN
        if (!book) {
            // Provide suggestions for similar ISBNs
            const similarIsbns = Object.keys(books).filter(key => 
                key.includes(isbn.replace(/-/g, '').substring(0, 5))
            ).slice(0, 3);
            
            const response = { 
                error: "Book not found",
                message: `No book found with ISBN: ${isbn}`,
                suggestion: "Check the ISBN or browse all books at /"
            };
            
            if (similarIsbns.length > 0) {
                response.similarBooks = similarIsbns.map(isbn => ({
                    isbn: isbn,
                    title: books[isbn]?.title || 'Unknown Title'
                }));
            }
            
            return res.status(404).json(response);
        }
        
        // EDGE CASE: Check if book data is valid
        if (typeof book !== 'object' || book === null) {
            console.error(`Invalid book data for ISBN ${isbn}:`, book);
            return res.status(500).json({ 
                error: "Data integrity error",
                message: "Book data is corrupted"
            });
        }
        
        // Return book data with ISBN included in response
        return res.status(200).json({
            isbn: isbn,
            ...book,
            retrievedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error(`Error retrieving book with ISBN ${req.params.isbn}:`, error);
        
        // EDGE CASE: Handle specific ISBN-related errors
        if (error.message && error.message.includes('ISBN')) {
            return res.status(400).json({ 
                error: "ISBN processing error",
                message: "Failed to process ISBN parameter"
            });
        }
        
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to retrieve book details. Please try again later.",
            requestId: Date.now().toString(36)
        });
    }
});

/**
 * GET /author/:author - Retrieve books by author
 */
public_users.get('/author/:author', validateSearchParams, function (req, res) {
    try {
        const author = req.cleanedParam.toLowerCase();
        
        // EDGE CASE: Check if books database exists
        if (!books || typeof books !== 'object') {
            return res.status(503).json({ 
                error: "Service unavailable",
                message: "Book database is not available"
            });
        }
        
        let filteredBooks = [];
        let exactMatches = [];
        let partialMatches = [];
        
        // Iterate through all books to find matches
        for (const key in books) {
            const book = books[key];
            
            // EDGE CASE: Skip invalid book entries
            if (!book || typeof book !== 'object' || !book.author) {
                console.warn(`Skipping invalid book entry for key: ${key}`);
                continue;
            }
            
            const bookAuth = book.author.toLowerCase();
            
            // Check for exact match (case-insensitive)
            if (bookAuth === author) {
                exactMatches.push({
                    isbn: key,
                    matchType: 'exact',
                    ...book
                });
            }
            // Check for partial match (author name contains search term)
            else if (bookAuth.includes(author)) {
                partialMatches.push({
                    isbn: key,
                    matchType: 'partial',
                    ...book
                });
            }
        }
        
        // Combine exact matches first, then partial matches
        filteredBooks = [...exactMatches, ...partialMatches];
        
        // EDGE CASE: Handle case where no books are found
        if (filteredBooks.length === 0) {
            // Provide suggestions based on similar author names
            const allAuthors = new Set();
            for (const key in books) {
                if (books[key]?.author) {
                    allAuthors.add(books[key].author.toLowerCase());
                }
            }
            
            // Find similar author names (Levenshtein distance would be better here)
            const similarAuthors = Array.from(allAuthors).filter(a => 
                a.includes(author.substring(0, Math.max(3, Math.floor(author.length / 2))))
            ).slice(0, 5);
            
            const response = { 
                error: "No books found",
                message: `No books found by author: ${req.cleanedParam}`,
                suggestion: "Try a different spelling or browse all books at /"
            };
            
            if (similarAuthors.length > 0) {
                response.suggestedAuthors = similarAuthors;
            }
            
            return res.status(404).json(response);
        }
        
        // EDGE CASE: Handle very large result sets
        const MAX_RESULTS = 1000;
        if (filteredBooks.length > MAX_RESULTS) {
            console.warn(`Large result set for author search: ${filteredBooks.length} results`);
            filteredBooks = filteredBooks.slice(0, MAX_RESULTS);
        }
        
        // Return matching books with metadata
        return res.status(200).json({
            count: filteredBooks.length,
            exactMatches: exactMatches.length,
            partialMatches: partialMatches.length,
            searchTerm: req.cleanedParam,
            searchType: 'author',
            books: filteredBooks,
            retrievedAt: new Date().toISOString(),
            ...(filteredBooks.length > MAX_RESULTS && {
                warning: `Displaying first ${MAX_RESULTS} of ${filteredBooks.length} results`
            })
        });
    } catch (error) {
        console.error(`Error searching books by author ${req.cleanedParam}:`, error);
        
        // EDGE CASE: Handle memory errors for large datasets
        if (error instanceof Error && error.message.includes('heap') || error.message.includes('memory')) {
            return res.status(500).json({ 
                error: "Memory limit exceeded",
                message: "Search returned too many results. Please refine your search."
            });
        }
        
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to search books. Please try again later.",
            requestId: Date.now().toString(36)
        });
    }
});

/**
 * GET /title/:title - Retrieve books by title
 */
public_users.get('/title/:title', validateSearchParams, function (req, res) {
    try {
        const title = req.cleanedParam.toLowerCase();
        
        // EDGE CASE: Check if books database exists
        if (!books || typeof books !== 'object') {
            return res.status(503).json({ 
                error: "Service unavailable",
                message: "Book database is not available"
            });
        }
        
        let filteredBooks = [];
        
        // Iterate through all books to find matches
        for (const key in books) {
            const book = books[key];
            
            // EDGE CASE: Skip invalid book entries
            if (!book || typeof book !== 'object' || !book.title) {
                console.warn(`Skipping invalid book entry for key: ${key}`);
                continue;
            }
            
            const bookTitle = book.title.toLowerCase();
            
            // Check for match (title contains search term)
            if (bookTitle.includes(title)) {
                // Calculate relevance score based on match position
                const position = bookTitle.indexOf(title);
                const relevanceScore = position === 0 ? 100 : 100 - position;
                
                filteredBooks.push({
                    isbn: key,
                    relevance: relevanceScore,
                    ...book
                });
            }
        }
        
        // Sort by relevance score (higher first)
        filteredBooks.sort((a, b) => b.relevance - a.relevance);
        
        // EDGE CASE: Handle case where no books are found
        if (filteredBooks.length === 0) {
            return res.status(404).json({ 
                error: "No books found",
                message: `No books found with title containing: ${req.cleanedParam}`,
                suggestion: "Try a different search term or browse all books at /"
            });
        }
        
        // EDGE CASE: Handle very large result sets
        const MAX_RESULTS = 1000;
        if (filteredBooks.length > MAX_RESULTS) {
            console.warn(`Large result set for title search: ${filteredBooks.length} results`);
            filteredBooks = filteredBooks.slice(0, MAX_RESULTS);
        }
        
        // Return matching books with metadata
        return res.status(200).json({
            count: filteredBooks.length,
            searchTerm: req.cleanedParam,
            searchType: 'title',
            books: filteredBooks,
            retrievedAt: new Date().toISOString(),
            ...(filteredBooks.length > MAX_RESULTS && {
                warning: `Displaying first ${MAX_RESULTS} of ${filteredBooks.length} results`
            })
        });
    } catch (error) {
        console.error(`Error searching books by title ${req.cleanedParam}:`, error);
        
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to search books. Please try again later.",
            requestId: Date.now().toString(36)
        });
    }
});

/**
 * GET /review/:isbn - Retrieve reviews for a specific book
 */
public_users.get('/review/:isbn', validateIsbn, function (req, res) {
    try {
        const isbn = req.cleanedIsbn;
        const book = books[isbn];
        
        // Check if book exists
        if (!book) {
            return res.status(404).json({ 
                error: "Book not found",
                message: `No book found with ISBN: ${isbn}`
            });
        }
        
        // EDGE CASE: Check if book has reviews property
        if (!book.reviews) {
            return res.status(200).json({
                isbn: isbn,
                title: book.title || 'Unknown Title',
                message: "This book has no reviews yet",
                reviewCount: 0,
                reviews: {},
                suggestion: "Be the first to add a review!"
            });
        }
        
        // EDGE CASE: Check if reviews is a valid object
        if (typeof book.reviews !== 'object' || book.reviews === null) {
            console.error(`Invalid reviews data for ISBN ${isbn}:`, book.reviews);
            return res.status(500).json({ 
                error: "Data integrity error",
                message: "Review data is corrupted"
            });
        }
        
        const reviewCount = Object.keys(book.reviews).length;
        
        // EDGE CASE: Handle empty reviews object
        if (reviewCount === 0) {
            return res.status(200).json({
                isbn: isbn,
                title: book.title || 'Unknown Title',
                message: "This book has no reviews yet",
                reviewCount: 0,
                reviews: {},
                suggestion: "Be the first to add a review!"
            });
        }
        
        // Return reviews with book metadata
        return res.status(200).json({
            isbn: isbn,
            title: book.title || 'Unknown Title',
            reviewCount: reviewCount,
            reviews: book.reviews,
            retrievedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error(`Error retrieving reviews for ISBN ${req.params.isbn}:`, error);
        
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to retrieve reviews. Please try again later.",
            requestId: Date.now().toString(36)
        });
    }
});

/**
 * ============================================
 * ASYNCHRONOUS HELPER FUNCTION
 * ============================================
 * Makes HTTP requests to the same server's synchronous endpoints
 * This demonstrates the async/await pattern with Axios with comprehensive error handling
 */

/**
 * Asynchronously fetches data from the server's endpoints
 * @param {string} queryString - The endpoint path to query
 * @returns {Promise<Object>} - The response data
 */
async function getBookListAsync(queryString) {
    // EDGE CASE: Validate queryString
    if (!queryString || typeof queryString !== 'string') {
        throw new Error('Invalid query string provided');
    }
    
    // EDGE CASE: Prevent excessively long query strings
    if (queryString.length > 500) {
        throw new Error('Query string is too long');
    }
    
    try {
        const response = await axios.get(URL + queryString, {
            timeout: 10000, // 10 second timeout
            maxRedirects: 3, // Prevent infinite redirects
            maxContentLength: 50 * 1024 * 1024, // 50MB max response size
            validateStatus: function (status) {
                // Accept both successful (2xx) and client error (4xx) responses
                return status >= 200 && status < 500;
            },
            headers: {
                'User-Agent': 'expressBookReviews/1.0',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        // EDGE CASE: Check for empty response
        if (!response.data) {
            throw new Error('Empty response received from server');
        }
        
        // EDGE CASE: Check for very large response
        const responseSize = JSON.stringify(response.data).length;
        if (responseSize > 10 * 1024 * 1024) { // 10MB
            console.warn(`Large response received: ${responseSize} bytes`);
        }
        
        // Check for client error responses (4xx)
        if (response.status >= 400) {
            const error = new Error(`HTTP ${response.status}: ${response.data?.error || 'Request failed'}`);
            error.status = response.status;
            error.data = response.data;
            error.isHttpError = true;
            throw error;
        }
        
        return response.data;
    } catch (error) {
        console.error('Error in getBookListAsync:', error.message);
        
        // Enhance error messages for common network issues
        if (error.code === 'ECONNREFUSED') {
            error.message = 'Unable to connect to the server. The service might be down.';
            error.isConnectionError = true;
        } else if (error.code === 'ETIMEDOUT') {
            error.message = 'Request timed out after 10 seconds. The server might be overloaded.';
            error.isTimeoutError = true;
        } else if (error.code === 'ENOTFOUND') {
            error.message = 'Server host not found. Please check the server configuration.';
            error.isDnsError = true;
        } else if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            error.isHttpError = true;
            error.status = error.response.status;
            error.data = error.response.data;
        } else if (error.request) {
            // The request was made but no response was received
            error.message = 'No response received from server';
            error.isNetworkError = true;
        }
        
        // Add context to error
        error.context = {
            url: URL + queryString,
            timestamp: new Date().toISOString(),
            query: queryString
        };
        
        throw error;
    }
}

/**
 * ============================================
 * RATE LIMITING FOR ASYNC ENDPOINTS
 * ============================================
 * Enhanced rate limiting with cleanup mechanism
 */

const asyncRequestCounts = new Map();
const ASYNC_RATE_LIMIT = 100; // Maximum requests per minute per IP
const RATE_LIMIT_WINDOW = 60000; // 1 minute in milliseconds

// Cleanup old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW;
    
    for (const [ip, requests] of asyncRequestCounts.entries()) {
        const filteredRequests = requests.filter(time => time > cutoff);
        if (filteredRequests.length === 0) {
            asyncRequestCounts.delete(ip);
        } else {
            asyncRequestCounts.set(ip, filteredRequests);
        }
    }
}, 5 * 60000); // 5 minutes

/**
 * Rate limiting middleware for async endpoints
 */
const checkRateLimit = (req, res, next) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();
        const cutoff = now - RATE_LIMIT_WINDOW;
        
        // Get existing requests for this IP
        let requests = asyncRequestCounts.get(clientIP) || [];
        
        // Filter out old requests
        requests = requests.filter(time => time > cutoff);
        
        // Check if rate limit is exceeded
        if (requests.length >= ASYNC_RATE_LIMIT) {
            // Calculate when the user can try again
            const oldestRequest = Math.min(...requests);
            const retryAfter = Math.ceil((oldestRequest + RATE_LIMIT_WINDOW - now) / 1000);
            
            return res.status(429).set('Retry-After', retryAfter).json({
                error: "Too many requests",
                message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
                limit: ASYNC_RATE_LIMIT,
                window: "1 minute",
                retryAfter: retryAfter
            });
        }
        
        // Add current request timestamp and update map
        requests.push(now);
        asyncRequestCounts.set(clientIP, requests);
        
        // Add rate limit headers to response
        res.set({
            'X-RateLimit-Limit': ASYNC_RATE_LIMIT,
            'X-RateLimit-Remaining': ASYNC_RATE_LIMIT - requests.length,
            'X-RateLimit-Reset': Math.ceil((now + RATE_LIMIT_WINDOW) / 1000)
        });
        
        next();
    } catch (error) {
        console.error('Rate limiting error:', error);
        // If rate limiting fails, allow the request to proceed
        next();
    }
};

/**
 * ============================================
 * ASYNCHRONOUS BOOK RETRIEVAL ENDPOINTS
 * ============================================
 * Enhanced with comprehensive error handling and edge case coverage
 */

/**
 * GET /async - Asynchronously retrieve all books
 */
public_users.get('/async', checkRateLimit, async function (req, res) {
    try {
        const bookList = await getBookListAsync("");
        
        // EDGE CASE: Validate response structure
        if (!bookList || typeof bookList !== 'object') {
            throw new Error('Invalid response format received from server');
        }
        
        res.status(200).json({
            ...bookList,
            retrievedVia: 'async',
            serverTimestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in /async route:', error);
        
        // Handle different error types with appropriate responses
        if (error.isConnectionError || error.isTimeoutError) {
            return res.status(503).json({ 
                error: "Service unavailable",
                message: error.message,
                suggestion: "Please try again in a few moments"
            });
        }
        
        if (error.isHttpError && error.status) {
            return res.status(error.status).json({
                ...error.data,
                retrievedVia: 'async',
                errorOccurred: true
            });
        }
        
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to retrieve book list. Please try again later.",
            requestId: Date.now().toString(36),
            retrievedVia: 'async'
        });
    }
});

/**
 * GET /async/isbn/:isbn - Asynchronously retrieve book by ISBN
 */
public_users.get('/async/isbn/:isbn', checkRateLimit, validateIsbn, async function (req, res) {
    try {
        const isbn = req.cleanedIsbn;
        const encodedIsbn = encodeURIComponent(isbn);
        const book = await getBookListAsync("/isbn/" + encodedIsbn);
        
        // EDGE CASE: Check if book data is valid
        if (!book || typeof book !== 'object') {
            throw new Error('Invalid book data received');
        }
        
        res.status(200).json({
            ...book,
            retrievedVia: 'async',
            serverTimestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`Error in /async/isbn/${req.cleanedIsbn}:`, error);
        
        if (error.isHttpError && error.status === 404) {
            return res.status(404).json({
                error: "Book not found",
                message: `No book found with ISBN: ${req.cleanedIsbn}`,
                retrievedVia: 'async',
                suggestion: "Check the ISBN or try the synchronous endpoint"
            });
        }
        
        if (error.isConnectionError) {
            return res.status(503).json({ 
                error: "Service unavailable",
                message: "Cannot connect to book database",
                retrievedVia: 'async'
            });
        }
        
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to retrieve book by ISBN. Please try again later.",
            requestId: Date.now().toString(36),
            retrievedVia: 'async'
        });
    }
});

/**
 * GET /async/author/:author - Asynchronously retrieve books by author
 * 
 * This endpoint demonstrates robust async/await pattern with Axios,
 * handling various edge cases and providing comprehensive error responses.
 */
public_users.get('/async/author/:author', checkRateLimit, validateSearchParams, async function (req, res) {
    try {
        const author = req.cleanedParam;
        const encodedAuthor = encodeURIComponent(author);
        
        // EDGE CASE: Check for special characters that might cause issues
        if (encodedAuthor.length > 200) {
            return res.status(400).json({
                error: "Invalid author name",
                message: "Author name is too long or contains too many special characters",
                retrievedVia: 'async'
            });
        }
        
        // Make asynchronous HTTP request to the synchronous author endpoint
        const books = await getBookListAsync("/author/" + encodedAuthor);
        
        // EDGE CASE: Validate response structure
        if (!books || typeof books !== 'object') {
            throw new Error('Invalid response received from server');
        }
