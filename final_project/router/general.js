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
 * - Comprehensive error handling
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
    const { username, password } = req.body;
    
    // Check for missing required fields
    if (!username || !password) {
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
    
    // Validate username length
    if (username.trim().length < 3) {
        return res.status(400).json({ 
            error: "Invalid username",
            message: "Username must be at least 3 characters long"
        });
    }
    
    // Validate password strength
    if (password.length < 6) {
        return res.status(400).json({ 
            error: "Weak password",
            message: "Password must be at least 6 characters long"
        });
    }
    
    next();
};

/**
 * Validates ISBN parameter from route
 * Ensures ISBN is provided and is a string
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const validateIsbn = (req, res, next) => {
    const isbn = req.params.isbn;
    
    // Check if ISBN is provided
    if (!isbn || isbn.trim() === '') {
        return res.status(400).json({ 
            error: "Missing ISBN",
            message: "ISBN parameter is required"
        });
    }
    
    // Validate ISBN format
    if (typeof isbn !== 'string') {
        return res.status(400).json({ 
            error: "Invalid ISBN format",
            message: "ISBN must be a string"
        });
    }
    
    next();
};

/**
 * Validates search parameters (author or title)
 * Checks for presence, type, and reasonable length of search terms
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const validateSearchParams = (req, res, next) => {
    // Determine which parameter we're validating (author or title)
    const param = req.params.author || req.params.title;
    const paramName = req.params.author ? 'author' : 'title';
    
    // Check if search parameter is provided
    if (!param || param.trim() === '') {
        return res.status(400).json({ 
            error: "Missing search parameter",
            message: `${paramName} parameter is required`
        });
    }
    
    // Validate parameter type
    if (typeof param !== 'string') {
        return res.status(400).json({ 
            error: "Invalid search parameter",
            message: "Search parameter must be a string"
        });
    }
    
    // Prevent extremely long search terms (DoS protection)
    if (param.length > 100) {
        return res.status(400).json({ 
            error: "Search term too long",
            message: "Search term must be less than 100 characters"
        });
    }
    
    next();
};

/**
 * ============================================
 * USER REGISTRATION ENDPOINT
 * ============================================
 * Registers new users with validation and duplicate checking
 * Response Structure on Success:
 * {
 *   message: "User registered successfully",
 *   username: "registeredUsername"
 * }
 */
