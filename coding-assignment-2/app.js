const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//Register API

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `select * from user where username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `INSERT INTO user(name, username, password, gender)
           VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `select * from user where username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "akhilarra11@gmail.com");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    console.log("jwt");
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "akhilarra11@gmail.com", async (error, payload) => {
      if (error) {
        console.log("hi");
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// Returns Latest Tweets of people whom the user is following API
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUser = `select * from user where username = '${username}';`;
  const dbResponse = await db.get(getUser);
  const getTweetsQuery = `select user.username as username, tweet.tweet as tweet, tweet.date_time as dateTime from follower inner join tweet on
  follower.following_user_id = tweet.user_id inner join user on user.user_id = tweet.user_id where 
  follower.follower_user_id = ${dbResponse.user_id}
  order by tweet.date_time desc;`;
  const dbResponse2 = await db.all(getTweetsQuery);
  response.send(dbResponse2);
});

//Returns the list of all names whom the user is following API
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserId = `select user_id from user where username = '${username}';`;
  const userId = await db.get(getUserId);

  const getNamesQuery = `select user.name as name from follower inner join user on 
  follower.following_user_id = user.user_id where follower.follower_user_id = ${userId.user_id};`;

  const dbResponse = await db.all(getNamesQuery);
  console.log(dbResponse);
  response.send(dbResponse);
});

//GET the names of people who follows the user API
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserId = `select user_id from user where username = '${username}';`;
  const userId = await db.get(getUserId);

  const selectFollowersQuery = `select user.name from follower inner join 
  user on follower.follower_user_id =  user.user_id where 
  follower.following_user_id = ${userId.user_id};`;

  const dbResponse = await db.all(selectFollowersQuery);
  response.send(dbResponse);
});

//getting tweet of users whom he is following API
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;

  const getUserQuery = `select * from user where username = '${username}';`;
  const dbResponse = await db.get(getUserQuery);

  const userTweetIds = `select distinct follower.following_user_id from follower inner join tweet on 
  follower.following_user_id = tweet.user_id where 
  follower.follower_user_id = ${dbResponse.user_id};`;

  const dbResponse5 = await db.all(userTweetIds);

  let newList = [];

  dbResponse5.map((item) => newList.push(item.following_user_id));

  const res = newList.includes(parseInt(tweetId));
  console.log(res);

  if (res === true) {
    const getSqlQuery = `select tweet.tweet as tweet, count(distinct like.like_id) as likes, count(distinct reply.reply_id) as replies, tweet.date_time as dateTime
     from user inner join follower on user.user_id=follower.follower_user_id inner join tweet on tweet.user_id = follower.following_user_id 
     inner join like on like.tweet_id = tweet.tweet_id inner join reply on reply.tweet_id = tweet.tweet_id where follower.follower_user_id = ${dbResponse.user_id} and 
     tweet.tweet_id = ${tweetId};`;

    const dbResponse2 = await db.get(getSqlQuery);
    response.send(dbResponse2);
  } else {
    response.status(401);
    response.send(`Invalid Request`);
  }
});

//If the user requests a tweet of a user he is following, return the
//list of usernames who liked the tweet.

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `select * from user where username = '${username}';`;
    const dbResponse = await db.get(selectUserQuery);

    const userFollowingQuery = `select distinct tweet.user_id from follower inner join tweet on 
    follower.following_user_id = tweet.user_id where follower.follower_user_id = ${dbResponse.user_id};`;

    const getFollowers = await db.all(userFollowingQuery);

    let newList = [];
    getFollowers.map((item) => newList.push(item.user_id));

    const res = newList.includes(parseInt(tweetId));

    if (res === true) {
      const getSqlQuery = `select user.username from follower inner join tweet on 
         follower.following_user_id = tweet.user_id inner join like on tweet.tweet_id = like.tweet_id inner join user on like.user_id = user.user_id
         where follower.follower_user_id = ${dbResponse.user_id}
         and tweet.tweet_id = ${tweetId};`;

      const dbResponse2 = await db.all(getSqlQuery);
      let newList = [];
      dbResponse2.map((item) => newList.push(item.username));
      response.send({ likes: newList });
    } else {
      response.status(401);
      response.send(`Invalid Request`);
    }
  }
);

// If the user requests a tweet of a user he is following, return
// the list of replies.

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const selectUserQuery = `select * from user where username =  '${username}';`;
    const dbResponse = await db.get(selectUserQuery);
    //dbResponse.user_id

    const userFollowingQuery = `select distinct tweet.user_id from follower inner join tweet on 
    follower.following_user_id = tweet.user_id where follower.follower_user_id = ${dbResponse.user_id};`;

    const getFollowers = await db.all(userFollowingQuery);

    let newList = [];
    getFollowers.map((item) => newList.push(item.user_id));

    const res = newList.includes(parseInt(tweetId));

    if (res === true) {
      const getSqlQuery = `select user.name, reply.reply from follower inner join tweet 
        on follower.following_user_id = tweet.user_id inner join reply on 
        tweet.tweet_id = reply.tweet_id inner join user on reply.user_id = user.user_id
        where follower.follower_user_id = ${dbResponse.user_id} 
        and tweet.tweet_id = ${tweetId};`;

      const dbResponse2 = await db.all(getSqlQuery);
      response.send({ replies: dbResponse2 });
    } else {
      response.status(401);
      response.send(`Invalid Request`);
    }
  }
);

//Returns a list of all tweets of the user.

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUser = `select * from user where username = '${username}';`;
  const userResp = await db.get(getUser);

  const sqlQuery = `select tweet.tweet as tweet, count(distinct like.like_id) as likes, 
   count(distinct reply.reply_id) as replies, tweet.date_time as dateTime from tweet inner join 
   like on tweet.tweet_id = like.tweet_id inner join 
   reply on reply.tweet_id = tweet.tweet_id  where tweet.user_id = ${userResp.user_id}
   group by tweet.tweet_id;`;
  const dbResponse = await db.all(sqlQuery);
  response.send(dbResponse);
});

//Create a tweet in the tweet table;

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUser = `select * from user where username = '${username}';`;
  const dbUser = await db.get(getUser);

  const newDate = new Date();

  const createTweet = `INSERT INTO tweet
    (tweet, user_id, date_time)
    VALUES ('${tweet}', ${dbUser.user_id}, '${newDate}');`;

  const dbResponse = await db.run(createTweet);
  const lastId = dbResponse.lastID;
  console.log(lastId);
  response.send(`Created a Tweet`);
});

//deleting a tweet

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUser = `select * from user where username = '${username}';`;
    const dbUser = await db.get(getUser);

    const userTweetIds = `select tweet_id from tweet where tweet.user_id = ${dbUser.user_id};`;
    const userTweets = await db.all(userTweetIds);
    const newList = [];
    userTweets.map((item) => newList.push(item.tweet_id));

    const res = newList.includes(parseInt(tweetId));

    if (res === true) {
      const deleteQuery = `delete from tweet where tweet_id = ${tweetId};`;
      await db.run(deleteQuery);
      response.send(`Tweet Removed`);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
