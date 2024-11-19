const { Sequelize, Model, DataTypes, HasOne, Op } = require('sequelize');
const path = require('path');
var crypto = require('crypto');
const cookieParser = require('cookie-parser');

const sequelize = new Sequelize('postgres://express:express@postgresnode:5432/express', {
    pool: {
    max: 50,
    min: 0,
    acquire: 30000,
    idle: 10000
  }});

const Submissions = sequelize.define('submissions', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    user_id: DataTypes.STRING,
    exercise_id: Sequelize.INTEGER,
    code: DataTypes.TEXT('long'),
    code_hash: DataTypes.STRING,
    status: DataTypes.STRING
    }, {indexes: [
        {
            unique: true,
            fields: ['id']
        },
        {
            fields: ['user_id']
        }, 
        {
            fields: ['exercise_id']
        },
        {
            fields: ['exercise_id', 'code_hash']
        }]}
    );

const SubmissionResults = sequelize.define('submissions_results', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    exercise_id: Sequelize.INTEGER,
    code_hash: DataTypes.STRING,
    status: DataTypes.STRING
    }, {indexes: [
        {
            unique: true,
            fields: ['id']
        },
        {
            fields: ['exercise_id', 'code_hash']
        }]}
    );
    

const Exercises = sequelize.define('exercises', {
    exercise_id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    title: DataTypes.STRING,
    description: DataTypes.TEXT('long')
    }, {indexes: [
        {
            unique: true,
            fields: ['exercise_id']
        }]}
    );

//Trick to use await of top level
connect_to_db(sequelize).then(()=>{
    populate_db()
    console.log("Finished setting up DB.")
}).catch(()=>{console.log("Error")})

const baseurl = "http://localhost:5002/"
const express = require('express');
const app = express();

app.use(cookieParser());
app.use(express.json());

app.listen(5002, function() {
    console.log('listening on 5002')
  })


//Instruct the user to turn cookies on
app.get('/', (req, res) => {
    var cookie = req.cookies.userID;
    if (cookie === undefined) {
      var randomNumber=Math.random().toString();
      randomNumber=randomNumber.substring(2,randomNumber.length);
      res.cookie('userID',randomNumber, { maxAge: 1000*60*60*24*365, httpOnly: true });
      console.log('cookie created successfully');
    } else {
      // yes, cookie was already present 
      console.log('cookie exists', cookie);
    } 
    res.sendFile(path.join(__dirname, '/index.html'));
})

app.get('/exercises', async (req, res) => {
    var exercises = await Exercises.findAll().catch((error) => {
        res.status(500)
        res.send('Internal server error')
    })
    res.status(200)
    res.send(exercises)
})

app.get('/exercises/:id', async (req, res) => {
    var exercise = await Exercises.findByPk(req.params['id']).catch((error) => {
        res.status(500)
    })
    if(exercise==null || exercise==undefined) {
        res.status(404)
        res.send('Not found')
    } else {
        res.send(exercise);
    }
})

app.post('/submissions', async (req, res) => {

    //Get cookie with user id
    var chash = crypto.createHash('sha256').update(req.body.code).digest('base64')
    
    if(req.cookies.userID==null || req.body.exercise_id==null || req.body.code==null 
        || req.cookies.userID==undefined || req.body.exercise_id==undefined || req.body.code==undefined) {
        res.status(400)
        res.send('Bad request')
        return
    }

    const submission = await Submissions.findOne({
        where: { user_id: req.cookies.userID, exercise_id: ''+req.body.exercise_id, code_hash: chash}});

        await Submissions.create({
            user_id: req.cookies.userID,
            exercise_id: ''+req.body.exercise_id,
            code: req.body.code,
            code_hash: chash,
            status: 'SUBMITTED'
        }).then(result => {
            res.status(201)
            res.send('created')
        }).catch((error) => {
            res.status(500)
            res.send(error)
        });
})

