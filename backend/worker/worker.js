const { Sequelize, Model, DataTypes } = require('sequelize');

const REFRESH_RATE = 1000
const MAX_CONTAINERS = 5

const sequelize = new Sequelize('postgres://express:express@postgresnode:5432/express', {
    logging: false,
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
    

const ContainersCounter = sequelize.define('containers_counter', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        count: Sequelize.INTEGER,
        }, {indexes: [
            {
                unique: true,
                fields: ['id']
            }]}
        );

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

async function incrementContainers() {
    const t = await sequelize.transaction();
    try {
        const containers = await ContainersCounter.findOne({
            where: { id: 0 },
            lock: true,
            transaction: t
        });

        await ContainersCounter.update({ count: containers.count+1},{
            where: { id: 0 },
            lock: true,
            transaction: t 
        });

        await t.commit();

    } catch (error) {
        console.log(error)
        await t.rollback();
    }
}

async function getContainers() {
    const t = await sequelize.transaction();
    try {
        const containers = await ContainersCounter.findOne({
            where: { id: 0 },
            lock: true,
            transaction: t
        });

        const re = containers.count

        await t.commit();

        return re
    } catch (error) {
        console.log(error)
        await t.rollback();
    }
}

async function decrementContainers() {
    const t = await sequelize.transaction();
    try {
        const containers = await ContainersCounter.findOne({
            where: { id: 0 },
            lock: true,
            transaction: t
        });

        await ContainersCounter.update({ count: containers.count-1},{
            where: { id: 0 },
            lock: true,
            transaction: t 
        });

        await t.commit();

    } catch (error) {
        console.log(error)
        await t.rollback();
    }
}



async function main() {
    console.log('Grading worker started ' + await getContainers())
    while(true) {
        await sleep(REFRESH_RATE)
        console.log('Container use: ['+await getContainers()+'/'+MAX_CONTAINERS+']')
        if(await getContainers() < MAX_CONTAINERS) {
            //Search for submissions
            const submissions = await Submissions.findAll({
                where: { status: 'SUBMITTED'},
                limit: MAX_CONTAINERS - await getContainers()});
            //Deploy thread that starts the container and waits for it to shut down
            if(submissions==undefined || submissions==null) {
                submissions = []
            }
            submissions.forEach(async (submission) => {
                var code = submission.code
                var exercise_id = submission.exercise_id
                var code_hash = submission.code_hash
                const cached_submission = await SubmissionResults.findOne({
                    where : { exercise_id : exercise_id, code_hash : code_hash}
                })
                //Case we have a cached submission
                if(cached_submission!=null && cached_submission!=undefined) {
                    console.log('Cache hit. Updating ')
                    await Submissions.update( { status: cached_submission.status},
                    { where: {  code_hash: code_hash, 
                                exercise_id: exercise_id 
                            }
                    });
                }
                else {//Case we dont have a cached submission
                    //We put into GRADING every submission that has the same code hash and exercise id
                    await Submissions.update( { status: 'GRADING'},
                    { where: {  code_hash: code_hash, 
                                exercise_id: exercise_id 
                            }
                    });
                    try {
                        await incrementContainers()
                        const formData = new FormData()
                        formData.append('code', code);
                        let result = await fetch('http://grader-gateway:7777/',
                        {
                            body: formData,
                            method: 'post'
                        });
                        if(result.ok) {
                            let result_body = await result.text()
                            //Save results in cache and update every submission that has (exercise_id, code_hash)
                            await SubmissionResults.findOrCreate({
                                where : { exercise_id : exercise_id, code_hash : code_hash, status: result_body}
                            })
                            await Submissions.update( { status: result_body},
                                                { where: {  code_hash: code_hash, 
                                                            exercise_id: exercise_id 
                                                        }
                                                });
                        }
                    } catch(error) {
                        console.log("error while contacting the grader gateway - " + error);
                    } finally {
                        decrementContainers()
                    }
                }
            })
        } else {
            console.log('Max container reached, waiting...')
        }
    }
}

connect_to_db(sequelize).then(async ()=>{
    await ContainersCounter.findOrCreate({
        where: { id: 0, count: 0 }
    });
    console.log("Finished setting up DB.")
    main()
}).catch(()=>{console.log("Error")})
