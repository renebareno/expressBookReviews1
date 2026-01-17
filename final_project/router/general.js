const express = require('express');
let books = require("./booksdb.js");
let isValid = require("./auth_users.js").isValid;
let users = require("./auth_users.js").users;
const public_users = express.Router();

/*
curl -X POST http://localhost:5000/register \
  -H "Content-Type: application/json" \
  -d '{"username": "holi", "password": "123456"}'
*/

public_users.post("/register",(req,res)=>{
    const { username, password } = req.body;
    if(!password)
        res.status(400).send("no password");
    else if(!username)
        res.status(400).send("no username");
    else if(users.filter(u => u.username==username).length!=0)
        res.status(400).send("Repeated username");
    else{
        users.push({
        "username":username,
        "password": password
       });
        // Send a success message as the response, indicating the user has been added
        res.status(200).send("The user " + username + " has been added!");
    }
});


// Get the book list available in the shop
public_users.get('/',function (req, res) {
  return res.status(200).json(JSON.stringify(books));
});

// Get book details based on ISBN
public_users.get('/isbn/:isbn',function (req, res) {
    const isbn =req.params.isbn
    return res.status(200).json(JSON.stringify(books[isbn]));
 });
  
// Get book details based on author
public_users.get('/author/:author',function (req, res) {
    const author = req.params.author
    console.log(author)
    let filteredBooks = [];
    
    for (const key in books) {
        let bookAuth = `${books[key].author}` 
        if(bookAuth.includes(author))
            filteredBooks.push(books[key])
    }
    console.log(filteredBooks)
    return res.status(200).json(JSON.stringify(filteredBooks));
});

// Get all books based on title
public_users.get('/title/:title',function (req, res) {
    const title = req.params.title
    let filteredBooks = [];
    for (const key in books) {
        let bookTitle = `${books[key].title}` 
        if(bookTitle.includes(title))
            filteredBooks.push(books[key])
    }
    console.log(filteredBooks)
    return res.status(200).json(JSON.stringify(filteredBooks));
});

//  Get book review
public_users.get('/review/:isbn',function (req, res) {
    const isbn =req.params.isbn
    return res.status(200).json(JSON.stringify(books[isbn].reviews));
});

module.exports.general = public_users;
