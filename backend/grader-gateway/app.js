import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";
import { grade } from "./grade.js";

const router = new Router();
router.get("/", (context) => {
  context.request.
  context.response.body = 'PASS';
});

router.post("/", async (context) => {
    const body = context.request.body();
    if (body.type === "form-data") {
      console.log('Received grading request')
      const value = body.value;
      const formData = await value.read();
      const result = await grade(formData.fields['code']);
      console.log('Sending grading result')
      context.response.body = result;
    }
});

const app = new Application();
app.use(
  oakCors({
    origin: '*',
    optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
  }),
);
app.use(router.routes());

console.info("CORS-enabled web server listening on port 7777");
await app.listen({ port: 7777 });