app.get('/submissions/finished', async (req, res) => {

    if(req.cookies.userID==null || req.cookies.userID==undefined) {
        res.status(400)
        res.send('Bad request')
        return
    }

    const submissions = await Submissions.findAll({
        where: { user_id: req.cookies.userID, status: "PASS"},
        distinct: 'exercise_id',
        order: [
            ['exercise_id', 'DESC']],
        include: [
            {
                model: Exercises,
                association: new HasOne(Exercises, Submissions, {foreignKey: 'exercise_id'}),
                attributes: ['title']
            },
        ]});

        res.status(200)
        if(submissions==null || submissions==undefined) {
            res.json([])
        } else {
            const arrayUniqueByKey = [...new Map(submissions.map(item =>
                [item['exercise_id'], item])).values()];
            res.send(arrayUniqueByKey)
        }

})

app.get('/submissions/unfinished', async (req, res) => {

    if(req.cookies.userID==null || req.cookies.userID==undefined) {
        res.status(400)
        res.send('Bad request')
        return
    }
    
    const submissions = await Submissions.findAll({
        //where: { user_id: req.cookies.userID, status: "FAIL"},
        //where: Sequelize.literal("(posts.id NOT IN (SELECT R.postId FROM Rating R WHERE R.userId="+userId+"))"),
        where: Sequelize.literal('("submissions"."exercise_id" not in (select "submissions"."exercise_id" from "submissions" where "submissions"."user_id"=\''+req.cookies.userID+'\' and "submissions"."status"=\'PASS\') AND "submissions"."user_id"=\''+req.cookies.userID+'\' AND ("submissions"."status"=\'FAIL\' OR "submissions"."status"=\'ERROR\'))'),
        distinct: 'exercise_id',
        order: [
            ['exercise_id', 'ASC']],
        include: [
            {
                model: Exercises,
                association: new HasOne(Exercises, Submissions, {foreignKey: 'exercise_id'}),
                attributes: ['title']
            },
        ]});

        res.status(200)
        if(submissions==null || submissions==undefined) {
            res.json([])
        } else {
            const arrayUniqueByKey = [...new Map(submissions.map(item =>
                [item['exercise_id'], item])).values()];
            if(arrayUniqueByKey.length>3)
                res.send(arrayUniqueByKey.slice(0,3))
            else
                res.send(arrayUniqueByKey)
        }
    
    })

app.get('/submissions/grading', async (req, res) => {

    if(req.cookies.userID==null || req.cookies.userID==undefined) {
        res.status(400)
        res.send('Bad request')
        return
    }

    const submissions = await Submissions.findAll({
        where: { user_id: req.cookies.userID, status: {
            [Op.or]: ['GRADING', 'SUBMITTED']
          }},
        include: [
            {
                model: Exercises,
                association: new HasOne(Exercises, Submissions, {foreignKey: 'exercise_id'}),
                attributes: ['title']
            },
        ]});

     res.status(200)
     if(submissions==null || submissions==undefined) {
         res.json([])
     } else {
        const arrayUniqueByKey = [...new Map(submissions.map(item =>
            [item['exercise_id'], item])).values()];
        res.send(arrayUniqueByKey)
    }
})

app.get('/submissions/latest/:ex_id', async (req, res) => {

    var ex_id = req.params['ex_id']

    if(req.cookies.userID==null || req.cookies.userID==undefined || ex_id==null || ex_id==undefined) {
        res.status(400)
        res.send('Bad request')
        return
    }

    const submission = await Submissions.findOne({
        order: [
            ['createdAt', 'DESC']],
         where: { user_id: req.cookies.userID, exercise_id: ex_id},
         attributes: ['createdAt', 'status']
        });
 
     if(submission==null || submission==undefined) {
        res.status(404)
        res.send('Not found')
     } else {
        res.status(200)
        res.send(submission)
     }
})

async function connect_to_db(sequelize) {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    console.log('Trying to connect to database...')
    while(true) {
        try {
            var br = true;
            await delay(1000)
            await sequelize.authenticate()
            await sequelize.sync().catch((error) => {console.error('Unable to connect to the database. Retrying...', error); br=false}).then(()=>{console.log('Synced to database successfully.');})
            if(br==true)
                break
        } catch (error) {
            console.error('Unable to connect to the database. Retrying...', error);
        }
    }
}

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

