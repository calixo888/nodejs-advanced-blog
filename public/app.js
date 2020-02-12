const express = require("express");
const cookieParser = require("cookie-parser");
const passwordHash = require("password-hash");

// MongoDB dependencies
const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectId;

const app = express();
const mongoUrl = process.env.MONGODB_URI || "mongodb://localhost:27017";

// Setting view rendering engine
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use('/static', express.static(__dirname + '/static'))
app.engine('html', require('ejs').renderFile);

// Configuring cookie parser with express
app.use(cookieParser())

// Setting JSON parsing methods for POST request data
app.use(express.urlencoded()); // HTML forms
app.use(express.json()); // API clients

// Global variables
const loginRestrictedPages = ["blogs", "post", "user", "blog", "update"];  // List of pages that require login before proceeding

// Sending cookie data into each page
app.use((req, res, next) => {
  // Sending currentUser cookie in the context of each page
  res.locals = {
    "currentUser": req.cookies.currentUser,
  };

  // Checking if user is going to restricted page without logging in
  if (!req.cookies.currentUser && loginRestrictedPages.includes(req.originalUrl.split("/")[1])) {
    res.redirect("/login");
  }
  else {
    next();
  }
});


app.get("/", (req, res) => {
  res.render("index.html");
});

app.route("/login")
  .get((req, res) => {
    res.render("login.html", context={
      error: null
    });
  })
  .post((req, res) => {
    const loginPostData = req.body;

    const username = loginPostData.username;
    const password = loginPostData.password;

    // Validating that credentials are valid
    MongoClient.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }, (err, client) => {
      if (err) throw err;

      const db = client.db("nodejs-advanced-blog");
      const userCollection = db.collection("users");

      userCollection.find({"username": username}).toArray((err, user) => {
        if (err) throw err;

        if (user.length != 0) {  // Username is correct
          if (passwordHash.verify(password, user[0].password)) {
            // Setting currentUser cookie to logged in user
            res.cookie("currentUser", user);

            res.redirect("/");
          }
          else {
            res.render("login.html", context={
              error: "Invalid credentials"
            });
          }
        }
        else {
          res.render("login.html", context={
            error: "Username is not correct"
          })
        }
      })
    })
  })


app.route("/register")
  .get((req, res) => {
    res.render("register.html", context={
      error: null
    });
  })
  .post((req, res) => {
    const registerData = req.body;

    // Grabbing individual registration pieces
    const name = registerData.name;
    const email = registerData.email;
    const username = registerData.username;
    const password = registerData.password;
    const hashedPassword = passwordHash.generate(password);

    // Checking is username or email is taken
    MongoClient.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }, (err, client) => {
      if (err) {
        console.error(err);
        return;
      }

      const db = client.db("nodejs-advanced-blog");
      const userCollection = db.collection("users");

      // I check if the username and email are taken by querying the Mongo for all users that have the same email/username, and if there are any returned, it is taken

      // Checking username
      userCollection.find({"username": username}).toArray((err, usernames) => {
        if (usernames.length == 0) {
          // Checking email
          userCollection.find({"email": email}).toArray((err, emails) => {
            if (emails.length == 0) {
              // Username, email, and passwords are validated!
              // Registering new user in database
              MongoClient.connect(mongoUrl, {
                useNewUrlParser: true,
                useUnifiedTopology: true
              }, (err, client) => {
                if (err) {
                  console.error(err);
                  return;
                }

                const db = client.db("nodejs-advanced-blog");
                const userCollection = db.collection("users");

                user = {
                  name: name,
                  email: email,
                  username: username,
                  password: hashedPassword
                };

                userCollection.insertOne(user);

                res.redirect("/login");
              });
            }
            else {
              res.render("register.html", context={
                error: "Email is taken."
              });
            }
          })
        }
        else {
          res.render("register.html", context={
            error: "Username is taken."
          });
        }
      });
    })
  });

app.get("/logout", (req, res) => {
  res.clearCookie("currentUser");
  res.redirect("/");
})

app.get("/blogs", (req, res) => {
  // Getting all blogs
  MongoClient.connect(mongoUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }, (err, client) => {
    if (err) throw err;

    const db = client.db("nodejs-advanced-blog");
    const blogCollection = db.collection("blogs");

    blogCollection.find().toArray((err, blogs) => {
      res.render("blogs.html", context={
        blogs: blogs
      })
    });
  })
});

app.route("/post")
  .get((req, res) => {
    res.render("post.html");
  })
  .post((req, res) => {
    const blogPostData = req.body;

    // Setting ID to currentUser for blog pulling in individual user pages
    blogPostData["_userId"] = req.cookies.currentUser[0]._id;

    // Adding currentUser to each blog for blog identification
    blogPostData["user"] = req.cookies.currentUser[0];

    // Saving blog post into Mongo
    MongoClient.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }, (err, client) => {
      if (err) throw err;

      const db = client.db("nodejs-advanced-blog");
      const blogCollection = db.collection("blogs");

      blogCollection.insertOne(blogPostData);
    });

    res.redirect("/blogs");
  })

