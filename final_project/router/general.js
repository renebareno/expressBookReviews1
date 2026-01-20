const express = require('express');
const axios = require('axios')
let books = require("./booksdb.js");
let isValid = require("./auth_users.js").isValid;
let users = require("./auth_users.js").users;
const public_users = express.Router();

/*
curl -X POST http://localhost:5000/register \
  -H "Content-Type: application/json" \
  -d '{"username": "holi", "password": "123456"}'
*/

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
        // Send a success message as the response, indicating the user has been added
        res.status(200).send("The user " + username + " has been added!");
    }
});


// Get the book list available in the shop
public_users.get('/', function (req, res) {
    return res.status(200).json(JSON.stringify(books));
});

// Get book details based on ISBN
public_users.get('/isbn/:isbn', function (req, res) {
    const isbn = req.params.isbn
    return res.status(200).json(JSON.stringify(books[isbn]));
});

// Get book details based on author
public_users.get('/author/:author', function (req, res) {
    const author = req.params.author
    console.log(author)
    let filteredBooks = [];

    for (const key in books) {
        let bookAuth = `${books[key].author}`
        if (bookAuth.includes(author))
            filteredBooks.push(books[key])
    }
    console.log(filteredBooks)
    return res.status(200).json(JSON.stringify(filteredBooks));
});

// Get all books based on title
public_users.get('/title/:title', function (req, res) {
    const title = req.params.title
    let filteredBooks = [];
    for (const key in books) {
        let bookTitle = `${books[key].title}`
        if (bookTitle.includes(title))
            filteredBooks.push(books[key])
    }
    console.log(filteredBooks)
    return res.status(200).json(JSON.stringify(filteredBooks));
});

//  Get book review
public_users.get('/review/:isbn', function (req, res) {
    const isbn = req.params.isbn
    return res.status(200).json(JSON.stringify(books[isbn].reviews));
});

/*
curl -X POST http://localhost:5000/async \
*/
const URL = 'http://localhost:5000'
async function getBookListAsync(queryString) {
    try {
        console.log(URL + queryString)
        const response = await axios.get(URL + queryString);
        return response.data;
    } catch (error) {
        console.log(error.URL); // Re-throw the error for handling in the route
    }
}

public_users.get('/async', async function (req, res) {
    try {
        const bookList = await getBookListAsync("");
        res.status(200).json(bookList);
    } catch (error) {
        console.error(error);
        res.status(404).json({ message: "Error retrieving book list" });
    }
});

public_users.get('/async/isbn/:isbn', async function (req, res) {
    try {
        const isbn = req.params.isbn
        const bookList = await getBookListAsync("/isbn/" + isbn);
        res.status(200).json(bookList);
    } catch (error) {
        console.error(error);
        res.status(404).json({ message: "Error retrieving book by ISBN" });
    }
});


public_users.get('/async/author/:author', async function (req, res) {
    try {
        const author = req.params.author
        const bookList = await getBookListAsync("/author/" + author);
        res.status(200).json(bookList);
    } catch (error) {
        console.error(error);
        res.status(404).json({ message: "Error retrieving books by author" });
    }
});

public_users.get('/async/title/:title', async function (req, res) {
    try {
        const title = req.params.title
        const bookList = await getBookListAsync("/title/" + title);
        res.status(200).json(bookList);
    } catch (error) {
        console.error(error);
        res.status(404).json({ message: "Error retrieving books by title" });
    }
});



module.exports.general = public_users;
