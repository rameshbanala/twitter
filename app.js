const express = require('express')
const app = express()
app.use(express.json())

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')

const path = require('path')
const dbpath = path.join(__dirname, 'twitterClone.db')

let db = null

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const initiallizeDbandServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('starting at http://localhost:3000/')
    })
  } catch (e) {
    console.log(e.message)
  }
}
initiallizeDbandServer()

//middleware function
const authenticate = (request, response, next) => {
  let authHeader = request.headers['authorization']

  let jwtToken
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    let isValidToken = jwt.verify(
      jwtToken,
      'MY_SECRET_TOKEN',
      (error, payload) => {
        if (error) {
          response.status(401)
          response.send('Invalid JWT Token')
        } else {
          request.username = payload.username
          next()
        }
      },
    )
  }
}

//api-1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const userPresentQuery = `
    SELECT *
    FROM user 
    WHERE username = '${username}';
  `
  const dbuser = await db.get(userPresentQuery)
  if (dbuser === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      let hashedPassword = await bcrypt.hash(password, 10)
      let insertDetailsQuery = `
        INSERT INTO user (name, username, password, gender)
        values (
          '${name}',
          '${username}',
          '${hashedPassword}',
          '${gender}'
        );
      `
      await db.run(insertDetailsQuery)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//api-2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const userPresentQuery = `
    SELECT *
    FROM user 
    WHERE username = '${username}';
  `
  const dbuser = await db.get(userPresentQuery)
  if (dbuser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    let isCorrectPassword = await bcrypt.compare(password, dbuser.password)
    if (isCorrectPassword) {
      let payload = {username: username}
      let jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const parsetweetdata = dbobj => {
  return {
    username: dbobj.username,
    tweet: dbobj.tweet,
    dateTime: dbobj.date_time,
  }
}

//api-3
app.get('/user/tweets/feed/', authenticate, async (request, response) => {
  const {username} = request
  let getUserIdQuery = `SELECT user_id from user where username = '${username}'`
  let userId = await db.get(getUserIdQuery)
  userId = userId.user_id
  let query = `
      SELECT user.username, tweet.tweet, tweet.date_time
      FROM (follower inner join tweet on 
        follower.following_user_id = tweet.user_id)
        inner join user on tweet.user_id = user.user_id
      WHERE 
      follower.following_user_id in 
                            (select following_user_id from
                            follower where follower_user_id = ${userId})
                            and follower.follower_user_id = ${userId}
      order by tweet.date_time desc
      limit 4

  `
  let data = await db.all(query)
  response.send(
    data.map(each => {
      return parsetweetdata(each)
    }),
  )
})

//api-4

app.get('/user/following/', authenticate, async (request, response) => {
  const {username} = request
  let getUserIdQuery = `SELECT user_id from user where username = '${username}'`
  let userId = await db.get(getUserIdQuery)
  userId = userId.user_id
  let query = `
    select
    name
    from user
    where user_id in (
      select following_user_id as user_id
      from follower
      where follower_user_id = ${userId}
    )
  `
  let data = await db.all(query)
  response.send(data)
})

//api-5

app.get('/user/followers/', authenticate, async (request, response) => {
  const {username} = request
  let getUserIdQuery = `SELECT user_id from user where username = '${username}'`
  let userId = await db.get(getUserIdQuery)
  userId = userId.user_id
  let query = `
    select
    name
    from user
    where user_id in (
      select follower_user_id as user_id
      from follower
      where following_user_id = ${userId}
    )
  `
  let data = await db.all(query)
  response.send(data)
})

//api-6
app.get('/tweets/:tweetId/', authenticate, async (request, response) => {
  const {username} = request
  let getUserIdQuery = `SELECT user_id from user where username = '${username}'`
  let userId = await db.get(getUserIdQuery)
  let {tweetId} = request.params
  userId = userId.user_id
  let query = `
    select tweet.tweet,
      count(distinct(like.like_id)) as likes,
      count(distinct(reply.reply_id)) as replies,
      tweet.date_time as dateTime
    from tweet inner join like on tweet.tweet_id = like.tweet_id
    inner join reply on tweet.tweet_id = reply.tweet_id
    where tweet.user_id in (SELECT following_user_id as user_id
                      from follower
                      where follower_user_id = ${userId}) 
    and tweet.tweet_id = ${tweetId};
  `
  let data = await db.get(query)
  console.log(data)
  if (data.tweet === null) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    response.send(data)
  }
})

//api-7

app.get('/tweets/:tweetId/likes', authenticate, async (request, response) => {
  const {username} = request
  let getUserIdQuery = `SELECT user_id from user where username = '${username}'`
  let userId = await db.get(getUserIdQuery)
  let {tweetId} = request.params
  userId = userId.user_id
  let query = `
    select user.username
    from tweet inner join like on tweet.tweet_id = like.tweet_id
    inner join user on like.user_id = user.user_id
    where tweet.user_id in (SELECT following_user_id as user_id
                      from follower
                      where follower_user_id = ${userId}) 
    and tweet.tweet_id = ${tweetId};
  `
  let data = await db.all(query)
  if (data.length === 0) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    let namesList = []
    for (let each of data) {
      namesList.push(each.username)
    }

    response.send({likes: namesList})
  }
})

//api-8
app.get(
  '/tweets/:tweetId/replies/',
  authenticate,
  async (request, response) => {
    const {username} = request
    let getUserIdQuery = `SELECT user_id from user where username = '${username}'`
    let userId = await db.get(getUserIdQuery)
    let {tweetId} = request.params
    userId = userId.user_id
    let query = `
    select reply.reply, user.name
    from tweet inner join reply on tweet.tweet_id = reply.tweet_id
    inner join user on reply.user_id = user.user_id
    where tweet.user_id in (SELECT following_user_id as user_id
                      from follower
                      where follower_user_id = ${userId}) 
    and tweet.tweet_id = ${tweetId};
  `
    let data = await db.all(query)
    if (data.length === 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send({replies: data})
    }
  },
)

//api-9

app.get('/user/tweets/', authenticate, async (request, response) => {
  const {username} = request
  let getUserIdQuery = `SELECT user_id from user where username = '${username}'`
  let userId = await db.get(getUserIdQuery)
  //let {tweetId} = request.params
  userId = userId.user_id

  let query = `
    select tweet.tweet,
    count(like.like_id) as likes,
    count(reply.reply_id) as replies,
    tweet.date_time as dateTime
    from tweet inner join like on tweet.tweet_id = like.tweet_id 
    inner join reply on tweet.tweet_id = reply.tweet_id
    where tweet.user_id = ${userId}
    group by tweet.tweet_id;
  `
  let data = await db.all(query)
  response.send(data)
})

//api-10

app.post('/user/tweets/', authenticate, async (request, response) => {
  const {username} = request
  let getUserIdQuery = `SELECT user_id from user where username = '${username}'`
  let userId = await db.get(getUserIdQuery)
  let {tweet} = request.body
  userId = userId.user_id
  //console.log(userId)
  //console.log(tweet)
  const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ')
  let insertQuery = `
    INSERT into tweet(tweet, user_id, date_time)
    values(
      '${tweet}',
      ${userId},
      '${currentDate}'
    )
  `
  await db.run(insertQuery)
  response.send('Created a Tweet')
})

//api-11

app.delete('/tweets/:tweetId/', authenticate, async (request, response) => {
  const {username} = request
  let getUserIdQuery = `SELECT user_id from user where username = '${username}'`
  let userId = await db.get(getUserIdQuery)
  userId = userId.user_id
  let {tweetId} = request.params
  //console.log(tweetId)
  let getIDQuery = `select user_id from tweet where tweet_id = ${tweetId}`
  let getId = await db.get(getIDQuery)
  //console.log(getId)
  if (getId.user_id === userId) {
    let deleteQuery = `
      DELETE FROM tweet
      where tweet_id = ${tweetId};
    `
    await db.run(deleteQuery)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

module.exports = app