public_users.post("/register", validateRegistration, (req, res) => {
    try {
        const { username, password } = req.body;
        const trimmedUsername = username.trim();
        
        // Check for duplicate username (case-insensitive comparison)
        const userExists = users.some(u => u.username.toLowerCase() === trimmedUsername.toLowerCase());
        if (userExists) {
            return res.status(409).json({ 
                error: "Username already exists",
                message: `Username '${trimmedUsername}' is already taken`
            });
        }
        
        // Add new user to the users array
        users.push({
            "username": trimmedUsername,
            "password": password // Note: In production, this should be hashed!
        });
        
        // Log successful registration
        console.log(`New user registered: ${trimmedUsername}`);
        
        // Return success response with 201 Created status
        res.status(201).json({ 
            message: "User registered successfully",
            username: trimmedUsername
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to register user. Please try again later."
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
 * Response Structure:
 * {
 *   count: number,
 *   books: { isbn1: {bookData}, isbn2: {bookData}, ... }
 * }
 */
public_users.get('/', function (req, res) {
    try {
        // Check if books database is empty
        if (!books || Object.keys(books).length === 0) {
            return res.status(404).json({ 
                error: "No books available",
                message: "The bookstore is currently empty"
            });
        }
        
        // Return all books with count
        return res.status(200).json({
            count: Object.keys(books).length,
            books: books
        });
    } catch (error) {
        console.error('Error retrieving book list:', error);
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to retrieve book list. Please try again later."
        });
    }
});

/**
 * GET /isbn/:isbn - Retrieve book details by ISBN
 * 
 * Filtering Process:
 * 1. Extract ISBN from route parameters
 * 2. Directly access book by ISBN key in the books object
 * 3. Return book data if found, 404 if not found
 * 
 * Response Structure on Success:
 * {
 *   isbn: "providedISBN",
 *   title: "Book Title",
 *   author: "Book Author",
 *   ...other book properties
 * }
 */
public_users.get('/isbn/:isbn', validateIsbn, function (req, res) {
    try {
        const isbn = req.params.isbn.trim();
        const book = books[isbn];
        
        // Check if book exists with the given ISBN
        if (!book) {
            return res.status(404).json({ 
                error: "Book not found",
                message: `No book found with ISBN: ${isbn}`,
                suggestion: "Check the ISBN or browse all books at /"
            });
        }
        
        // Return book data with ISBN included in response
        return res.status(200).json({
            isbn: isbn,
            ...book
        });
    } catch (error) {
        console.error(`Error retrieving book with ISBN ${req.params.isbn}:`, error);
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to retrieve book details. Please try again later."
        });
    }
});

/**
 * GET /author/:author - Retrieve books by author
 * 
 * Filtering Process:
 * 1. Extract author parameter from route and convert to lowercase for case-insensitive search
 * 2. Iterate through all books in the database
 * 3. For each book, convert author name to lowercase
 * 4. Use String.includes() to perform partial matching
 * 5. Collect matching books in an array with ISBN included
 * 
 * Response Structure on Success:
 * {
 *   count: number,
 *   searchTerm: "originalSearchTerm",
 *   books: [
 *     {
 *       isbn: "bookISBN",
 *       title: "Book Title",
 *       author: "Book Author",
 *       ...other properties
 *     },
 *     ...more matching books
 *   ]
 * }
 */
public_users.get('/author/:author', validateSearchParams, function (req, res) {
    try {
        const author = req.params.author.toLowerCase().trim();
        
        // Edge case: empty search after trimming
        if (author === '') {
            return res.status(400).json({ 
                error: "Invalid author name",
                message: "Author name cannot be empty"
            });
        }

        let filteredBooks = [];
        
        // Iterate through all books to find matches
        for (const key in books) {
            let bookAuth = books[key].author.toLowerCase();
            
            // Partial match: check if search term is included in book's author
            if (bookAuth.includes(author)) {
                filteredBooks.push({
                    isbn: key, // Include ISBN for reference
                    ...books[key] // Spread all book properties
                });
            }
        }
        
        // Handle case where no books are found
        if (filteredBooks.length === 0) {
            return res.status(404).json({ 
                error: "No books found",
                message: `No books found by author: ${req.params.author}`,
                suggestion: "Try a different spelling or browse all books at /"
            });
        }
        
        // Return matching books with metadata
        return res.status(200).json({
            count: filteredBooks.length,
            searchTerm: req.params.author, // Return original (non-lowercased) term
            books: filteredBooks
        });
    } catch (error) {
        console.error(`Error searching books by author ${req.params.author}:`, error);
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to search books. Please try again later."
        });
    }
});

/**
 * GET /title/:title - Retrieve books by title
 * 
 * Filtering Process:
 * 1. Extract title parameter from route and convert to lowercase for case-insensitive search
 * 2. Iterate through all books in the database
 * 3. For each book, convert title to lowercase
 * 4. Use String.includes() to perform partial matching
 * 5. Collect matching books in an array with ISBN included
 * 
 * Response Structure on Success:
 * {
 *   count: number,
 *   searchTerm: "originalSearchTerm",
 *   books: [ {book1}, {book2}, ... ]
 * }
 */
public_users.get('/title/:title', validateSearchParams, function (req, res) {
    try {
        const title = req.params.title.toLowerCase().trim();
        
        // Edge case: empty search after trimming
        if (title === '') {
            return res.status(400).json({ 
                error: "Invalid title",
                message: "Book title cannot be empty"
            });
        }
        
        let filteredBooks = [];
        
        // Iterate through all books to find matches
        for (const key in books) {
            let bookTitle = books[key].title.toLowerCase();
            
            // Partial match: check if search term is included in book's title
            if (bookTitle.includes(title)) {
                filteredBooks.push({
                    isbn: key, // Include ISBN for reference
                    ...books[key] // Spread all book properties
                });
            }
        }
        
        // Handle case where no books are found
        if (filteredBooks.length === 0) {
            return res.status(404).json({ 
                error: "No books found",
                message: `No books found with title: ${req.params.title}`,
                suggestion: "Try a different search term or browse all books at /"
            });
        }
        
        // Return matching books with metadata
        return res.status(200).json({
            count: filteredBooks.length,
            searchTerm: req.params.title, // Return original (non-lowercased) term
            books: filteredBooks
        });
    } catch (error) {
        console.error(`Error searching books by title ${req.params.title}:`, error);
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to search books. Please try again later."
        });
    }
});

