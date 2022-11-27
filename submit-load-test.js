import http from 'k6/http';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

const BASE_URL = 'http://localhost:5002';

export const options = {
  duration: "10s",
  vus: 10,
  summaryTrendStats : ["avg", "med", "p(95)", "p(99)"],
  summaryTimeUnit: 'ms'
};

export default () => {

  http.post(`${BASE_URL}/submissions`, 
  JSON.stringify({
    exercise_id: randomIntBetween(1, 8),
    code: 'http://'+randomIntBetween(1, 2000)
  }), 
  {
    headers: { 'Content-Type': 'application/json' },
    cookies: {
      userID: randomIntBetween(1, 10),
    },
  })

};