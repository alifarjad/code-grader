# Scalable code grader 
## Code grader
The system consists of four software services: the database, the web server, the code grading service and the worker service. While the first two are self explanatory, the last two are the heart of the system since they have the job to keep grading everything that is in the queue (namely the submission marked as 'SUBMITTED') even if the webserver is down. The code grading service is a rest api that simply receives some code and grades it using the docker image provided by the course. The worker on the other hand keeps seeking for submissions to grade and basically checks if the fingerprint of the code for the specific exercise has already been graded (Cache mechanism) otherwise it sends a rest request to the grading service (called grader-gateway). Since i the grading service spawns a container for every request, i had to limit the worker to only have 5 calls at a time. The worker has a polling rate of 5 seconds in order to not overload the host CPU.

The implementation of the web server is done in NodeJS using Express, meanwhile the grading service is using Deno with the STD libraries . The server serves on the address `http://localhost:5002` and has the following endpoints:
- `GET /` Serves the webpage.
- `GET/exercises` Returns the current exercise available to the user.sssssssssssssssssss
- `GET /exercises/:id` Returns the details for a specific exercise, given its id.
- `POST /submissions` Allows to post a code submission in order to receive a grade, it outputs a simple text indicating whether the resource was created or not. Th The following is an example of a request and response:
    ```
    {
        "exercise_id" : 1
        "code" : "print('Hello world')"
    }
    
    created
    ```
- `GET /submissions/finished` Returns all the exercises considered finish (With result PASS) for the current user
- `GET /submissions/unfinished` Returns all the exercises considered unfinished (With result FAIL or ERROR) for the current user
- `GET /submissions/grading` Returns all the exercises in grading for the current user

The last four endpoints use a cookie ('userID') that is transmitted automatically for every request to track the current user.
The webpace currently is super simple and gives you a list of the available exercises, finished exercises, unfinished exercises and exercises that are being graded. Clicking on an exercise will display and editor and a text area where to enter code. After clicking on the submit button there shoul a small status message with a loading icon to indicate that the system is processing the submission. 

## How to run
To run the servers you need to install Docker, the version used at development time was `20.10.18, build b40c2f6`. Since the grading services needs to use the grader-image, you should build that before running the system.
Go in the projects folder

    # Build the grading-image (NECESSARY before next step)
    cd backend/grader-image
    docker build -t grader-image .
    # To run
    cd backend/
    docker compose build
    docker compose up 
    # To stop
    cd backend/
    docker compose down
    docker compose kill (if the one above does not work)
    ```

If you have a powerful machine i suggest you to go in the `backend/worker/worker.js` file and increase the `MAX_CONTAINERS` in order to allow more containers to be made. You should also decrease `REFRESH_RATE` in order to have a more reactive worker (`REFRESH_RATE` is basically the amount of ms the worker sleeps between each search)

## Testing
To test the application you need to install k6 in order to run the scripts. In order to run the tests you need to be in the project directory with the application running.

For `GET /` run `k6 run index-load-test.js`
For `POST /submissions` run `k6 run submit-load-test.js`

## Results
### Results for 10 users in a span of 10 seconds
|           |   avg  |   med  |   p(95) | p(99) |
| --------- | ------ | ------ | ------- | ----- |
| /     | 1338.203466 r/s | 6.79ms | 11.94ms | 17.06ms |
| /submissions| 344.793972 r/s | 24.76ms | 48.30ms |67.54ms |
### Core web vitals score (lighthouse)

| Performance | Accessibility | Best practices | SEO |
| ----------- | ------------- | -------------- | --- |
| 100 | 55 | 83 | 67 |

## Current performance and future improvements
The application is quite performant since it can handle a lot of submission using the queuing system and the heavy work is assigned to the worker and grading system. One limitation i found using Node is that to keep track of the current workers and handle the increments and decrements atomically i had to use a dedicated table on the database. The overhead is not noticible in this case since PostgreSQL is quite performant but it might be a problem if this needs to be scaled to hundred thousand concurrent users. I would choose a better language suited to handle concurrency well and still have good performance (eg Rust). The reason the web server is fast at submissions is because it's only job is to save it on a database.
To improve the performance of the system overall i would suggest to have more instances of the worker. The current design actually supports it, the only limitation would be how to reduce the bottleneck from the grading system, since container based grading isn't the most performing solution in my opinion. Another alternative would be message brokers as intermediaries between the webserver, workers and grading systems since it would allow the request be evenly distributed across different instances. One last topic i want to discuss is the fact that the system currently isn't fair to every users, in a load scenario the last user would have to wait the most. For a future improvement the queing system could be optimized by designing it also on fairness of access.