/**
 * GET /review/:isbn - Retrieve reviews for a specific book
 * 
 * Response Structure on Success:
 * {
 *   isbn: "bookISBN",
 *   title: "Book Title",
 *   reviewCount: number,
 *   reviews: { reviewer1: "review", reviewer2: "review", ... }
 * }
 */
public_users.get('/review/:isbn', validateIsbn, function (req, res) {
    try {
        const isbn = req.params.isbn.trim();
        const book = books[isbn];
        
        // Check if book exists
        if (!book) {
            return res.status(404).json({ 
                error: "Book not found",
                message: `No book found with ISBN: ${isbn}`
            });
        }
        
        // Check if book has reviews
        if (!book.reviews || Object.keys(book.reviews).length === 0) {
            return res.status(404).json({ 
                error: "No reviews available",
                message: `No reviews found for book: ${book.title}`,
                suggestion: "Be the first to add a review!"
            });
        }
        
        // Return reviews with book metadata
        return res.status(200).json({
            isbn: isbn,
            title: book.title,
            reviewCount: Object.keys(book.reviews).length,
            reviews: book.reviews
        });
    } catch (error) {
        console.error(`Error retrieving reviews for ISBN ${req.params.isbn}:`, error);
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to retrieve reviews. Please try again later."
        });
    }
});

/**
 * ============================================
 * ASYNCHRONOUS HELPER FUNCTION
 * ============================================
 * Makes HTTP requests to the same server's synchronous endpoints
 * This demonstrates the async/await pattern with Axios
 */

/**
 * Asynchronously fetches data from the server's endpoints
 * @param {string} queryString - The endpoint path to query
 * @returns {Promise<Object>} - The response data
 * 
 * Process Flow:
 * 1. Make HTTP GET request with timeout and status validation
 * 2. Check response status - throw error for 4xx/5xx responses
 * 3. Return parsed JSON data on success
 * 4. Handle network errors and timeouts
 */
async function getBookListAsync(queryString) {
    try {
        const response = await axios.get(URL + queryString, {
            timeout: 10000, // 10 second timeout to prevent hanging requests
            validateStatus: function (status) {
                // Accept both successful (2xx) and client error (4xx) responses
                // We want to handle 404s differently than network errors
                return status >= 200 && status < 500;
            }
        });
        
        // Check for client error responses (4xx)
        if (response.status >= 400) {
            const error = new Error(`HTTP ${response.status}: ${response.data?.error || 'Request failed'}`);
            error.status = response.status;
            error.data = response.data;
            throw error;
        }
        
        return response.data;
    } catch (error) {
        console.error('Error in getBookListAsync:', error.message);
        
        // Enhance error messages for common network issues
        if (error.code === 'ECONNREFUSED') {
            error.message = 'Unable to connect to the server';
        } else if (error.code === 'ETIMEDOUT') {
            error.message = 'Request timed out';
        }
        
        throw error; // Re-throw for route handler to catch
    }
}

/**
 * ============================================
 * RATE LIMITING FOR ASYNC ENDPOINTS
 * ============================================
 * Basic in-memory rate limiting to prevent abuse
 * Tracks requests per IP address within a 1-minute window
 */

const asyncRequestCounts = new Map();
const ASYNC_RATE_LIMIT = 100; // Maximum requests per minute per IP

/**
 * Rate limiting middleware for async endpoints
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const checkRateLimit = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Get existing requests for this IP
    let requests = asyncRequestCounts.get(clientIP) || [];
    
    // Filter out old requests (older than 1 minute)
    requests = requests.filter(time => time > oneMinuteAgo);
    
    // Check if rate limit is exceeded
    if (requests.length >= ASYNC_RATE_LIMIT) {
        return res.status(429).json({
            error: "Too many requests",
            message: "Rate limit exceeded. Please try again later."
        });
    }
    
    // Add current request timestamp and update map
    requests.push(now);
    asyncRequestCounts.set(clientIP, requests);
    next();
};

/**
 * ============================================
 * ASYNCHRONOUS BOOK RETRIEVAL ENDPOINTS
 * ============================================
 * These endpoints use async/await to call the synchronous endpoints
 * via HTTP, demonstrating asynchronous programming patterns
 * 
 * Note: These endpoints are essentially wrappers around the synchronous
 * endpoints, useful for demonstrating async patterns or for when the
 * data source might be external or require asynchronous operations.
 */

