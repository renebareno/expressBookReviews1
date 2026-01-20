const express = require('express');
const axios = require('axios')
let books = require("./booksdb.js");
let isValid = require("./auth_users.js").isValid;
let users = require("./auth_users.js").users;
const public_users = express.Router();

// Use the current server's URL instead of hardcoding
const URL = `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 5000}`;

// Input validation middleware
const validateRegistration = (req, res, next) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ 
            error: "Missing required fields",
            message: "Both username and password are required"
        });
    }
    
    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ 
            error: "Invalid data type",
            message: "Username and password must be strings"
        });
    }
    
    if (username.trim().length < 3) {
        return res.status(400).json({ 
            error: "Invalid username",
            message: "Username must be at least 3 characters long"
        });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ 
            error: "Weak password",
            message: "Password must be at least 6 characters long"
        });
    }
    
    next();
};

// Route parameter validation middleware
const validateIsbn = (req, res, next) => {
    const isbn = req.params.isbn;
    
    if (!isbn || isbn.trim() === '') {
        return res.status(400).json({ 
            error: "Missing ISBN",
            message: "ISBN parameter is required"
        });
    }
    
    // Basic ISBN validation (can be extended for specific ISBN formats)
    if (typeof isbn !== 'string') {
        return res.status(400).json({ 
            error: "Invalid ISBN format",
            message: "ISBN must be a string"
        });
    }
    
    next();
};

const validateSearchParams = (req, res, next) => {
    const param = req.params.author || req.params.title;
    
    if (!param || param.trim() === '') {
        const paramName = req.params.author ? 'author' : 'title';
        return res.status(400).json({ 
            error: "Missing search parameter",
            message: `${paramName} parameter is required`
        });
    }
    
    if (typeof param !== 'string') {
        return res.status(400).json({ 
            error: "Invalid search parameter",
            message: "Search parameter must be a string"
        });
    }
    
    // Prevent extremely long search terms (potential DoS protection)
    if (param.length > 100) {
        return res.status(400).json({ 
            error: "Search term too long",
            message: "Search term must be less than 100 characters"
        });
    }
    
    next();
};

