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

    console.log(users.filter((user) => (user.username === username && user.password === password)).length)

    if (users.filter((user) => (user.username === username && user.password === password)).length) {
        let accessToken = jwt.sign({
            data: password
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

    console.log(req.body)
    const { reviewText } = req.body;
    const isbn = req.params.isbn;
    console.log(reviewText)
    console.log(books[isbn])


    jwt.verify(token, secret, (err, decoded) => {
        if (err) {
            // If the token is invalid or expired, return a forbidden status
            return res.sendStatus(403); // Forbidden
        }
        console.log("deco:" + decoded)
        books[isbn].reviews["John"] = {
            "username": "John",
            "review": "This is a review"
          };


    })

    //Write your code here
    return res.status(300).json({ message: "Yet to be implemented" });
});

module.exports.authenticated = regd_users;
module.exports.isValid = isValid;
module.exports.users = users;
