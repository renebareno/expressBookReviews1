const express = require('express');
const axios = require('axios')
let books = require("./booksdb.js");
let isValid = require("./auth_users.js").isValid;
let users = require("./auth_users.js").users;
const public_users = express.Router();

// Use the current server's URL instead of hardcoding
const URL = `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 5000}`;

public_users.post("/register", (req, res) => {
    const { username, password } = req.body;
    if (!password)
        res.status(400).send("no password");
    else if (!username)
        res.status(400).send("no username");
    else if (users.filter(u => u.username == username).length != 0)
        res.status(400).send("Repeated username");
    else {
        users.push({
            "username": username,
            "password": password
        });
        res.status(200).send("The user " + username + " has been added!");
    }
});

// Get the book list available in the shop
public_users.get('/', function (req, res) {
    return res.status(200).json(books);
});

// Get book details based on ISBN
public_users.get('/isbn/:isbn', function (req, res) {
    const isbn = req.params.isbn;
    const book = books[isbn];
    
    if (!book) {
        return res.status(404).json({ message: "Book not found" });
    }
    
    return res.status(200).json(book);
});

// Get book details based on author
public_users.get('/author/:author', function (req, res) {
    const author = req.params.author.toLowerCase();
    let filteredBooks = [];

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
        return res.status(404).json({ message: "No books found by this author" });
    }
    
    return res.status(200).json({ books: filteredBooks });
});

// Get all books based on title
public_users.get('/title/:title', function (req, res) {
    const title = req.params.title.toLowerCase();
    let filteredBooks = [];
    
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
        return res.status(404).json({ message: "No books found with this title" });
    }
    
    return res.status(200).json({ books: filteredBooks });
});

// Get book review
public_users.get('/review/:isbn', function (req, res) {
    const isbn = req.params.isbn;
    const book = books[isbn];
    
    if (!book) {
        return res.status(404).json({ message: "Book not found" });
    }
    
    return res.status(200).json(book.reviews);
});

// Async function to get book list
async function getBookListAsync(queryString) {
    try {
        const response = await axios.get(URL + queryString);
        return response.data;
    } catch (error) {
        console.error('Error in getBookListAsync:', error.message);
        throw error; // Re-throw the error for handling in the route
    }
}

// Async routes
public_users.get('/async', async function (req, res) {
    try {
        const bookList = await getBookListAsync("");
        res.status(200).json(bookList);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error retrieving book list" });
    }
});

public_users.get('/async/isbn/:isbn', async function (req, res) {
    try {
        const isbn = req.params.isbn;
        const book = await getBookListAsync("/isbn/" + isbn);
        
        if (book && book.message === "Book not found") {
            return res.status(404).json(book);
        }
        
        res.status(200).json(book);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error retrieving book by ISBN" });
    }
});

public_users.get('/async/author/:author', async function (req, res) {
    try {
        const author = req.params.author;
        const books = await getBookListAsync("/author/" + encodeURIComponent(author));
        
        if (books && books.message) {
            return res.status(404).json(books);
        }
        
        res.status(200).json(books);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error retrieving books by author" });
    }
});

public_users.get('/async/title/:title', async function (req, res) {
    try {
        const title = req.params.title;
        const books = await getBookListAsync("/title/" + encodeURIComponent(title));
        
        if (books && books.message) {
            return res.status(404).json(books);
        }
        
        res.status(200).json(books);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error retrieving books by title" });
    }
});

module.exports.general = public_users;