public_users.post("/register", validateRegistration, (req, res) => {
    try {
        const { username, password } = req.body;
        const trimmedUsername = username.trim();
        
        // Check for duplicate username
        const userExists = users.some(u => u.username.toLowerCase() === trimmedUsername.toLowerCase());
        if (userExists) {
            return res.status(409).json({ 
                error: "Username already exists",
                message: `Username '${trimmedUsername}' is already taken`
            });
        }
        
        // Add new user
        users.push({
            "username": trimmedUsername,
            "password": password // In production, this should be hashed!
        });
        
        // Log successful registration (in production, use proper logging library)
        console.log(`New user registered: ${trimmedUsername}`);
        
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

// Get the book list available in the shop
public_users.get('/', function (req, res) {
    try {
        if (!books || Object.keys(books).length === 0) {
            return res.status(404).json({ 
                error: "No books available",
                message: "The bookstore is currently empty"
            });
        }
        
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

// Get book details based on ISBN
public_users.get('/isbn/:isbn', validateIsbn, function (req, res) {
    try {
        const isbn = req.params.isbn.trim();
        const book = books[isbn];
        
        if (!book) {
            return res.status(404).json({ 
                error: "Book not found",
                message: `No book found with ISBN: ${isbn}`,
                suggestion: "Check the ISBN or browse all books at /"
            });
        }
        
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

// Get book details based on author
public_users.get('/author/:author', validateSearchParams, function (req, res) {
    try {
        const author = req.params.author.toLowerCase().trim();
        let filteredBooks = [];
        
        // Edge case: empty search after trimming
        if (author === '') {
            return res.status(400).json({ 
                error: "Invalid author name",
                message: "Author name cannot be empty"
            });
        }

        for (const key in books) {
            let bookAuth = books[key].author.toLowerCase();
            if (bookAuth.includes(author)) {
                filteredBooks.push({
                    isbn: key,
                    ...books[key]
                });
            }
        }
        
        if (filteredBooks.length === 0) {
            return res.status(404).json({ 
                error: "No books found",
                message: `No books found by author: ${req.params.author}`,
                suggestion: "Try a different spelling or browse all books at /"
            });
        }
        
        return res.status(200).json({
            count: filteredBooks.length,
            searchTerm: req.params.author,
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

// Get all books based on title
public_users.get('/title/:title', validateSearchParams, function (req, res) {
    try {
        const title = req.params.title.toLowerCase().trim();
        let filteredBooks = [];
        
        // Edge case: empty search after trimming
        if (title === '') {
            return res.status(400).json({ 
                error: "Invalid title",
                message: "Book title cannot be empty"
            });
        }
        
        for (const key in books) {
            let bookTitle = books[key].title.toLowerCase();
            if (bookTitle.includes(title)) {
                filteredBooks.push({
                    isbn: key,
                    ...books[key]
                });
            }
        }
        
        if (filteredBooks.length === 0) {
            return res.status(404).json({ 
                error: "No books found",
                message: `No books found with title: ${req.params.title}`,
                suggestion: "Try a different search term or browse all books at /"
            });
        }
        
        return res.status(200).json({
            count: filteredBooks.length,
            searchTerm: req.params.title,
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

// Get book review
public_users.get('/review/:isbn', validateIsbn, function (req, res) {
    try {
        const isbn = req.params.isbn.trim();
        const book = books[isbn];
        
        if (!book) {
            return res.status(404).json({ 
                error: "Book not found",
                message: `No book found with ISBN: ${isbn}`
            });
        }
        
        if (!book.reviews || Object.keys(book.reviews).length === 0) {
            return res.status(404).json({ 
                error: "No reviews available",
                message: `No reviews found for book: ${book.title}`,
                suggestion: "Be the first to add a review!"
            });
        }
        
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

// Async function to get book list with enhanced error handling
async function getBookListAsync(queryString) {
    try {
        const response = await axios.get(URL + queryString, {
            timeout: 10000, // 10 second timeout
            validateStatus: function (status) {
                return status >= 200 && status < 500; // Accept 4xx status codes
            }
        });
        
        if (response.status >= 400) {
            const error = new Error(`HTTP ${response.status}: ${response.data?.error || 'Request failed'}`);
            error.status = response.status;
            error.data = response.data;
            throw error;
        }
        
        return response.data;
    } catch (error) {
        console.error('Error in getBookListAsync:', error.message);
        
        // Enhance error object with more context
        if (error.code === 'ECONNREFUSED') {
            error.message = 'Unable to connect to the server';
        } else if (error.code === 'ETIMEDOUT') {
            error.message = 'Request timed out';
        }
        
        throw error;
    }
}

// Rate limiting for async endpoints (basic example)
const asyncRequestCounts = new Map();
const ASYNC_RATE_LIMIT = 100; // requests per minute

const checkRateLimit = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    let requests = asyncRequestCounts.get(clientIP) || [];
    
    // Remove old requests
    requests = requests.filter(time => time > oneMinuteAgo);
    
    if (requests.length >= ASYNC_RATE_LIMIT) {
        return res.status(429).json({
            error: "Too many requests",
            message: "Rate limit exceeded. Please try again later."
        });
    }
    
    requests.push(now);
    asyncRequestCounts.set(clientIP, requests);
    next();
};

// Async routes with rate limiting
public_users.get('/async', checkRateLimit, async function (req, res) {
    try {
        const bookList = await getBookListAsync("");
        res.status(200).json(bookList);
    } catch (error) {
        console.error('Error in /async route:', error);
        
        if (error.status) {
            return res.status(error.status).json(error.data || { 
                error: "Request failed",
                message: error.message 
            });
        }
        
        res.status(500).json({ 
            error: "Internal server error",
            message: "Failed to retrieve book list. The service might be temporarily unavailable."
        });
    }
});

public_users.get('/async/isbn/:isbn', checkRateLimit, validateIsbn, async function (req, res) {
    try {
        const isbn = req.params.isbn;
        const encodedIsbn = encodeURIComponent(isbn);
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

public_users.get('/async/author/:author', checkRateLimit, validateSearchParams, async function (req, res) {
    try {
        const author = req.params.author;
        const encodedAuthor = encodeURIComponent(author);
        const books = await getBookListAsync("/author/" + encodedAuthor);
        
        res.status(200).json(books);
    } catch (error) {
        console.error(`Error in /async/author/${req.params.author}:`, error);
        
        if (error.status) {
            return res.status(error.status).json(error.data || { 
                error: "Request failed",
                message: error.message 
            });
        }
        
        res.status(500).json({ 
            error: "Service unavailable",
            message: "Failed to search books by author. Please try again later."
        });
    }
});

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

// Global error handler for unhandled errors in this router
public_users.use((err, req, res, next) => {
    console.error('Unhandled error in public_users router:', err);
    
    if (res.headersSent) {
        return next(err);
    }
    
    res.status(500).json({
        error: "Internal server error",
        message: "An unexpected error occurred",
        requestId: req.id || Date.now().toString(36) // Simple request ID for debugging
    });
});

module.exports.general = public_users;