app.get("/user/:id", (req, res) => {
  // Getting user ID from dynamic URL
  const userId = req.params.id;
  if (userId.length != 24) {
    res.send("There is no user registered that matches that query");
    return;
  }

  // Casting userId to ObjectId to match MongoDB requirements
  // All _id queries in MongoDB must be of type ObjectId
  const userObjectId = ObjectId(userId);

  MongoClient.connect(mongoUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }, (err, client) => {
    if (err) throw err;

    const db = client.db("nodejs-advanced-blog");
    const userCollection = db.collection("users");

    userCollection.find({_id: userObjectId}).toArray((err, users) => {
      if (users.length == 0) {
        res.send("There is no user registered that matches that query")
      }
      else {
        const user = users[0];  // users is type array from query, so we grab the first user which should be the only one

        // Grab all blogs that the queried user has written
        MongoClient.connect(mongoUrl, {
          useNewUrlParser: true,
          useUnifiedTopology: true
        }, (err, client) => {
          if (err) throw err;

          const db = client.db("nodejs-advanced-blog");
          const blogCollection = db.collection("blogs");

          blogCollection.find({_userId: userId}).toArray((err, blogs) => {
            res.render("user.html", context={
              user: user,
              blogs: blogs
            })
          });
        });
      }
    });
  });
})

app.get("/blog/:id", (req, res) => {
  // Grabbing blogId from URL
  const blogId = req.params.id;

  // If the length of blogId is not 24, it cannot be valid
  if (blogId.length != 24) {
    res.send("There is no blog posted that matches that query");
    return;
  }

  // Casting userId to ObjectId to match MongoDB requirements
  // All _id queries in MongoDB must be of type ObjectId
  const blogObjectId = ObjectId(blogId);

  MongoClient.connect(mongoUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }, (err, client) => {
    if (err) throw err;

    const db = client.db("nodejs-advanced-blog");
    const blogCollection = db.collection("blogs");

    blogCollection.find({_id: blogObjectId}).toArray((err, blogs) => {
      if (blogs.length == 0) {
        res.send("There is no blog posted that matches that query")
      }
      else {
        res.render("blog.html", context={
          blog: blogs[0]
        })
      }
    });
  });
})

app.route("/update/:id")
  .get((req, res) => {
    // Grabbing blogId from URL
    const blogId = req.params.id;

    const currentUser = req.cookies.currentUser[0];

    // If the length of blogId is not 24, it cannot be valid
    if (blogId.length != 24) {
      res.send("There is no blog posted that matches that query");
      return;
    }

    // Casting string blogId into ObjectId
    const blogObjectId = ObjectId(blogId);

    // Getting blog to be updated
    MongoClient.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }, (err, client) => {
      if (err) throw err;

      const db = client.db("nodejs-advanced-blog");
      const blogCollection = db.collection("blogs");

      // Authenticating that the currentUser is the owner of this blog post
      blogCollection.find({_userId: currentUser._id}).toArray((err, blogs) => {
        if (blogs.length == 0) {  // currentUser is not the owner of this blog
          res.send("You do not have permission to modify this blog post.")
        }
        else {
          blogCollection.find({_id: blogObjectId}).toArray((err, blogs) => {
            if (blogs.length == 0) {
              res.send("There is no blog posted that matches that query")
            }
            else {
              res.render("update.html", context={
                blog: blogs[0]
              })
            }
          });
        }
      });
    });
  })
  .post((req, res) => {
    const updateData = req.body;
    const blogId = updateData.blogId;
    const blogObjectId = ObjectId(blogId);
    const currentUser = req.cookies.currentUser[0];

    // Updating respective blog post
    MongoClient.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }, (err, client) => {
      if (err) throw err;

      const db = client.db("nodejs-advanced-blog");
      const blogCollection = db.collection("blogs");

      // Authenticating that user is owner of this blog post
      blogCollection.find({_userId: currentUser._id}).toArray((err, blogs) => {
        if (blogs.length == 0) {  // currentUser is not owner of this blog
          res.send("You do not have permission to modify this blog post.")
        }
        else {
          blogCollection.update({_id: blogObjectId}, {
            _id: blogObjectId,
            title: updateData.title,
            content: updateData.content,
            _userId: currentUser._id,
            user: currentUser
          });

          res.redirect("/");
        }
      });
    })
  })


// API REQUESTS
app.delete("/api/delete-blog", (req, res) => {
  const blogId = req.query.blogId;
  const userId = req.query.userId;

  MongoClient.connect(mongoUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }, (err, client) => {
    if (err) throw err;

    const db = client.db("nodejs-advanced-blog");
    const blogCollection = db.collection("blogs");

    blogCollection.deleteOne({"_id": ObjectId(blogId)});
  });
})


app.listen(process.env.PORT || 5000, () => {
  console.log(`[+] Node.js server start on port ${process.env.PORT || 5000}`)
});
