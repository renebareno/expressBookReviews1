const express = require('express');
const jwt = require('jsonwebtoken');
let books = require("./booksdb.js");
const regd_users = express.Router();

let users = [];

const isValid = (username) => { //returns boolean
    //write code to check is the username is valid
}

const authenticatedUser = (username, password) => { //returns boolean
    //write code to check if username and password match the one we have in records.
}

//only registered users can login
regd_users.post("/login", (req, res) => {
    const { username, password } = req.body
    if (!username || !password) {
        return res.status(404).json({ message: "no password or login" });
    }
    if (users.filter((user) => (user.username === username && user.password === password)).length) {
        let accessToken = jwt.sign({
            username:username,
            pw:password,
            patato:"ya"
        }, 'access', { expiresIn: 60 * 60 });

        req.session.authorization = {
            accessToken, username
        }
        return res.status(200).send("User successfully logged in");
    } else {
        return res.status(208).json({ message: "Invalid Login. Check username and password" });
    }
});

// Add a book review
regd_users.put("/auth/review/:isbn", (req, res) => {
    const reviewText = req.query.review;
    const isbn = req.params.isbn;
    
    jwt.verify(req.session.authorization.accessToken, "access", (err, decoded) => {
        if (err) {
            return res.sendStatus(403); // Forbidden
        }
        books[isbn].reviews[decoded.username] = {
            "review": reviewText
          };
    })
    return res.status(200).json({ message: "Book updated:"+ JSON.stringify(books[isbn]) });
});

module.exports.authenticated = regd_users;
module.exports.isValid = isValid;
module.exports.users = users;