/**
 * GET /async - Asynchronously retrieve all books
 * This endpoint demonstrates the async/await pattern by making
 * an HTTP request to the same server's root endpoint
 */
public_users.get('/async', checkRateLimit, async function (req, res) {
    try {
        const bookList = await getBookListAsync("");
        res.status(200).json(bookList);
    } catch (error) {
        console.error('Error in /async route:', error);
        
        // Use status from error if available (e.g., 404 from getBookListAsync)
        if (error.status) {
            return res.status(error.status).json(error.data || { 
                error: "Request failed",
                message: error.message 
            });
        }
        
        // Generic server error for unexpected issues
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to retrieve book list. The service might be temporarily unavailable."
        });
    }
});

/**
 * GET /async/isbn/:isbn - Asynchronously retrieve book by ISBN
 * This demonstrates error propagation from the async helper function
 */
public_users.get('/async/isbn/:isbn', checkRateLimit, validateIsbn, async function (req, res) {
    try {
        const isbn = req.params.isbn;
        const encodedIsbn = encodeURIComponent(isbn); // Encode special characters
        const book = await getBookListAsync("/isbn/" + encodedIsbn);
        
        res.status(200).json(book);
    } catch (error) {
        console.error(`Error in /async/isbn/${req.params.isbn}:`, error);
        
        if (error.status) {
            return res.status(error.status).json(error.data || { 
                error: "Request failed",
                message: error.message 
            });
        }
        
        res.status(500).json({ 
            error: "Service unavailable",
            message: "Failed to retrieve book details. Please try again later."
        });
    }
});

/**
 * GET /async/author/:author - Asynchronously retrieve books by author
 * 
 * This endpoint specifically demonstrates:
 * 1. Async/await pattern with Axios for HTTP requests
 * 2. Proper error handling for network issues and HTTP errors
 * 3. Encoding of URL parameters to handle special characters
 * 4. Rate limiting to prevent abuse
 * 
 * The filtering logic is handled by the synchronous /author/:author endpoint,
 * which is called internally via HTTP. This separation allows for:
 * - Code reuse (same filtering logic)
 * - Independent scaling of async operations
 * - Demonstration of microservices-like architecture
 */
public_users.get('/async/author/:author', checkRateLimit, validateSearchParams, async function (req, res) {
    try {
        const author = req.params.author;
        const encodedAuthor = encodeURIComponent(author); // Encode for URL safety
        
        // Make asynchronous HTTP request to the synchronous author endpoint
        const books = await getBookListAsync("/author/" + encodedAuthor);
        
        // Return the filtered books from the synchronous endpoint
        res.status(200).json(books);
    } catch (error) {
        console.error(`Error in /async/author/${req.params.author}:`, error);
        
        // Handle different types of errors appropriately
        if (error.status) {
            // Error from getBookListAsync (e.g., 404, 400)
            return res.status(error.status).json(error.data || { 
                error: "Request failed",
                message: error.message 
            });
        }
        
        // Network or server errors
        res.status(500).json({ 
            error: "Service unavailable",
            message: "Failed to search books by author. Please try again later."
        });
    }
});

/**
 * GET /async/title/:title - Asynchronously retrieve books by title
 */
public_users.get('/async/title/:title', checkRateLimit, validateSearchParams, async function (req, res) {
    try {
        const title = req.params.title;
        const encodedTitle = encodeURIComponent(title);
        const books = await getBookListAsync("/title/" + encodedTitle);
        
        res.status(200).json(books);
    } catch (error) {
        console.error(`Error in /async/title/${req.params.title}:`, error);
        
        if (error.status) {
            return res.status(error.status).json(error.data || { 
                error: "Request failed",
                message: error.message 
            });
        }
        
        res.status(500).json({ 
            error: "Service unavailable",
            message: "Failed to search books by title. Please try again later."
        });
    }
});

/**
 * ============================================
 * GLOBAL ERROR HANDLER
 * ============================================
 * Catches any unhandled errors in this router
 * Provides a consistent error response format
 */
public_users.use((err, req, res, next) => {
    console.error('Unhandled error in public_users router:', err);
    
    // Don't send headers if they've already been sent
    if (res.headersSent) {
        return next(err);
    }
    
    // Generate a simple request ID for debugging
    const requestId = req.id || Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    res.status(500).json({
        error: "Internal server error",
        message: "An unexpected error occurred",
        requestId: requestId
    });
});

module.exports.general = public_users;