async function populate_db() {
    Exercises.create({
            title: 'Sum of three values',
            description: 'Write a function int sum(int first, int second, int third) that returns the sum of the given integers. As an example, the function call sum(1, 2, 3) should return the value 6.',
        });
    Exercises.create({
            title: 'Sum with formula',
            description: 'Write a function String sumWithFormula(int first, int second) that returns the written out sum of the given integers and the sum. As an example, the function call sumWithFormula(1, 2) should return the string 1+2=3 and the function call sumWithFormula(1, 1) should return the string 1+1=2. Note! Do not add spaces to the returned string.',
        });
    Exercises.create({
            title: 'Budget check',
            description: 'Write a function String budgetCheck(double budget, double currentSpending) that returns information on whether a given budget is in order in light of given spending. If the value of currentSpending is larger than the value of budget, the function should return "Budget: Overspending". Otherwise, the function should return "Budget: OK".',
        });
    Exercises.create({
            title: 'Mystery function',
            description: 'Write a function String mystery(int number) that returns a string based on the number. If the number is divisible by 5, the function should return the string "mys". If the number is divisible by 7, the function should return the string "tery". If the number is divisible by both 5 and 7, the function should return the string "mystery". Otherwise, the function should return a string representation of the given number, e.g. if the number is 1, the function should return "1".',
        });

    Exercises.create({
        title: 'Sum of negative numbers',
        description: 'Write a function int sumOfNegatives(List<int> numbers) that returns the sum of the negative numbers in the given list. For example, if the numbers list would contain the numbers -1, 2, -4, the function should return the value -5.',
    });

    Exercises.create({
        title: 'Average of positives',
        description: 'Write a function double averageOfPositives(List<int> numbers) that returns the average value of the positive numbers on the list. If there are no positive values, the function should return the value -1.',
    });

    Exercises.create({
        title: 'Team',
        description: 'Create a class Team and implement the two following constructors (and necessary properties) to the class. The default constructor should have three properties: (1) the name of the team (String), (2) the home town of the team (String), and (3) the year the team was formed (int). The named constructor nameAndYear should have two properties: (1) the name of the team (String) and (2) the year the team was formed (int). In the case of the named constructor, the home town of the team must be "Unknown". \
        <br>Once completed, add a toString method to the class which leads to outputs outlined by the following examples. \
        <br>final hjk = Team("HJK", "Helsinki", 1907); \
        <br>print(hjk); \
        <br>final secret = Team.nameAndYear("Secret", 1984); \
        <br>print(secret); \
        <br>With the code above, the output should be as follows. \
        <br><br>HJK (Helsinki, 1907) \
        <br>Secret (Unknown, 1984)',
    });

    Exercises.create({
        title: 'Video and playlist',
        description: 'Implement the classes Video and Playlist as follows. The class Video should have a name (String), a duration in seconds (int), a constructor with named arguments, and a toString method. The default name should be "Unknown" and the default length should be 0. The class should work as follows. \
        <br><br>print(Video(name: "One second clip", duration: 1)); \
        <br>print(Video(name: "Hello again!", duration: 84)); \
        <br>With the code above, the output should be as follows. \
        <br><br>One second clip (1 second) \
        <br>Hello again! (84 seconds) \
        <br>The class Playlist should contain a list of videos, provide a default (no argument) constructor, and offer the following methods: (1) void add(Video video) that adds a video to the playlist, (2) bool has(String name) that returns true if the list of videos contains a video with the given name, and (3) int duration() that returns the sum of durations of the videos in the playlist. The class should work as follows. \
        <br><br>final playlist = Playlist(); \
        <br>print(playlist.has("One second clip")); \
        <br>print(playlist.duration()); \
        <br>playlist.add(Video(name: "One second clip", duration: 1)); \
        <br>playlist.add(Video(name: "Hello again!", duration: 84)); \
        <br>print(playlist.has("One second clip")); \
        <br>print(playlist.duration()); \
        <br>With the code above, the output should be as follows. \
        <br><br>false \
        <br>0 \
        <br>true \
        <br>85',
    });

}

